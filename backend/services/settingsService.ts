import { prisma } from "../db/client";
import type { SettingsUpdateInput } from "../../shared/types/ipc";
import type { UserSettings } from "../../shared/types/models";

const SETTINGS_ID = "default";

function toDto(row: {
  id: string;
  theme: string;
  launchOnStartup: boolean;
  telemetryEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): UserSettings {
  return {
    id: row.id,
    theme: row.theme as UserSettings["theme"],
    launchOnStartup: row.launchOnStartup,
    telemetryEnabled: row.telemetryEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Returns the single application settings row, creating it on first run. */
export async function getSettings(): Promise<UserSettings> {
  const row = await prisma.userSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
  return toDto(row);
}

export async function updateSettings(
  input: SettingsUpdateInput,
): Promise<UserSettings> {
  const row = await prisma.userSettings.upsert({
    where: { id: SETTINGS_ID },
    update: input,
    create: { id: SETTINGS_ID, ...input },
  });
  return toDto(row);
}
