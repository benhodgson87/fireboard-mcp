import {
  type DriveLog,
  type DriveSetpointOptions,
  FireboardClient,
  FireboardError,
  login,
} from "fireboard-api-client";
import { name, version } from "../config";
import logger from "../logger";
import { maskUuid } from "../utils";

export type { DeviceListResult } from "fireboard-api-client";
const clients = new Map<string, FireboardClient>();

function userAgent(): string {
  const domain = process.env.PUBLIC_DOMAIN;
  return domain
    ? `${name}/${version} (https://${domain})`
    : `${name}/${version}`;
}

function client(token: string): FireboardClient {
  let existing = clients.get(token);

  if (!existing) {
    existing = new FireboardClient({
      token,
      baseUrl: process.env.FIREBOARD_API_BASE ?? "https://fireboard.io/api/v1",
      deviceCacheTtlMs: Number(process.env.FIREBOARD_CACHE_TTL_MS ?? 120_000),
      userAgent: userAgent(),
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
      if (error.code === "AUTHENTICATION") {
        logger.warn("fireboard auth failed", { path });
      } else if (error.code === "RATE_LIMIT") {
        logger.warn("fireboard rate limit hit", { path });
      } else if (error.code === "INVALID_RESPONSE") {
        logger.error("fireboard response parse error", { path });
      } else {
        logger.error("fireboard api error", { path, status: error.status });
      }

      if (error.code === "API_UNAVAILABLE") {
        throw new Error("Fireboard API unavailable. Try again shortly.");
      }
    }

    throw error;
  }
}

export function loginFireboard(credentials: {
  username: string;
  password: string;
}) {
  return login(credentials, {
    userAgent: userAgent(),
    fetch: (input, init) => fetch(input, init),
  });
}

export function fetchDevices(token: string) {
  return logged("/devices.json", () => client(token).getDevicesWithCache());
}

export function fetchDriveLog(token: string, deviceUuid: string) {
  return logged(`/devices/${maskUuid(deviceUuid)}/drivelog.json`, async () => {
    const log = await client(token).getDriveLog(deviceUuid);
    return Object.keys(log).length === 0 ? null : (log as DriveLog);
  });
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

export function setDriveSetpoint(
  token: string,
  deviceUuid: string,
  options: DriveSetpointOptions,
) {
  return logged(`/devices/${maskUuid(deviceUuid)}/mq.json`, () =>
    client(token).setDriveSetpoint(deviceUuid, options),
  );
}

export function setDriveSpeed(
  token: string,
  deviceUuid: string,
  percent: number,
) {
  return logged(`/devices/${maskUuid(deviceUuid)}/mq.json`, () =>
    client(token).setDriveSpeed(deviceUuid, percent),
  );
}

export function setDriveOff(token: string, deviceUuid: string) {
  return logged(`/devices/${maskUuid(deviceUuid)}/mq.json`, () =>
    client(token).setDriveOff(deviceUuid),
  );
}
