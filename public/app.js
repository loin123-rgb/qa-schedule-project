const state = {
  mode: "demo",
  teams: [],
  members: [],
  schedules: [],
  notificationLog: []
};

const memberForm = document.querySelector("#memberForm");
const scheduleForm = document.querySelector("#scheduleForm");
const memberTeamSelect = document.querySelector("#memberTeamSelect");
const scheduleTeamSelect = document.querySelector("#scheduleTeamSelect");
const assigneeSelect = document.querySelector("#assigneeSelect");
const statsGrid = document.querySelector("#statsGrid");
const teamColumns = document.querySelector("#teamColumns");
const scheduleList = document.querySelector("#scheduleList");
const notificationList = document.querySelector("#notificationList");
const toast = document.querySelector("#toast");
const modeBadge = document.querySelector("#modeBadge");

document.querySelector("#refreshButton").addEventListener("click", () => {
  loadDashboard();
});

document.querySelector("#dispatchButton").addEventListener("click", async () => {
  const response = await fetch("/api/notifications/dispatch-due", { method: "POST" });
  const result = await response.json();
  showToast(`已檢查提醒，模擬派送 ${result.dispatched} 筆。`);
  await loadDashboard();
});

memberForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(memberForm);
  const payload = Object.fromEntries(formData.entries());

  const response = await fetch("/api/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (!response.ok) {
    showToast(result.error || "建立成員失敗。");
    return;
  }

  memberForm.reset();
  showToast(`已建立成員 ${result.name}。`);
  await loadDashboard();
});

scheduleForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(scheduleForm);
  const payload = Object.fromEntries(formData.entries());
  payload.reminderMinutes = Number(payload.reminderMinutes);

  const response = await fetch("/api/schedules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (!response.ok) {
    showToast(result.error || "建立排程失敗。");
    return;
  }

  scheduleForm.reset();
  showToast(`已建立排程 ${result.title}。`);
  await loadDashboard();
});

async function loadDashboard() {
  const response = await fetch("/api/dashboard");
  const result = await response.json();

  if (!response.ok) {
    showToast(result.error || "讀取資料失敗。");
    return;
  }

  state.mode = result.mode || "demo";
  state.teams = result.teams;
  state.members = result.members;
  state.schedules = result.schedules.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  state.notificationLog = (result.notificationLog || []).sort(
    (a, b) => new Date(b.sentAt) - new Date(a.sentAt)
  );

  modeBadge.textContent = state.mode === "demo" ? "Demo Mode" : "Live Mode";
  renderTeamOptions();
  renderStats();
  renderMembers();
  renderSchedules();
  renderNotifications();
}

function renderTeamOptions() {
  const teamOptions = state.teams
    .map((team) => `<option value="${team.id}">${team.name}</option>`)
    .join("");

  memberTeamSelect.innerHTML = teamOptions;
  scheduleTeamSelect.innerHTML = teamOptions;

  const previousAssignee = assigneeSelect.value;
  assigneeSelect.innerHTML = ['<option value="">未指派</option>']
    .concat(
      state.members.map(
        (member) =>
          `<option value="${member.id}">${member.name} · ${resolveTeamName(member.teamId)}</option>`
      )
    )
    .join("");

  if (previousAssignee) {
    assigneeSelect.value = previousAssignee;
  }
}

