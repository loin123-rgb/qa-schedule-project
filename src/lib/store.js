import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const dataFilePath = resolve(process.cwd(), "data", "app-data.json");

function ensureDataFile() {
  const directory = dirname(dataFilePath);

  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  if (!existsSync(dataFilePath)) {
    const initialState = {
      teams: [
        { id: "verification", name: "驗證組" },
        { id: "quality", name: "品檢組" }
      ],
      members: [],
      schedules: [],
      notificationLog: []
    };

    writeFileSync(dataFilePath, JSON.stringify(initialState, null, 2));
  }
}

export function readStore() {
  ensureDataFile();
  const raw = readFileSync(dataFilePath, "utf8");
  return JSON.parse(raw);
}

export function writeStore(nextState) {
  ensureDataFile();
  writeFileSync(dataFilePath, JSON.stringify(nextState, null, 2));
}

export function updateStore(updater) {
  const currentState = readStore();
  const nextState = updater(currentState);
  writeStore(nextState);
  return nextState;
}
