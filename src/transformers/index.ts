import type {
  RawChartChannel,
  RawDevice,
  RawDriveLog,
  RawSessionDetail,
  RawSessionSummary,
} from '../fireboard/schemas.js'

export type DriveStatus = {
  setpoint: number
  drive_percent: number
  mode: string
  tied_to_channel: number
  unit: 'C' | 'F'
  as_of: string
}

export type DeviceSummary = {
  uuid: string
  title: string
  channel_count: number
  last_drive?: DriveStatus
}

export type DeviceWithTemps = {
  uuid: string
  title: string
  channels: ChannelReading[]
  last_drive?: DriveStatus
}

export type ChannelReading = {
  label: string
  temp: number
  unit: 'C' | 'F'
  as_of: string
}

export type Note = {
  time: string
  text: string
  channel: number | null
  device_uuid: string
}

export type SessionSummary = {
  id: number
  title: string
  description: string
  start: string
  end: string | null
  in_progress: boolean
  device_uuids: string[]
}

export type SessionDetail = {
  id: number
  title: string
  description: string
  start: string
  end: string | null
  in_progress: boolean
  duration_minutes: number
  devices: { uuid: string; title: string }[]
  channels: { label: string; device_uuid: string }[]
  notes: Note[]
}

export type SessionChart = {
  session: {
    id: number
    title: string
    description: string
    start: string
    end: string | null
    in_progress: boolean
  }
  channels: {
    device_uuid: string
    label: string
    unit: 'C' | 'F'
    readings: { t: string; temp: number }[]
  }[]
  notes: Note[]
}

function degreeUnit(degreetype: 1 | 2): 'C' | 'F' {
  return degreetype === 1 ? 'C' : 'F'
}

function durationMinutes(startTime: string, endTime: string | null): number {
  const start = new Date(startTime).getTime()
  const end = endTime ? new Date(endTime).getTime() : Date.now()
  return Math.round((end - start) / 60000)
}

function transformNotes(notes: RawSessionDetail['notes']): Note[] {
  return notes.map((n) => ({
    time: n.note_time,
    text: n.note_text,
    channel: n.channel,
    device_uuid: n.device,
  }))
}

export function transformDriveLog(log: RawDriveLog): DriveStatus {
  return {
    setpoint: log.setpoint,
    drive_percent: log.driveper,
    mode: String(log.modetype),
    tied_to_channel: log.tiedchannel,
    unit: degreeUnit(log.degreetype),
    as_of: log.created,
  }
}

export function transformDeviceSummary(device: RawDevice): DeviceSummary {
  return {
    uuid: device.uuid,
    title: device.title,
    channel_count: device.channel_count,
    ...(device.last_drivelog ? { last_drive: transformDriveLog(device.last_drivelog) } : {}),
  }
}

export function transformDeviceWithTemps(device: RawDevice): DeviceWithTemps {
  const channels = device.channels
    .filter((ch) => ch.current_temp !== undefined && ch.last_templog)
    .map((ch) => ({
      label: ch.channel_label,
      temp: ch.current_temp as number,
      unit: degreeUnit(ch.degreetype),
      as_of: ch.last_templog!.created,
    }))

  return {
    uuid: device.uuid,
    title: device.title,
    channels,
    ...(device.last_drivelog ? { last_drive: transformDriveLog(device.last_drivelog) } : {}),
  }
}

export function transformSessionSummary(session: RawSessionSummary): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    description: session.description,
    start: session.start_time,
    end: session.end_time,
    in_progress: session.end_time === null,
    device_uuids: session.device_ids,
  }
}

export function transformSessionDetail(session: RawSessionDetail): SessionDetail {
  return {
    id: session.id,
    title: session.title,
    description: session.description,
    start: session.start_time,
    end: session.end_time,
    in_progress: session.end_time === null,
    duration_minutes: durationMinutes(session.start_time, session.end_time),
    devices: session.devices.map((d) => ({ uuid: d.uuid, title: d.title })),
    channels: session.devices.flatMap((d) =>
      d.channels.map((ch) => ({ label: ch.channel_label, device_uuid: d.uuid })),
    ),
    notes: transformNotes(session.notes),
  }
}

export function transformSessionChart(
  session: RawSessionDetail,
  chart: RawChartChannel[],
): SessionChart {
  return {
    session: {
      id: session.id,
      title: session.title,
      description: session.description,
      start: session.start_time,
      end: session.end_time,
      in_progress: session.end_time === null,
    },
    channels: chart.map((ch) => ({
      device_uuid: ch.device,
      label: ch.label,
      unit: degreeUnit(ch.degreetype),
      readings: ch.x.map((t, i) => ({
        t: new Date(t * 1000).toISOString(),
        temp: ch.y[i],
      })),
    })),
    notes: transformNotes(session.notes),
  }
}