function renderStats() {
  const pendingSchedules = state.schedules.filter((item) => item.status === "pending");
  const completedSchedules = state.schedules.filter((item) => item.status === "completed");
  const pendingReminders = pendingSchedules.filter((item) => !item.reminderSentAt);

  const cards = [
    { label: "部門數量", value: state.teams.length, note: "目前固定為驗證組與品檢組" },
    { label: "成員總數", value: state.members.length, note: "可持續新增人員與角色" },
    { label: "待辦排程", value: pendingSchedules.length, note: "尚未完成的工作項目" },
    { label: "已完成排程", value: completedSchedules.length, note: "已關閉的工作項目" },
    { label: "待發提醒", value: pendingReminders.length, note: "尚未送出 Discord 提醒" },
    { label: "模擬提醒紀錄", value: state.notificationLog.length, note: "目前只在本機展示，不會真的外送" }
  ];

  statsGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="stat-card">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
          <span>${card.note}</span>
        </article>
      `
    )
    .join("");
}

function renderMembers() {
  teamColumns.innerHTML = state.teams
    .map((team) => {
      const members = state.members.filter((member) => member.teamId === team.id);
      const memberMarkup = members.length
        ? members
            .map(
              (member) => `
                <div class="member-pill">
                  <div>
                    <strong>${member.name}</strong>
                    <div><small>${member.role || "未設定角色"}</small></div>
                  </div>
                  <small>${member.discordUserId || "未綁定 Discord"}</small>
                </div>
              `
            )
            .join("")
        : '<p class="empty-state">這個部門目前還沒有成員。</p>';

      return `
        <article class="team-card">
          <h3>${team.name}</h3>
          ${memberMarkup}
        </article>
      `;
    })
    .join("");
}

function renderSchedules() {
  if (state.schedules.length === 0) {
    scheduleList.innerHTML = '<p class="empty-state">目前還沒有排程，先新增一筆工作看看。</p>';
    return;
  }

  scheduleList.innerHTML = state.schedules
    .map((schedule) => {
      const assignee = state.members.find((member) => member.id === schedule.assigneeId);
      const reminderText = schedule.reminderSentAt ? "已送出提醒" : "尚未送出提醒";
      const completeButton =
        schedule.status === "pending"
          ? `<button class="secondary-button" data-complete-id="${schedule.id}">標記完成</button>`
          : "";

      return `
        <article class="schedule-card">
          <div class="schedule-top">
            <div>
              <h3>${schedule.title}</h3>
              <span class="tag ${schedule.status}">${schedule.status === "pending" ? "進行中" : "已完成"}</span>
              <p>${schedule.description || "沒有額外說明。"}</p>
              <div class="schedule-meta">
                <span>部門：${resolveTeamName(schedule.teamId)}</span>
                <span>負責人：${assignee?.name || "未指派"}</span>
                <span>截止：${formatDate(schedule.dueAt)}</span>
                <span>提醒：${formatDate(schedule.reminderAt)}</span>
                <span>${reminderText}</span>
              </div>
            </div>
          </div>
          <div class="schedule-actions">
            ${completeButton}
          </div>
        </article>
      `;
    })
    .join("");

  for (const button of document.querySelectorAll("[data-complete-id]")) {
    button.addEventListener("click", async () => {
      const scheduleId = button.dataset.completeId;
      const response = await fetch(`/api/schedules/${scheduleId}/complete`, { method: "POST" });
      const result = await response.json();

      if (!response.ok) {
        showToast(result.error || "更新排程失敗。");
        return;
      }

      showToast(`已完成排程 ${result.title}。`);
      await loadDashboard();
    });
  }
}

function renderNotifications() {
  if (state.notificationLog.length === 0) {
    notificationList.innerHTML = '<p class="empty-state">目前還沒有提醒紀錄，按一次「手動派送提醒」就會看到模擬結果。</p>';
    return;
  }

  notificationList.innerHTML = state.notificationLog
    .map((item) => {
      const schedule = state.schedules.find((entry) => entry.id === item.scheduleId);
      return `
        <article class="notification-card">
          <div class="schedule-top">
            <div>
              <h3>${schedule?.title || item.scheduleId}</h3>
              <span class="tag pending">${item.status}</span>
              <div class="schedule-meta">
                <span>管道：${item.channel}</span>
                <span>時間：${formatDate(item.sentAt)}</span>
              </div>
              <p>${item.message || "模擬提醒已記錄。"}</p>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function resolveTeamName(teamId) {
  return state.teams.find((team) => team.id === teamId)?.name || teamId;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function showToast(message) {
  toast.hidden = false;
  toast.textContent = message;

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

loadDashboard();
