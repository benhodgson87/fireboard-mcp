import { z } from "zod";

// Unused channel slots on a device may omit degreetype or send null.
// Drive logs and chart channels always include it — use z.number() directly there.
const nullableDegreeTypeSchema = z.number().nullable().optional();

// Represents a single drive controller log entry.
// Used both as a top-level response from GET /api/v1/devices/{uuid}/drivelog.json
// and nested inside device objects from GET /api/v1/devices.json.
//
// Example (GET /api/v1/devices/{uuid}/drivelog.json):
// {
//   "tiedchannel": 1,
//   "setpoint": 107.0,
//   "driveper": 0.0,
//   "modetype": "Off",      // can also be a number, e.g. 2
//   "degreetype": 1,
//   "created": "2024-01-01T12:00:00+00:00"
// }
const driveLogSchema = z.object({
  driveper: z.number(),
  setpoint: z.number(),
  modetype: z.union([z.string(), z.number()]), // string from /drivelog.json ("Off"), integer from /devices.json last_drivelog (2) — API inconsistency
  tiedchannel: z.number(),
  degreetype: z.number(),
  created: z.string(),
});

// Represents a temperature alert configured on a channel.
// Nested inside channel objects from GET /api/v1/devices.json.
const alertSchema = z.object({
  id: z.number(),
  temp_min: z.number(),
  temp_max: z.number(),
  notify_app: z.boolean(),
  notify_email: z.boolean(),
  notify_sms: z.boolean(),
  time_start: z.string(),
  time_stop: z.string(),
  minutes_buffer: z.number(),
  minutes_repeat: z.number(),
  enabled: z.boolean(),
  created: z.string(),
  channel: z.number(),
  device_id: z.number(),
  session_id: z.number(),
});

// Represents a single temperature probe channel on a device.
// Nested inside device objects from GET /api/v1/devices.json.
//
// Example channel entry:
// {
//   "channel": 1,
//   "channel_label": "Grill Temp",
//   "current_temp": 107.6,
//   "degreetype": 1,
//   "enabled": true,
//   "last_templog": {
//     "temp": 107.6,
//     "created": "2024-01-01T12:00:00Z",
//     "degreetype": 1
//   }
// }
const deviceChannelSchema = z.object({
  id: z.number(),
  channel: z.number(),
  channel_label: z.string(),
  current_temp: z.number().optional(),
  degreetype: nullableDegreeTypeSchema,
  enabled: z.boolean(),
  alerts: z.array(alertSchema).default([]),
  last_templog: z
    .object({
      temp: z.number(),
      created: z.string(),
      degreetype: nullableDegreeTypeSchema,
    })
    .nullable()
    .optional(),
});

// Represents a single Fireboard device.
// Used as an element in GET /api/v1/devices.json.
//
// Example (GET /api/v1/devices.json, first element):
// {
//   "uuid": "abc12345-0000-0000-0000-000000000000",
//   "title": "Big Green Egg",
//   "channel_count": 3,
//   "active": true,
//   "channels": [ ... ],          // see deviceChannelSchema
//   "last_drivelog": { ... }       // see driveLogSchema, null if no drive session
// }
export const deviceSchema = z.object({
  uuid: z.string(),
  id: z.number(),
  title: z.string(),
  channel_count: z.number(),
  channels: z.array(deviceChannelSchema),
  last_drivelog: driveLogSchema.nullable().optional(),
  active: z.boolean(),
  last_battery_reading: z.number().optional(),
  model_name: z.string().optional(),
});

// GET /api/v1/devices.json
// Returns all devices associated with the authenticated account.
//
// Example response (truncated):
// [
//   {
//     "uuid": "abc12345-0000-0000-0000-000000000000",
//     "title": "Big Green Egg",
//     "channel_count": 3,
//     "active": true,
//     "channels": [
//       { "channel": 1, "channel_label": "Grill Temp", "current_temp": 225.0, "degreetype": 1, "enabled": true,
//         "last_templog": { "temp": 225.0, "created": "2024-01-01T12:00:00Z", "degreetype": 1 } },
//       { "channel": 2, "channel_label": "Meat Temp", "current_temp": 145.0, "degreetype": 1, "enabled": true,
//         "last_templog": { "temp": 145.0, "created": "2024-01-01T12:00:00Z", "degreetype": 1 } }
//     ],
//     "last_drivelog": { "driveper": 0.0, "setpoint": 225.0, "modetype": 2, "tiedchannel": 1,
//                        "degreetype": 1, "created": "2024-01-01T12:00:02Z" }
//   }
// ]
export const devicesResponseSchema = z.array(deviceSchema);

// GET /api/v1/devices/{uuid}/drivelog.json
// Returns an array of recent drive controller log entries for a device.
// Note: the live endpoint currently returns a single object; this schema
// treats it as an array to support potential paginated/historical variants.
//
// Example element:
// {
//   "driveper": 0.0,
//   "setpoint": 225.0,
//   "modetype": "Off",
//   "tiedchannel": 1,
//   "degreetype": 1,
//   "created": "2024-01-01T12:00:00+00:00"
// }
export const driveLogResponseSchema = driveLogSchema;

