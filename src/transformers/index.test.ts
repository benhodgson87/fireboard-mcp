import { describe, expect, it } from "vitest";
import {
  transformDeviceSummary,
  transformDeviceWithTemps,
  transformDriveLog,
  transformSessionChart,
  transformSessionDetail,
  transformSessionSummary,
} from "./index";

const baseDriveLog = {
  driveper: 45.5,
  setpoint: 107.0,
  modetype: "Managed",
  tiedchannel: 1,
  degreetype: 1 as const,
  created: "2026-06-13T08:48:12Z",
};

const baseDevice = {
  uuid: "abc-123",
  title: "Big Green Egg",
  channel_count: 3,
  channels: [],
  active: true,
  last_drivelog: null,
};

const baseSession = {
  id: 1,
  title: "Pulled Pork",
  description: "Test cook",
  start_time: "2026-06-13T07:00:00Z",
  end_time: "2026-06-13T19:00:00Z",
  devices: [
    {
      uuid: "device-1",
      title: "Big Green Egg",
      channels: [{ channel_label: "Ambient", channel: 1 }],
    },
  ],
  notes: [],
};

describe("transformDriveLog", () => {
  it("maps fields correctly", () => {
    expect(transformDriveLog(baseDriveLog)).toEqual({
      setpoint: 107.0,
      drive_percent: 45.5,
      mode: "Managed",
      tied_to_channel: 1,
      unit: "C",
      as_of: "2026-06-13T08:48:12Z",
    });
  });

  it("maps degreetype 2 to F", () => {
    expect(transformDriveLog({ ...baseDriveLog, degreetype: 2 }).unit).toBe(
      "F",
    );
  });

  it("stringifies numeric modetype", () => {
    expect(transformDriveLog({ ...baseDriveLog, modetype: 2 }).mode).toBe("2");
  });
});

describe("transformDeviceSummary", () => {
  it("maps basic fields", () => {
    expect(transformDeviceSummary(baseDevice)).toEqual({
      uuid: "abc-123",
      title: "Big Green Egg",
      channel_count: 3,
    });
  });

  it("includes last_drive when last_drivelog present", () => {
    const result = transformDeviceSummary({
      ...baseDevice,
      last_drivelog: baseDriveLog,
    });
    expect(result.last_drive?.drive_percent).toBe(45.5);
  });

  it("omits last_drive when last_drivelog is null", () => {
    expect(transformDeviceSummary(baseDevice).last_drive).toBeUndefined();
  });
});

describe("transformDeviceWithTemps", () => {
  it("includes channels with current_temp and last_templog", () => {
    const device = {
      ...baseDevice,
      channels: [
        {
          channel: 1,
          channel_label: "Ambient Temp",
          current_temp: 118.0,
          degreetype: 1 as const,
          enabled: true,
          last_templog: {
            temp: 118.0,
            created: "2026-06-13T08:48:10Z",
            degreetype: 1 as const,
          },
        },
      ],
    };
    const result = transformDeviceWithTemps(device);
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]).toEqual({
      label: "Ambient Temp",
      temp: 118.0,
      unit: "C",
      as_of: "2026-06-13T08:48:10Z",
    });
  });

  it("omits channels without current_temp", () => {
    const device = {
      ...baseDevice,
      channels: [
        {
          channel: 3,
          channel_label: "Channel 3",
          degreetype: 1 as const,
          enabled: true,
        },
      ],
    };
    expect(transformDeviceWithTemps(device).channels).toHaveLength(0);
  });
});

describe("transformSessionSummary", () => {
  it("sets in_progress true when end_time is null", () => {
    const session = {
      id: 1,
      title: "Test",
      description: "",
      start_time: "2026-06-13T07:00:00Z",
      end_time: null,
      device_ids: ["uuid-1"],
    };
    expect(transformSessionSummary(session).in_progress).toBe(true);
  });

  it("sets in_progress false when end_time is set", () => {
    const session = {
      id: 1,
      title: "Test",
      description: "",
      start_time: "2026-06-13T07:00:00Z",
      end_time: "2026-06-13T19:00:00Z",
      device_ids: [],
    };
    expect(transformSessionSummary(session).in_progress).toBe(false);
  });

  it("maps device_ids to device_uuids", () => {
    const session = {
      id: 1,
      title: "",
      description: "",
      start_time: "2026-06-13T07:00:00Z",
      end_time: null,
      device_ids: ["uuid-1", "uuid-2"],
    };
    expect(transformSessionSummary(session).device_uuids).toEqual([
      "uuid-1",
      "uuid-2",
    ]);
  });
});

describe("transformSessionDetail", () => {
  it("computes duration_minutes for a completed session", () => {
    const result = transformSessionDetail(baseSession);
    expect(result.duration_minutes).toBe(720);
  });

  it("computes duration_minutes from now for in-progress session", () => {
    const session = { ...baseSession, end_time: null };
    const result = transformSessionDetail(session);
    expect(result.duration_minutes).toBeGreaterThan(0);
  });

  it("maps notes correctly", () => {
    const session = {
      ...baseSession,
      notes: [
        {
          note_time: "2026-06-13T10:00:00Z",
          note_text: "Spritz",
          channel: 2,
          device: "device-1",
        },
      ],
    };
    expect(transformSessionDetail(session).notes[0]).toEqual({
      time: "2026-06-13T10:00:00Z",
      text: "Spritz",
      channel: 2,
      device_uuid: "device-1",
    });
  });

  it("flattens channels from all devices", () => {
    const result = transformSessionDetail(baseSession);
    expect(result.channels).toEqual([
      { label: "Ambient", device_uuid: "device-1" },
    ]);
  });
});

describe("transformSessionChart", () => {
  it("zips x/y arrays into readings with ISO timestamps", () => {
    const chart = [
      {
        device: "device-1",
        label: "Ambient Temp",
        degreetype: 1 as const,
        x: [1749790800, 1749790860],
        y: [100.0, 101.0],
        channel_id: "1",
      },
    ];
    const result = transformSessionChart(baseSession, chart);
    expect(result.channels[0].readings).toEqual([
      { t: new Date(1749790800 * 1000).toISOString(), temp: 100.0 },
      { t: new Date(1749790860 * 1000).toISOString(), temp: 101.0 },
    ]);
  });

  it("maps degreetype to unit string", () => {
    const chart = [
      {
        device: "device-1",
        label: "Probe",
        degreetype: 2 as const,
        x: [],
        y: [],
        channel_id: "1",
      },
    ];
    expect(transformSessionChart(baseSession, chart).channels[0].unit).toBe(
      "F",
    );
  });

  it("includes notes from session detail", () => {
    const session = {
      ...baseSession,
      notes: [
        {
          note_time: "2026-06-13T10:00:00Z",
          note_text: "Wrapped",
          channel: null,
          device: "device-1",
        },
      ],
    };
    const result = transformSessionChart(session, []);
    expect(result.notes[0].text).toBe("Wrapped");
  });
});
