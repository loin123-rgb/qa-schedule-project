import { config } from "./config.js";

export async function sendDiscordReminder(schedule, assignee, team) {
  const lines = [
    `工作項目提醒: ${schedule.title}`,
    `部門: ${team?.name || schedule.teamId}`,
    `負責人: ${assignee?.name || "未指派"}`,
    `截止時間: ${schedule.dueAt}`,
    `提醒時間: ${schedule.reminderAt}`
  ];

  if (schedule.description) {
    lines.push(`說明: ${schedule.description}`);
  }

  if (config.appMode === "demo" || !config.discordWebhookUrl) {
    return {
      sent: true,
      channel: "discord-demo",
      message: lines.join("\n"),
      reason: config.appMode === "demo" ? "Demo mode mock send." : "Webhook missing, fallback to mock send."
    };
  }

  const response = await fetch(config.discordWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: lines.join("\n")
    })
  });

  if (!response.ok) {
    throw new Error(`Discord webhook request failed with status ${response.status}.`);
  }

  return {
    sent: true,
    channel: "discord-webhook",
    message: lines.join("\n")
  };
}
