import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { config } from "./lib/config.js";
import {
  completeSchedule,
  createMember,
  createSchedule,
  dispatchDueReminders,
  listNotificationLog,
  listMembers,
  listSchedules,
  listTeams
} from "./lib/workflow.js";
import { readJsonBody, sendJson, sendText } from "./lib/utils.js";

const publicDirectory = resolve(process.cwd(), "public");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function getRouteId(pathname, prefix) {
  if (!pathname.startsWith(prefix)) {
    return "";
  }

  return pathname.slice(prefix.length).split("/")[0];
}

function tryServeStatic(pathname, res) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(publicDirectory, `.${requestedPath}`);

  if (!filePath.startsWith(publicDirectory) || !existsSync(filePath)) {
    return false;
  }

  const extension = extname(filePath);
  const contentType = contentTypes[extension] || "application/octet-stream";
  const content = readFileSync(filePath);

  res.writeHead(200, {
    "Content-Type": contentType
  });
  res.end(content);
  return true;
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  try {
    if (req.method === "GET" && !pathname.startsWith("/api/") && pathname !== "/health") {
      if (tryServeStatic(pathname, res)) {
        return;
      }

      sendJson(res, 404, {
        error: "Page not found."
      });
      return;
    }

    if (req.method === "GET" && pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "plato-workflow-discord",
        timezone: config.timezone
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/teams") {
      sendJson(res, 200, listTeams());
      return;
    }

    if (req.method === "GET" && pathname === "/api/dashboard") {
      sendJson(res, 200, {
        mode: config.appMode,
        teams: listTeams(),
        members: listMembers(),
        schedules: listSchedules(),
        notificationLog: listNotificationLog()
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/members") {
      sendJson(res, 200, listMembers());
      return;
    }

    if (req.method === "POST" && pathname === "/api/members") {
      const body = await readJsonBody(req);
      const member = createMember(body);
      sendJson(res, 201, member);
      return;
    }

    if (req.method === "GET" && pathname === "/api/schedules") {
      sendJson(res, 200, listSchedules());
      return;
    }

    if (req.method === "POST" && pathname === "/api/schedules") {
      const body = await readJsonBody(req);
      const schedule = createSchedule(body);
      sendJson(res, 201, schedule);
      return;
    }

    if (req.method === "POST" && pathname.startsWith("/api/schedules/") && pathname.endsWith("/complete")) {
      const scheduleId = getRouteId(pathname, "/api/schedules/");
      const schedule = completeSchedule(scheduleId);
      sendJson(res, 200, schedule);
      return;
    }

    if (req.method === "POST" && pathname === "/api/notifications/dispatch-due") {
      const results = await dispatchDueReminders();
      sendJson(res, 200, {
        dispatched: results.length,
        results
      });
      return;
    }

    sendJson(res, 404, {
      error: "Route not found."
    });
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Unexpected error."
    });
  }
}

if (process.argv.includes("--dispatch-reminders")) {
  dispatchDueReminders()
    .then((results) => {
      process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Unexpected error."}\n`);
      process.exitCode = 1;
    });
} else {
  const server = createServer(handleRequest);

  server.listen(config.port, () => {
    process.stdout.write(`Plato Workflow API running on http://localhost:${config.port}\n`);
  });
}
