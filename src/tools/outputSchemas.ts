import { z } from "zod";

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
});

const driveStatusSchema = z.object({
  setpoint: z.number(),
  drive_percent: z.number(),
  mode: z.string(),
  tied_to_channel: z.number(),
  tied_to_channel_label: z.string().optional(),
  unit: z.string(),
  as_of: z.string(),
});

const channelReadingSchema = z.object({
  label: z.string(),
  temp: z.number(),
  unit: z.string(),
  as_of: z.string(),
  alerts: z.array(alertSchema),
});

const noteSchema = z.object({
  time: z.string(),
  text: z.string(),
  channel: z.number().nullable(),
  device_uuid: z.string(),
});

const chartChannelSchema = z.object({
  device_uuid: z.string(),
  label: z.string(),
  unit: z.string(),
  readings: z.array(z.object({ t: z.string(), temp: z.number() })),
});

export const listDevicesOutputSchema = {
  devices: z.array(
    z.object({
      uuid: z.string(),
      id: z.number(),
      title: z.string(),
      model_name: z.string().optional(),
      channel_count: z.number(),
      battery: z.number().optional(),
      last_drive: driveStatusSchema.optional(),
    }),
  ),
  from_cache: z.boolean(),
  cache_age_seconds: z.number(),
};

export const getRealtimeTempsOutputSchema = {
  devices: z.array(
    z.object({
      uuid: z.string(),
      title: z.string(),
      channels: z.array(channelReadingSchema),
      last_drive: driveStatusSchema.optional(),
    }),
  ),
  from_cache: z.boolean(),
  cache_age_seconds: z.number(),
};

export const getDriveStatusOutputSchema = {
  device_uuid: z.string(),
  drive: driveStatusSchema.nullable(),
};

export const listSessionsOutputSchema = {
  sessions: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      description: z.string(),
      start: z.string(),
      end: z.string().nullable(),
      in_progress: z.boolean(),
      device_uuids: z.array(z.string()),
    }),
  ),
  limit_applied: z.number(),
};

export const getSessionDetailOutputSchema = {
  id: z.number(),
  title: z.string(),
  description: z.string(),
  start: z.string(),
  end: z.string().nullable(),
  in_progress: z.boolean(),
  duration_minutes: z.number(),
  devices: z.array(z.object({ uuid: z.string(), title: z.string() })),
  channels: z.array(z.object({ label: z.string(), device_uuid: z.string() })),
  notes: z.array(noteSchema),
};

export const getSessionChartOutputSchema = {
  channels: z.array(chartChannelSchema),
};

export const driveControlOutputSchema = {
  success: z.boolean(),
};

export const getAllSessionDataOutputSchema = {
  session: z.object({
    id: z.number(),
    title: z.string(),
    description: z.string(),
    start: z.string(),
    end: z.string().nullable(),
    in_progress: z.boolean(),
  }),
  channels: z.array(chartChannelSchema),
  notes: z.array(noteSchema),
};
