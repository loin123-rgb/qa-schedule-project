/**
 * schedule.js – renders the QA schedule/task table
 */

const Schedule = (() => {
  const tbody     = document.getElementById('schedule-tbody');
  const emptyMsg  = document.getElementById('schedule-empty');
  const filterStatus   = document.getElementById('filter-status');
  const filterPriority = document.getElementById('filter-priority');

  filterStatus.addEventListener('change',   render);
  filterPriority.addEventListener('change', render);

  document.getElementById('sched-add-btn').addEventListener('click', () => {
    App.openTaskModal(null);
  });

  function render() {
    const statusFilter   = filterStatus.value;
    const priorityFilter = filterPriority.value;

    let tasks = Store.getTasks();
    if (statusFilter)   tasks = tasks.filter(t => t.status   === statusFilter);
    if (priorityFilter) tasks = tasks.filter(t => t.priority === priorityFilter);

    tbody.innerHTML = '';

    if (tasks.length === 0) {
      emptyMsg.style.display = '';
      return;
    }
    emptyMsg.style.display = 'none';

    tasks.forEach(task => {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${_esc(task.title)}</td>
        <td>${_esc(task.assignee || '—')}</td>
        <td>${_fmtDate(task.startDate)}</td>
        <td>${_fmtDate(task.endDate)}</td>
        <td><span class="badge pri-${task.priority}">${_esc(task.priority)}</span></td>
        <td><span class="badge badge-${task.status}">${_esc(task.status)}</span></td>
        <td class="notes-cell">${_esc(task.notes || '')}</td>
        <td>
          <div class="td-actions">
            <button class="btn-icon edit-btn" data-id="${task.id}" title="編輯">✏️</button>
            <button class="btn-icon del del-btn" data-id="${task.id}" title="刪除">🗑️</button>
          </div>
        </td>
      `;

      tr.querySelector('.edit-btn').addEventListener('click', () => App.openTaskModal(task.id));
      tr.querySelector('.del-btn').addEventListener('click',  () => App.confirmDelete('task', task.id));

      tbody.appendChild(tr);
    });
  }

  function _fmtDate(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${y}年${m}月${d}日`;
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return { render };
})();
