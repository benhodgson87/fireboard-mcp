import {
  type DriveControlPayload,
  FireboardClient,
  FireboardError,
} from "fireboard-api-client";
import { name, version } from "../config";
import logger from "../logger";
import { maskUuid } from "../utils";

export type { DeviceListResult } from "fireboard-api-client";
const clients = new Map<string, FireboardClient>();

function client(token: string): FireboardClient {
  let existing = clients.get(token);
  if (!existing) {
    const domain = process.env.PUBLIC_DOMAIN;
    existing = new FireboardClient({
      token,
      baseUrl: process.env.FIREBOARD_API_BASE ?? "https://fireboard.io/api/v1",
      deviceCacheTtlMs: Number(process.env.FIREBOARD_CACHE_TTL_MS ?? 120_000),
      userAgent: domain
        ? `${name}/${version} (https://${domain})`
        : `${name}/${version}`,
      fetch: (input, init) => fetch(input, init),
    });
    clients.set(token, existing);
  }
  return existing;
}

async function logged<T>(
  path: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof FireboardError) {
      if (error.code === "AUTHENTICATION")
        logger.warn("fireboard auth failed", { path });
      else if (error.code === "RATE_LIMIT")
        logger.warn("fireboard rate limit hit", { path });
      else if (error.code === "INVALID_RESPONSE")
        logger.error("fireboard response parse error", { path });
      else logger.error("fireboard api error", { path, status: error.status });
    }
    throw error;
  }
}

export function fetchDevices(token: string) {
  return logged("/devices.json", () => client(token).getDevices());
}
export function fetchDriveLog(token: string, deviceUuid: string) {
  return logged(`/devices/${maskUuid(deviceUuid)}/drivelog.json`, () =>
    client(token).getDriveLog(deviceUuid),
  );
}
export function fetchSessions(token: string) {
  return logged("/sessions.json", () => client(token).getSessions());
}
export function fetchSessionDetail(token: string, sessionId: number) {
  return logged(`/sessions/${sessionId}.json`, () =>
    client(token).getSessionDetail(sessionId),
  );
}
export function fetchSessionChart(
  token: string,
  sessionId: number,
  includeDrive: boolean,
) {
  return logged(`/sessions/${sessionId}/chart.json`, () =>
    client(token).getSessionChart(sessionId, includeDrive),
  );
}
export function controlDrive(
  token: string,
  deviceUuid: string,
  payload: DriveControlPayload,
) {
  return logged(`/devices/${maskUuid(deviceUuid)}/mq.json`, () =>
    client(token).controlDrive(deviceUuid, payload),
  );
}
