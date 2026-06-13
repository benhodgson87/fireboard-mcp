import type { ZodTypeAny, z } from "zod";
import { name, version } from "../config";
import logger from "../logger";
import { maskUuid } from "../utils";
import {
  chartResponseSchema,
  devicesResponseSchema,
  driveLogResponseSchema,
  sessionDetailSchema,
  sessionsResponseSchema,
} from "./schemas";

const BASE = process.env.FIREBOARD_API_BASE ?? "https://fireboard.io/api/v1";
const CACHE_TTL_MS = Number(
  process.env.FIREBOARD_CACHE_TTL_MS ?? 2 * 60 * 1000,
);

type DeviceCache = {
  data: z.infer<typeof devicesResponseSchema>;
  fetchedAt: number;
};

const deviceCaches = new Map<string, DeviceCache>();

function userAgent(): string {
  const domain = process.env.PUBLIC_DOMAIN;
  return domain
    ? `${name}/${version} (https://${domain})`
    : `${name}/${version}`;
}

async function get<S extends ZodTypeAny>(
  token: string,
  path: string,
  schema: S,
): Promise<z.output<S>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Token ${token}`,
      "User-Agent": userAgent(),
    },
  });

  if (res.status === 401) {
    logger.warn("fireboard auth failed", { path });
    throw new Error("Invalid Fireboard token. Check your API key.");
  }
  if (res.status === 429) {
    logger.warn("fireboard rate limit hit", { path });
    throw new Error(
      "Fireboard REST API rate limit reached (17 calls / 5 min). Further requests are blocked for ~5 minutes. See: https://docs.fireboard.io/app/app-api/#rate-limits",
    );
  }
  if (!res.ok) {
    logger.error("fireboard api error", { path, status: res.status });
    throw new Error("Fireboard API unavailable. Try again shortly.");
  }

  const json = await res.json();
  try {
    return schema.parse(json);
  } catch (err) {
    logger.error("fireboard response parse error", {
      path,
      err: (err as Error).message,
    });
    throw err;
  }
}

export type DeviceListResult = {
  data: z.infer<typeof devicesResponseSchema>;
  fromCache: boolean;
  cacheAgeSeconds: number;
};

export async function fetchDevices(token: string): Promise<DeviceListResult> {
  const cached = deviceCaches.get(token);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      data: cached.data,
      fromCache: true,
      cacheAgeSeconds: Math.round((now - cached.fetchedAt) / 1000),
    };
  }

  const data = await get(token, "/devices.json", devicesResponseSchema);
  deviceCaches.set(token, { data, fetchedAt: now });
  return { data, fromCache: false, cacheAgeSeconds: 0 };
}

export async function fetchDriveLog(token: string, deviceUuid: string) {
  return get(
    token,
    `/devices/${deviceUuid}/drivelog.json`,
    driveLogResponseSchema,
  );
}

export async function fetchSessions(token: string) {
  return get(token, "/sessions.json", sessionsResponseSchema);
}

export async function fetchSessionDetail(token: string, sessionId: number) {
  return get(token, `/sessions/${sessionId}.json`, sessionDetailSchema);
}

export async function fetchSessionChart(
  token: string,
  sessionId: number,
  includeDrive: boolean,
) {
  const qs = includeDrive ? "?drive=1" : "";
  return get(
    token,
    `/sessions/${sessionId}/chart.json${qs}`,
    chartResponseSchema,
  );
}

export async function controlDrive(
  token: string,
  deviceUuid: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${BASE}/devices/${deviceUuid}/mq.json`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "User-Agent": userAgent(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: "device",
      payload: { request_type: "control", ...payload },
    }),
  });

  if (res.status === 401) {
    logger.warn("fireboard auth failed", {
      path: `/devices/${maskUuid(deviceUuid)}/mq.json`,
    });
    throw new Error("Invalid Fireboard token. Check your API key.");
  }
  if (res.status === 429) {
    logger.warn("fireboard rate limit hit", {
      path: `/devices/${maskUuid(deviceUuid)}/mq.json`,
    });
    throw new Error(
      "Fireboard REST API rate limit reached (17 calls / 5 min). Further requests are blocked for ~5 minutes. See: https://docs.fireboard.io/app/app-api/#rate-limits",
    );
  }
  if (!res.ok) {
    logger.error("fireboard api error", {
      path: `/devices/${maskUuid(deviceUuid)}/mq.json`,
      status: res.status,
    });
    throw new Error("Fireboard API unavailable. Try again shortly.");
  }
}
