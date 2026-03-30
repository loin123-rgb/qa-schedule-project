import { sendDiscordReminder } from "./discord.js";
import { config } from "./config.js";
import { readStore, updateStore } from "./store.js";
import { createId, nowIso } from "./utils.js";

export function listTeams() {
  return readStore().teams;
}

export function listMembers() {
  return readStore().members;
}

export function createMember(input) {
  return updateStore((state) => {
    const team = state.teams.find((item) => item.id === input.teamId);

    if (!team) {
      throw new Error("Team does not exist.");
    }

    const member = {
      id: createId("member"),
      name: input.name,
      teamId: input.teamId,
      role: input.role || "",
      discordUserId: input.discordUserId || "",
      createdAt: nowIso()
    };

    return {
      ...state,
      members: [...state.members, member]
    };
  }).members.at(-1);
}

export function listSchedules() {
  return readStore().schedules;
}

export function listNotificationLog() {
  return readStore().notificationLog || [];
}

export function createSchedule(input) {
  return updateStore((state) => {
    const team = state.teams.find((item) => item.id === input.teamId);

    if (!team) {
      throw new Error("Team does not exist.");
    }

    const assignee = input.assigneeId
      ? state.members.find((item) => item.id === input.assigneeId)
      : null;

    if (input.assigneeId && !assignee) {
      throw new Error("Assignee does not exist.");
    }

    const dueDate = new Date(input.dueAt);

    if (Number.isNaN(dueDate.getTime())) {
      throw new Error("dueAt must be a valid ISO datetime.");
    }

    const reminderMinutes = Number(input.reminderMinutes ?? 30);
    const reminderAt = new Date(dueDate.getTime() - reminderMinutes * 60 * 1000);

    const schedule = {
      id: createId("schedule"),
      title: input.title,
      description: input.description || "",
      teamId: input.teamId,
      assigneeId: input.assigneeId || "",
      dueAt: dueDate.toISOString(),
      reminderMinutes,
      reminderAt: reminderAt.toISOString(),
      status: "pending",
      reminderSentAt: "",
      createdAt: nowIso()
    };

    return {
      ...state,
      schedules: [...state.schedules, schedule]
    };
  }).schedules.at(-1);
}

export function completeSchedule(scheduleId) {
  return updateStore((state) => {
    const target = state.schedules.find((item) => item.id === scheduleId);

    if (!target) {
      throw new Error("Schedule does not exist.");
    }

    return {
      ...state,
      schedules: state.schedules.map((item) =>
        item.id === scheduleId
          ? {
              ...item,
              status: "completed",
              completedAt: nowIso()
            }
          : item
      )
    };
  }).schedules.find((item) => item.id === scheduleId);
}

export async function dispatchDueReminders() {
  const state = readStore();
  const currentTime = Date.now();
  const dueSchedules = state.schedules.filter((schedule) => {
    if (schedule.status !== "pending") {
      return false;
    }

    if (schedule.reminderSentAt) {
      return false;
    }

    return new Date(schedule.reminderAt).getTime() <= currentTime;
  });

  const results = [];

  for (const schedule of dueSchedules) {
    const assignee = state.members.find((item) => item.id === schedule.assigneeId);
    const team = state.teams.find((item) => item.id === schedule.teamId);

    const result = await sendDiscordReminder(schedule, assignee, team);
    results.push({
      scheduleId: schedule.id,
      ...result
    });
  }

  if (results.length > 0) {
    updateStore((currentState) => ({
      ...currentState,
      schedules: currentState.schedules.map((item) => {
        const sent = results.find((result) => result.scheduleId === item.id && result.sent);

        if (!sent) {
          return item;
        }

        return {
          ...item,
          reminderSentAt: nowIso()
        };
      }),
      notificationLog: [
        ...(currentState.notificationLog || []),
        ...results
          .filter((result) => result.sent)
          .map((result) => ({
            id: createId("notify"),
            scheduleId: result.scheduleId,
            channel: result.channel || (config.appMode === "demo" ? "discord-demo" : "discord-webhook"),
            sentAt: nowIso(),
            status: config.appMode === "demo" ? "mock-sent" : "sent",
            message: result.message || ""
          }))
      ]
    }));
  }

  return results;
}
