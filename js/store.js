/**
 * store.js – lightweight localStorage-backed data store
 * Keys: 'qa_events' (calendar events) and 'qa_tasks' (schedule tasks)
 */

const Store = (() => {
  const EVENTS_KEY = 'qa_events';
  const TASKS_KEY  = 'qa_tasks';

  function _load(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  }

  function _save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function _uid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback: timestamp + counter + random to minimise collision risk
    return `${Date.now().toString(36)}-${(++_uid._counter).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }
  _uid._counter = 0;

  /* ── Events ── */
  function getEvents() { return _load(EVENTS_KEY); }

  function addEvent(evt) {
    const list = getEvents();
    const item = { id: _uid(), ...evt };
    list.push(item);
    _save(EVENTS_KEY, list);
    return item;
  }

  function updateEvent(id, patch) {
    const list = getEvents().map(e => (e.id === id ? { ...e, ...patch } : e));
    _save(EVENTS_KEY, list);
  }

  function deleteEvent(id) {
    _save(EVENTS_KEY, getEvents().filter(e => e.id !== id));
  }

  /* ── Tasks ── */
  function getTasks() { return _load(TASKS_KEY); }

  function addTask(task) {
    const list = getTasks();
    const item = { id: _uid(), ...task };
    list.push(item);
    _save(TASKS_KEY, list);
    return item;
  }

  function updateTask(id, patch) {
    const list = getTasks().map(t => (t.id === id ? { ...t, ...patch } : t));
    _save(TASKS_KEY, list);
  }

  function deleteTask(id) {
    _save(TASKS_KEY, getTasks().filter(t => t.id !== id));
  }

  return {
    getEvents, addEvent, updateEvent, deleteEvent,
    getTasks,  addTask,  updateTask,  deleteTask,
  };
})();
