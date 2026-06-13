import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { controlDrive, fetchDevices, fetchDriveLog } from "../fireboard/client";
import { transformDriveLog } from "../transformers/index";
import {
  driveControlOutputSchema,
  getDriveStatusOutputSchema,
} from "./outputSchemas";

export function registerDriveTools(server: McpServer, token: string) {
  const controlSuccess = {
    content: [
      { type: "text" as const, text: JSON.stringify({ success: true }) },
    ],
    structuredContent: { success: true },
  };

  server.registerTool(
    "get_drive_status",
    {
      description:
        "Returns real-time FireBoard Drive data for a specific device — fan/drive percentage, setpoint, control mode, and the channel being controlled. Costs 1 API call, uncached. If you already have recent data from get_realtime_temps, the last_drive field there is sourced from the same device payload and may be sufficient, saving this call. Use get_drive_status when drive state is the primary concern and freshness matters. Returns null drive if the device has no Drive attached.",
      inputSchema: {
        device_uuid: z.string().describe("UUID of the device to query"),
      },
      outputSchema: getDriveStatusOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ device_uuid }) => {
      try {
        const [log, devices] = await Promise.all([
          fetchDriveLog(token, device_uuid),
          fetchDevices(token),
        ]);
        const channels = devices.data.find(
          (d) => d.uuid === device_uuid,
        )?.channels;
        const result = {
          device_uuid,
          drive: log ? transformDriveLog(log, channels) : null,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: (err as Error).message }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "set_drive_setpoint",
    {
      description:
        "Sets the target temperature (setpoint) and/or the control channel for the FireBoard Drive. Providing a setpoint puts the drive into auto mode — the fan speed is adjusted automatically to reach the target. Providing a channel switches which probe the PID controller uses. Both can be set in one call. The setpoint value must be in the device's configured temperature unit — if the unit is unknown, check the unit field from get_drive_status or get_realtime_temps first. At least one of setpoint or channel must be provided.",
      inputSchema: {
        device_uuid: z.string().describe("UUID of the device to control"),
        setpoint: z
          .number()
          .optional()
          .describe(
            "Target temperature in the device's configured unit (°C or °F)",
          ),
        channel: z
          .number()
          .optional()
          .describe("Probe channel number to use as the PID control input"),
      },
      outputSchema: driveControlOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ device_uuid, setpoint, channel }) => {
      try {
        if (setpoint === undefined && channel === undefined) {
          return {
            content: [
              {
                type: "text" as const,
                text: "At least one of setpoint or channel must be provided.",
              },
            ],
            isError: true,
          };
        }
        const requests: Promise<void>[] = [];
        if (channel !== undefined)
          requests.push(
            controlDrive(token, device_uuid, { cc: String(channel) }),
          );
        if (setpoint !== undefined)
          requests.push(
            controlDrive(token, device_uuid, {
              t: "fan",
              setpoint: String(setpoint),
            }),
          );
        await Promise.all(requests);
        return controlSuccess;
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: (err as Error).message }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "set_drive_speed",
    {
      description:
        "Sets the FireBoard Drive fan to a fixed speed, putting it into manual mode. Overrides any active setpoint. Setting speed to 0 turns the drive off (same effect as set_drive_off).",
      inputSchema: {
        device_uuid: z.string().describe("UUID of the device to control"),
        percent: z
          .number()
          .min(0)
          .max(100)
          .describe("Fan speed as a percentage (0–100)"),
      },
      outputSchema: driveControlOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ device_uuid, percent }) => {
      try {
        await controlDrive(token, device_uuid, {
          t: "fan",
          p: String(percent / 100),
        });
        return controlSuccess;
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: (err as Error).message }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "set_drive_off",
    {
      description:
        "Turns off the FireBoard Drive fan by setting the setpoint to 0. Clears any active setpoint and stops the fan.",
      inputSchema: {
        device_uuid: z.string().describe("UUID of the device to control"),
      },
      outputSchema: driveControlOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ device_uuid }) => {
      try {
        await controlDrive(token, device_uuid, { t: "fan", setpoint: "0" });
        return controlSuccess;
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: (err as Error).message }],
          isError: true,
        };
      }
    },
  );
}
