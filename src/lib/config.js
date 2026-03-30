import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvFile() {
  const envPath = resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

parseEnvFile();

export const config = {
  port: Number(process.env.PORT || 3000),
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || "",
  timezone: process.env.APP_TIMEZONE || "Asia/Taipei",
  appMode: process.env.APP_MODE || "demo"
};