// Represents a session summary as returned in the sessions list.
// Used as an element in GET /api/v1/sessions.json.
//
// Example session summary entry:
// {
//   "id": 12345678,
//   "title": "Sat Jan 1 Session",
//   "description": "Auto-created session",
//   "start_time": "2024-01-01T10:00:00Z",
//   "end_time": null,
//   "device_ids": ["abc12345-0000-0000-0000-000000000000"]
// }
const sessionSummarySchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  start_time: z.string(),
  end_time: z.string().nullable(),
  device_ids: z.array(z.string()),
});

// GET /api/v1/sessions.json
// Returns all cooking sessions for the authenticated account, most recent first.
//
// Example response (two entries shown):
// [
//   { "id": 12345678, "title": "Sat Jan 1 Session", "description": "Auto-created session",
//     "start_time": "2024-01-01T10:00:00Z", "end_time": null,
//     "device_ids": ["abc12345-0000-0000-0000-000000000000"] },
//   { "id": 12345677, "title": "Mon May 25: Pulled Pork",
//     "description": "User-initiated session",
//     "start_time": "2024-01-01T08:00:00Z", "end_time": "2024-01-01T20:00:00Z",
//     "device_ids": ["abc12345-0000-0000-0000-000000000000"] }
// ]
export const sessionsResponseSchema = z.array(sessionSummarySchema);

// Represents a single cook note attached to a session.
// Nested inside the notes array of a session detail response.
//
// Example:
// {
//   "note_time": "2024-01-01T12:00:00Z",
//   "note_text": "Added more fuel",
//   "channel": 2,       // null if not tied to a specific channel
//   "device": "abc12345-0000-0000-0000-000000000000"
// }
const noteSchema = z.object({
  note_time: z.string(),
  note_text: z.string(),
  channel: z.number().nullable(),
  device: z.string(),
});

// Represents a device summary nested inside a session detail response.
// Contains only the fields needed to identify the device and its channels.
const sessionDeviceSchema = z.object({
  uuid: z.string(),
  title: z.string(),
  channels: z.array(
    z.object({
      channel_label: z.string(),
      channel: z.number(),
    }),
  ),
});

// GET /api/v1/sessions/{id}.json
// Returns full detail for a single cooking session including devices and notes.
//
// Example (GET /api/v1/sessions/12345678.json):
// {
//   "id": 12345678,
//   "title": "Sat Jan 1 Session",
//   "description": "Auto-created session",
//   "start_time": "2024-01-01T10:00:00Z",
//   "end_time": null,
//   "devices": [
//     {
//       "uuid": "abc12345-0000-0000-0000-000000000000",
//       "title": "Big Green Egg",
//       "channels": [
//         { "channel": 1, "channel_label": "Grill Temp" },
//         { "channel": 2, "channel_label": "Meat Temp" },
//         { "channel": 3, "channel_label": "Channel 3" }
//       ]
//     }
//   ],
//   "notes": [
//     { "note_time": "2024-01-01T12:00:00Z", "note_text": "Added more fuel",
//       "channel": 2, "device": "abc12345-0000-0000-0000-000000000000" }
//   ]
// }
export const sessionDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  start_time: z.string(),
  end_time: z.string().nullable(),
  devices: z.array(sessionDeviceSchema),
  notes: z.array(noteSchema).default([]),
});

// Represents a single channel's time-series temperature data within a session.
// Used as an element in GET /api/v1/sessions/{id}/chart.json.
//
// x: array of Unix timestamps (seconds since epoch)
// y: array of temperature readings corresponding to each timestamp
//
// Example element:
// {
//   "device": "abc12345-0000-0000-0000-000000000000",
//   "label": "Grill Temp",
//   "degreetype": 1,
//   "channel_id": "1",
//   "x": [1704110400, 1704110460, ...],
//   "y": [225.0, 226.1, ...]
// }
export const chartChannelSchema = z.object({
  device: z.string(),
  label: z.string(),
  degreetype: z.number(),
  channel_id: z.coerce.string(),
  x: z.array(z.number()),
  y: z.array(z.number()),
});

// GET /api/v1/sessions/{id}/chart.json
// Returns time-series temperature data for all channels in a session.
// Each entry covers one channel; x and y arrays are parallel (same length).
//
// Example response (two channels, values truncated):
// [
//   { "device": "abc12345-0000-0000-0000-000000000000", "label": "Grill Temp",
//     "degreetype": 1, "channel_id": "1", "x": [1704110400, 1704110460], "y": [225.0, 226.1] },
//   { "device": "abc12345-0000-0000-0000-000000000000", "label": "Meat Temp",
//     "degreetype": 1, "channel_id": "2", "x": [1704110400, 1704110460], "y": [145.0, 145.3] }
// ]
export const chartResponseSchema = z.array(chartChannelSchema);

export type RawDevice = z.infer<typeof deviceSchema>;
export type RawAlert = z.infer<typeof alertSchema>;
export type RawSessionSummary = z.infer<typeof sessionSummarySchema>;
export type RawSessionDetail = z.infer<typeof sessionDetailSchema>;
export type RawChartChannel = z.infer<typeof chartChannelSchema>;
export type RawDriveLog = z.infer<typeof driveLogSchema>;
