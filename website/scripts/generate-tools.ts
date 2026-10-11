import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/server';

type Parameter = {
  type?: string | string[];
  description?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  enum?: unknown[];
  default?: unknown;
};

const inputExamples: Record<string, Record<string, unknown>> = {
  list_devices: {},
  get_realtime_temps: { device_title: 'Big Green Egg' },
  get_drive_status: { device_uuid: 'abc-123' },
  set_drive_setpoint: { device_uuid: 'abc-123', setpoint: 110, channel: 2 },
  set_drive_speed: { device_uuid: 'abc-123', percent: 50 },
  set_drive_off: { device_uuid: 'abc-123' },
  list_sessions: { limit: 20, in_progress_only: true },
  get_session_detail: { session_id: 42 },
  get_session_chart: { session_id: 42, include_drive: true },
  get_all_session_data: { session_id: 42, include_drive: true },
};

const apiUsage: Record<string, { calls: string; caching: string }> = {
  list_devices: { calls: '0–1 calls', caching: 'Cached · 2 min' },
  get_realtime_temps: { calls: '0–1 calls', caching: 'Cached · 2 min' },
  get_drive_status: { calls: '1–2 calls', caching: 'Partly cached' },
  set_drive_setpoint: { calls: '1–2 calls', caching: 'Not cached' },
  set_drive_speed: { calls: '1 call', caching: 'Not cached' },
  set_drive_off: { calls: '1 call', caching: 'Not cached' },
  list_sessions: { calls: '1 call', caching: 'Not cached' },
  get_session_detail: { calls: '1 call', caching: 'Not cached' },
  get_session_chart: { calls: '1 call', caching: 'Not cached' },
  get_all_session_data: { calls: '2 calls', caching: 'Not cached' },
};

function usageSummary(name: string): string[] {
  const usage = apiUsage[name];
  if (!usage) throw new Error(`Missing API usage documentation for ${name}`);
  return [
    '<div class="api-usage" aria-label="Fireboard API usage">',
    `<div class="api-usage-badges"><span class="api-cost">${usage.calls}</span><span class="api-cache">${usage.caching}</span></div>`,
    '</div>',
  ];
}

function cell(value: string): string {
  return value.replaceAll('|', '&#124;').replaceAll('\n', ' ');
}

function parameterTable(schema: { properties?: unknown; required?: string[] }): string[] {
  const properties = Object.entries((schema.properties ?? {}) as Record<string, Parameter>);
  if (!properties.length) return ['This tool takes no parameters.'];
  return [
    '| Parameter | Type | Required | Description |',
    '| --- | --- | --- | --- |',
    ...properties.map(([name, parameter]) => {
      const constraints = [
        parameter.minimum !== undefined ? `Minimum: ${parameter.minimum}.` : '',
        parameter.maximum !== undefined ? `Maximum: ${parameter.maximum}.` : '',
        parameter.exclusiveMinimum !== undefined ? `Greater than ${parameter.exclusiveMinimum}.` : '',
        parameter.exclusiveMaximum !== undefined ? `Less than ${parameter.exclusiveMaximum}.` : '',
        parameter.enum ? `Allowed values: ${parameter.enum.map(value => JSON.stringify(value)).join(', ')}.` : '',
        parameter.default !== undefined ? `Default: ${JSON.stringify(parameter.default)}.` : '',
      ].filter(Boolean).join(' ');
      const type = Array.isArray(parameter.type) ? parameter.type.join(' or ') : parameter.type ?? 'any';
      return `| \`${cell(name)}\` | ${cell(type)} | ${schema.required?.includes(name) ? 'Yes' : 'No'} | ${cell([parameter.description, constraints].filter(Boolean).join(' '))} |`;
    }),
  ];
}

function schemaDetails(label: string, schema: unknown): string[] {
  return ['<details>', `<summary>${label}</summary>`, '', '```json', JSON.stringify(schema, null, 2), '```', '', '</details>'];
}

const directory = new URL('../src/content/docs/tools/', import.meta.url);
const examples = JSON.parse(await readFile(new URL('./tool-examples.json', import.meta.url), 'utf8'));
const server = createMcpServer('documentation-only');
const client = new Client({ name: 'documentation-generator', version: '1.0.0' });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
try {
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  await mkdir(directory, { recursive: true });
  for (const [index, tool] of tools.entries()) {
    const usage = tool.annotations?.readOnlyHint
      ? ''
      : 'This tool changes your Fireboard Drive settings. Confirm the intended change before using it.';
    const example = examples[tool.name];
    const markdown = [
      '---',
      `title: ${tool.name}`,
      `sidebar: { order: ${index + 1} }`,
      '---',
      '',
      ...usageSummary(tool.name),
      '',
      tool.description ?? '',
      '',
      ...(usage ? [usage, ''] : []),
      '## Parameters',
      '',
      ...parameterTable(tool.inputSchema),
      '',
      '## Example input',
      '',
      '```json',
      JSON.stringify(inputExamples[tool.name] ?? {}, null, 2),
      '```',
      '',
      ...schemaDetails('Full input JSON Schema', tool.inputSchema),
      '',
      ...(example ? ['', '## Example response', '', '```json', JSON.stringify(example, null, 2), '```'] : []),
      '',
      ...schemaDetails('Full output JSON Schema', tool.outputSchema),
      ''
    ].join('\n');
    await writeFile(new URL(`${tool.name}.md`, directory), markdown);
  }
  console.log(`Generated documentation for ${tools.length} MCP tools without Fireboard requests.`);
} finally {
  await client.close();
  await server.close();
}
