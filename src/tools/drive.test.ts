import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getDriveStatusOutputSchema } from "./outputSchemas";

type Handler = (args: Record<string, unknown>) => Promise<CallToolResult>;
const handlers = new Map<string, Handler>();
const fetcher = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.resetModules();
  handlers.clear();
  fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("FIREBOARD_CACHE_TTL_MS", "120000");
  const server = {
    registerTool: (name: string, _options: unknown, handler: Handler) =>
      handlers.set(name, handler),
  } as unknown as McpServer;
  const { registerDriveTools } = await import("./drive");
  registerDriveTools(server, "synthetic-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function call(name: string, args: Record<string, unknown>) {
  const handler = handlers.get(name);
  if (!handler) throw new Error("Tool was not registered");
  return handler(args);
}

describe("Drive tool integration", () => {
  it("returns the declared null Drive output when Fireboard has no recent log", async () => {
    fetcher.mockImplementation(async (url) =>
      Response.json(String(url).endsWith("devices.json") ? [] : {}),
    );

    const result = await call("get_drive_status", {
      device_uuid: "synthetic-device",
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      device_uuid: "synthetic-device",
      drive: null,
    });
    expect(
      z.object(getDriveStatusOutputSchema).parse(result.structuredContent),
    ).toEqual(result.structuredContent);
  });

  it("preserves control payloads and success responses through the explicit package methods", async () => {
    fetcher.mockImplementation(async () => new Response(null, { status: 204 }));

    const results = [
      await call("set_drive_setpoint", {
        device_uuid: "synthetic-device",
        setpoint: 110,
        channel: 2,
      }),
      await call("set_drive_speed", {
        device_uuid: "synthetic-device",
        percent: 50,
      }),
      await call("set_drive_off", { device_uuid: "synthetic-device" }),
    ];

    expect(results.map((result) => result.structuredContent)).toEqual([
      { success: true },
      { success: true },
      { success: true },
    ]);
    expect(
      fetcher.mock.calls.map(
        ([, init]) => JSON.parse(init?.body as string).payload,
      ),
    ).toEqual([
      { cc: "2", request_type: "control" },
      { t: "fan", setpoint: "110", request_type: "control" },
      { t: "fan", p: "0.5", request_type: "control" },
      { t: "fan", setpoint: "0", request_type: "control" },
    ]);
  });

  it("validates a combined control request before making any write", async () => {
    const result = await call("set_drive_setpoint", {
      device_uuid: "synthetic-device",
      setpoint: 110,
      channel: 0,
    });

    expect(result.isError).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
