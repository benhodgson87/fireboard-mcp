import { z } from 'zod'

const driveStatusSchema = z.object({
  setpoint: z.number(),
  drive_percent: z.number(),
  mode: z.string(),
  tied_to_channel: z.number(),
  unit: z.string(),
  as_of: z.string(),
})

const channelReadingSchema = z.object({
  label: z.string(),
  temp: z.number(),
  unit: z.string(),
  as_of: z.string(),
})

const noteSchema = z.object({
  time: z.string(),
  text: z.string(),
  channel: z.number().nullable(),
  device_uuid: z.string(),
})

const chartChannelSchema = z.object({
  device_uuid: z.string(),
  label: z.string(),
  unit: z.string(),
  readings: z.array(z.object({ t: z.string(), temp: z.number() })),
})

export const listDevicesOutputSchema = {
  devices: z.array(
    z.object({
      uuid: z.string(),
      title: z.string(),
      channel_count: z.number(),
      last_drive: driveStatusSchema.optional(),
    }),
  ),
  from_cache: z.boolean(),
  cache_age_seconds: z.number(),
}

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
}

export const getDriveStatusOutputSchema = {
  device_uuid: z.string(),
  drive: driveStatusSchema.nullable(),
}

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
}

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
}

export const getSessionChartOutputSchema = {
  channels: z.array(chartChannelSchema),
}

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
}
