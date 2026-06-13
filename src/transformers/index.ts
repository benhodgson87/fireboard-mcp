import type {
  RawAlert,
  RawChartChannel,
  RawDevice,
  RawDriveLog,
  RawSessionDetail,
  RawSessionSummary,
} from "../fireboard/schemas";

export type DriveStatus = {
  setpoint: number;
  drive_percent: number;
  mode: string;
  tied_to_channel: number;
  tied_to_channel_label?: string;
  unit: string;
  as_of: string;
};

export type Alert = {
  id: number;
  temp_min: number;
  temp_max: number;
  notify_app: boolean;
  notify_email: boolean;
  notify_sms: boolean;
  time_start: string;
  time_stop: string;
  minutes_buffer: number;
  minutes_repeat: number;
  enabled: boolean;
};

export type DeviceSummary = {
  uuid: string;
  id: number;
  title: string;
  model_name?: string;
  channel_count: number;
  battery?: number;
  last_drive?: DriveStatus;
};

export type DeviceWithTemps = {
  uuid: string;
  title: string;
  channels: ChannelReading[];
  last_drive?: DriveStatus;
};

export type ChannelReading = {
  label: string;
  temp: number;
  unit: string;
  as_of: string;
  alerts: Alert[];
};

export type Note = {
  time: string;
  text: string;
  channel: number | null;
  device_uuid: string;
};

export type SessionSummary = {
  id: number;
  title: string;
  description: string;
  start: string;
  end: string | null;
  in_progress: boolean;
  device_uuids: string[];
};

export type SessionDetail = {
  id: number;
  title: string;
  description: string;
  start: string;
  end: string | null;
  in_progress: boolean;
  duration_minutes: number;
  devices: { uuid: string; title: string }[];
  channels: { label: string; device_uuid: string }[];
  notes: Note[];
};

export type ChartChannel = {
  device_uuid: string;
  label: string;
  unit: string;
  readings: { t: string; temp: number }[];
};

export type SessionChart = {
  session: {
    id: number;
    title: string;
    description: string;
    start: string;
    end: string | null;
    in_progress: boolean;
  };
  channels: {
    device_uuid: string;
    label: string;
    unit: string;
    readings: { t: string; temp: number }[];
  }[];
  notes: Note[];
};

function degreeUnit(degreetype: number): string {
  if (degreetype === 1) return "C";
  if (degreetype === 2) return "F";
  return String(degreetype);
}

function durationMinutes(startTime: string, endTime: string | null): number {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  return Math.round((end - start) / 60000);
}

function transformAlert(alert: RawAlert): Alert {
  return {
    id: alert.id,
    temp_min: alert.temp_min,
    temp_max: alert.temp_max,
    notify_app: alert.notify_app,
    notify_email: alert.notify_email,
    notify_sms: alert.notify_sms,
    time_start: alert.time_start,
    time_stop: alert.time_stop,
    minutes_buffer: alert.minutes_buffer,
    minutes_repeat: alert.minutes_repeat,
    enabled: alert.enabled,
  };
}

function transformNotes(notes: RawSessionDetail["notes"]): Note[] {
  return notes.map((n) => ({
    time: n.note_time,
    text: n.note_text,
    channel: n.channel,
    device_uuid: n.device,
  }));
}

export function transformDriveLog(
  log: RawDriveLog,
  channels?: RawDevice["channels"],
): DriveStatus {
  const label = channels?.find(
    (ch) => ch.channel === log.tiedchannel,
  )?.channel_label;
  return {
    setpoint: log.setpoint,
    drive_percent: log.driveper,
    mode: String(log.modetype),
    tied_to_channel: log.tiedchannel,
    ...(label ? { tied_to_channel_label: label } : {}),
    unit: degreeUnit(log.degreetype),
    as_of: log.created,
  };
}

export function transformDeviceSummary(device: RawDevice): DeviceSummary {
  return {
    uuid: device.uuid,
    id: device.id,
    title: device.title,
    ...(device.model_name ? { model_name: device.model_name } : {}),
    channel_count: device.channel_count,
    ...(device.last_battery_reading !== undefined
      ? { battery: device.last_battery_reading }
      : {}),
    ...(device.last_drivelog
      ? { last_drive: transformDriveLog(device.last_drivelog, device.channels) }
      : {}),
  };
}

export function transformDeviceWithTemps(device: RawDevice): DeviceWithTemps {
  const channels = device.channels
    .filter(
      (ch) =>
        ch.current_temp !== undefined &&
        ch.last_templog &&
        ch.degreetype != null,
    )
    .map((ch) => ({
      label: ch.channel_label,
      temp: Number(ch.current_temp),
      unit: degreeUnit(Number(ch.degreetype)),
      as_of: ch.last_templog?.created ?? "",
      alerts: ch.alerts.map(transformAlert),
    }));

  return {
    uuid: device.uuid,
    title: device.title,
    channels,
    ...(device.last_drivelog
      ? { last_drive: transformDriveLog(device.last_drivelog, device.channels) }
      : {}),
  };
}

export function transformSessionSummary(
  session: RawSessionSummary,
): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    description: session.description,
    start: session.start_time,
    end: session.end_time,
    in_progress: session.end_time === null,
    device_uuids: session.device_ids,
  };
}

export function transformSessionDetail(
  session: RawSessionDetail,
): SessionDetail {
  return {
    id: session.id,
    title: session.title,
    description: session.description,
    start: session.start_time,
    end: session.end_time,
    in_progress: session.end_time === null,
    duration_minutes: durationMinutes(session.start_time, session.end_time),
    devices: session.devices.map(({ uuid, title }) => ({ uuid, title })),
    channels: session.devices.flatMap((d) =>
      d.channels.map((ch) => ({
        label: ch.channel_label,
        device_uuid: d.uuid,
      })),
    ),
    notes: transformNotes(session.notes),
  };
}

export function transformChartChannels(
  chart: RawChartChannel[],
): ChartChannel[] {
  return chart.map((ch) => ({
    device_uuid: ch.device,
    label: ch.label,
    unit: degreeUnit(ch.degreetype),
    readings: ch.x.map((t, i) => ({
      t: new Date(t * 1000).toISOString(),
      temp: ch.y[i],
    })),
  }));
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
    channels: transformChartChannels(chart),
    notes: transformNotes(session.notes),
  };
}
