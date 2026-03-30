/**
 * app.js – wires together the modal, tabs, Calendar and Schedule modules
 */

const App = (() => {
  /* ── DOM refs ── */
  const overlay     = document.getElementById('modal-overlay');
  const form        = document.getElementById('modal-form');
  const modalTitle  = document.getElementById('modal-title');

  const fTitle      = document.getElementById('f-title');
  const fAssignee   = document.getElementById('f-assignee');
  const fDate       = document.getElementById('f-date');
  const fStart      = document.getElementById('f-start');
  const fEnd        = document.getElementById('f-end');
  const fPriority   = document.getElementById('f-priority');
  const fStatus     = document.getElementById('f-status');
  const fCategory   = document.getElementById('f-category');
  const fNotes      = document.getElementById('f-notes');

  const fgDate          = document.getElementById('fg-date');
  const fgSchedExtra    = document.getElementById('fg-schedule-extra');
  const fgCalExtra      = document.getElementById('fg-cal-extra');

  const confirmOverlay  = document.getElementById('confirm-overlay');
  const confirmMsg      = document.getElementById('confirm-msg');
  const confirmOkBtn    = document.getElementById('confirm-ok');
  const confirmCancelBtn= document.getElementById('confirm-cancel');

  /* ── State ── */
  let _mode   = 'event';   // 'event' | 'task'
  let _editId = null;      // id being edited, or null for new
  let _defaultDate = '';
  let _confirmCallback = null;

  /* ── Tabs ── */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  /* ── Modal helpers ── */
  function _clearForm() {
    fTitle.value    = '';
    fAssignee.value = '';
    fDate.value     = '';
    fStart.value    = '';
    fEnd.value      = '';
    fPriority.value = '中';
    fStatus.value   = '待處理';
    fCategory.value = '檢驗';
    fNotes.value    = '';
    [fTitle, fDate, fStart, fEnd].forEach(el => el.classList.remove('invalid'));
  }

  function _showEventFields() {
    fgDate.style.display       = '';
    fgSchedExtra.style.display = 'none';
    fgCalExtra.style.display   = '';
    fDate.required  = true;
    fStart.required = false;
    fEnd.required   = false;
  }

  function _showTaskFields() {
    fgDate.style.display       = 'none';
    fgSchedExtra.style.display = '';
    fgCalExtra.style.display   = 'none';
    fDate.required  = false;
    fStart.required = true;
    fEnd.required   = true;
  }

  function _openModal() { overlay.style.display = 'flex'; fTitle.focus(); }
  function _closeModal() { overlay.style.display = 'none'; }

  /* ── Public: open event modal ── */
  function openEventModal(id, defaultDate) {
    _mode    = 'event';
    _editId  = id || null;
    _defaultDate = defaultDate || '';
    _clearForm();
    _showEventFields();

    if (_editId) {
      const ev = Store.getEvents().find(e => e.id === _editId);
      if (!ev) return;
      modalTitle.textContent = '編輯事件';
      fTitle.value    = ev.title;
      fAssignee.value = ev.assignee || '';
      fDate.value     = ev.date;
      fCategory.value = ev.category || '其他';
      fNotes.value    = ev.notes || '';
    } else {
      modalTitle.textContent = '新增事件';
      fDate.value = defaultDate;
    }
    _openModal();
  }

  /* ── Public: open task modal ── */
  function openTaskModal(id) {
    _mode   = 'task';
    _editId = id || null;
    _clearForm();
    _showTaskFields();

    if (_editId) {
      const t = Store.getTasks().find(t => t.id === _editId);
      if (!t) return;
      modalTitle.textContent = '編輯任務';
      fTitle.value    = t.title;
      fAssignee.value = t.assignee  || '';
      fStart.value    = t.startDate || '';
      fEnd.value      = t.endDate   || '';
      fPriority.value = t.priority  || '中';
      fStatus.value   = t.status    || '待處理';
      fNotes.value    = t.notes     || '';
    } else {
      modalTitle.textContent = '新增任務';
    }
    _openModal();
  }

  /* ── Form validation ── */
  function _validate() {
    let ok = true;

    fTitle.classList.remove('invalid');
    fDate.classList.remove('invalid');
    fStart.classList.remove('invalid');
    fEnd.classList.remove('invalid');

    if (!fTitle.value.trim()) { fTitle.classList.add('invalid'); ok = false; }

    if (_mode === 'event') {
      if (!fDate.value) { fDate.classList.add('invalid'); ok = false; }
    } else {
      if (!fStart.value) { fStart.classList.add('invalid'); ok = false; }
      if (!fEnd.value)   { fEnd.classList.add('invalid');   ok = false; }
    }
    return ok;
  }

  /* ── Form submit ── */
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!_validate()) return;

    if (_mode === 'event') {
      const payload = {
        title:    fTitle.value.trim(),
        assignee: fAssignee.value.trim(),
        date:     fDate.value,
        category: fCategory.value,
        notes:    fNotes.value.trim(),
      };
      if (_editId) {
        Store.updateEvent(_editId, payload);
      } else {
        Store.addEvent(payload);
      }
      Calendar.render();
    } else {
      const payload = {
        title:    fTitle.value.trim(),
        assignee: fAssignee.value.trim(),
        startDate: fStart.value,
        endDate:   fEnd.value,
        priority:  fPriority.value,
        status:    fStatus.value,
        notes:     fNotes.value.trim(),
      };
      if (_editId) {
        Store.updateTask(_editId, payload);
      } else {
        Store.addTask(payload);
      }
      Schedule.render();
    }
    _closeModal();
  });

  /* ── Close modal ── */
  document.getElementById('modal-close-btn').addEventListener('click', _closeModal);
  document.getElementById('modal-cancel-btn').addEventListener('click', _closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) _closeModal(); });

  /* ── Keyboard ── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      _closeModal();
      _closeConfirm();
    }
  });

  /* ── Confirm dialog ── */
  function confirmDelete(type, id) {
    const label = type === 'event' ? '事件' : '任務';
    confirmMsg.textContent = `確定要刪除此${label}嗎？此動作無法復原。`;
    _confirmCallback = () => {
      if (type === 'event') {
        Store.deleteEvent(id);
        Calendar.render();
      } else {
        Store.deleteTask(id);
        Schedule.render();
      }
    };
    confirmOverlay.style.display = 'flex';
  }

  function _closeConfirm() { confirmOverlay.style.display = 'none'; _confirmCallback = null; }

  confirmOkBtn.addEventListener('click', () => {
    if (_confirmCallback) _confirmCallback();
    _closeConfirm();
  });
  confirmCancelBtn.addEventListener('click', _closeConfirm);
  confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) _closeConfirm(); });

  /* ── Bootstrap ── */
  Calendar.render();
  Schedule.render();

  return { openEventModal, openTaskModal, confirmDelete };
})();
