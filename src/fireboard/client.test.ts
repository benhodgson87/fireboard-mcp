import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logs = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("../logger", () => ({ default: logs }));

const device = {
  uuid: "synthetic-device",
  id: 1,
  title: "Grill",
  channels: [],
  last_battery_reading: null,
  last_drivelog: null,
};
const fetcher = vi.fn<typeof fetch>();
let api: typeof import("./client");

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("PUBLIC_DOMAIN", "mcp.example");
  vi.stubEnv("FIREBOARD_API_BASE", "https://fireboard.example/api/v1");
  vi.stubEnv("FIREBOARD_CACHE_TTL_MS", "120000");
  api = await import("./client");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Fireboard client adapter", () => {
  it("retains per-token caching, concurrent sharing, and MCP cache metadata", async () => {
    fetcher.mockImplementation(async () => Response.json([device]));

    const [first, concurrent] = await Promise.all([
      api.fetchDevices("token-one"),
      api.fetchDevices("token-one"),
    ]);
    const cached = await api.fetchDevices("token-one");
    await api.fetchDevices("token-two");

    expect(first).toEqual({
      data: [device],
      fromCache: false,
      cacheAgeSeconds: 0,
    });
    expect(concurrent).toEqual(first);
    expect(cached).toMatchObject({ data: [device], fromCache: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Authorization: "Token token-one",
        "User-Agent": "fireboard-mcp/1.0.0 (https://mcp.example)",
      },
      redirect: "error",
    });
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: "Token token-two",
    });
  });

  it("passes the cache-disable configuration to the package", async () => {
    vi.stubEnv("FIREBOARD_CACHE_TTL_MS", "0");
    fetcher.mockImplementation(async () => Response.json([]));

    const first = await api.fetchDevices("token-one");
    const second = await api.fetchDevices("token-one");

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("maps empty Drive logs to the MCP null response", async () => {
    fetcher.mockResolvedValueOnce(Response.json({}));

    expect(await api.fetchDriveLog("token-one", "synthetic-device")).toBeNull();
  });

  it("routes login and session reads through the package without extra calls", async () => {
    const session = {
      id: 42,
      title: "Cook",
      description: "",
      start_time: "2026-01-01T00:00:00Z",
      end_time: null,
      devices: [],
      notes: [],
    };
    fetcher
      .mockResolvedValueOnce(Response.json({ key: "synthetic-token" }))
      .mockResolvedValueOnce(Response.json([session]))
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json([]));

    expect(
      await api.loginFireboard({
        username: "synthetic-user",
        password: "synthetic-password",
      }),
    ).toBe("synthetic-token");
    expect(await api.fetchSessions("synthetic-token")).toEqual([session]);
    expect(await api.fetchSessionDetail("synthetic-token", 42)).toEqual(
      session,
    );
    expect(await api.fetchSessionChart("synthetic-token", 42, true)).toEqual(
      [],
    );

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://fireboard.io/api/rest-auth/login/",
      "https://fireboard.example/api/v1/sessions.json",
      "https://fireboard.example/api/v1/sessions/42.json",
      "https://fireboard.example/api/v1/sessions/42/chart.json?drive=1",
    ]);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      "User-Agent": "fireboard-mcp/1.0.0 (https://mcp.example)",
    });
  });

  it.each([
    [401, "Invalid Fireboard token. Check your API key.", "warn"],
    [
      429,
      "Fireboard REST API rate limit reached (17 calls / 5 min). Further requests are blocked for ~5 minutes. See: https://docs.fireboard.io/app/app-api/#rate-limits",
      "warn",
    ],
    [503, "Fireboard API unavailable. Try again shortly.", "error"],
  ] as const)(
    "preserves HTTP %s messages and logging without credentials",
    async (status, message, level) => {
      fetcher.mockResolvedValueOnce(
        Response.json({ confidential: "sensitive" }, { status }),
      );

      await expect(
        api.fetchSessions("synthetic-private-token"),
      ).rejects.toThrow(message);

      expect(logs[level]).toHaveBeenCalledOnce();
      expect(JSON.stringify(logs[level].mock.calls)).not.toContain(
        "synthetic-private-token",
      );
      expect(JSON.stringify(logs[level].mock.calls)).not.toContain("sensitive");
    },
  );

  it("logs response validation failures without the response body", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ sensitive: "account-data" }));

    await expect(api.fetchSessions("synthetic-token")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });

    expect(logs.error).toHaveBeenCalledWith("fireboard response parse error", {
      path: "/sessions.json",
    });
  });
});
