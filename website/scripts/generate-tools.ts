import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/server';

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
      ? 'This tool reads Fireboard data.'
      : 'This tool changes your Fireboard Drive settings. Confirm the intended change before using it.';
    const example = examples[tool.name];
    const markdown = [
      '---',
      `title: ${tool.name}`,
      `sidebar: { order: ${index + 1} }`,
      '---',
      '',
      tool.description ?? '',
      '',
      usage,
      '',
      '## Input schema',
      '',
      '```json',
      JSON.stringify(tool.inputSchema, null, 2),
      '```',
      '',
      '## Output schema',
      '',
      '```json',
      JSON.stringify(tool.outputSchema, null, 2),
      '```',
      ...(example ? ['', '## Example response', '', '```json', JSON.stringify(example, null, 2), '```'] : []),
      ''
    ].join('\n');
    await writeFile(new URL(`${tool.name}.md`, directory), markdown);
  }
  console.log(`Generated documentation for ${tools.length} MCP tools without Fireboard requests.`);
} finally {
  await client.close();
  await server.close();
}
