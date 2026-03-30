/**
 * calendar.js – renders the monthly QA calendar
 */

const Calendar = (() => {
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  let current = new Date(); // displayed month
  current = new Date(current.getFullYear(), current.getMonth(), 1);

  const grid  = document.getElementById('calendar-grid');
  const title = document.getElementById('cal-title');

  /* ── public: full render ── */
  function render() {
    grid.innerHTML = '';
    const year  = current.getFullYear();
    const month = current.getMonth();

    title.textContent = `${year} 年 ${month + 1} 月`;

    const firstDay = new Date(year, month, 1).getDay();   // 0=Sun
    const lastDate = new Date(year, month + 1, 0).getDate();
    const prevLast = new Date(year, month, 0).getDate();

    const events = Store.getEvents();
    const today  = new Date();

    // Build 6 rows × 7 cols = 42 cells
    for (let i = 0; i < 42; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell';

      let day, displayMonth, displayYear;

      if (i < firstDay) {
        // Previous month tail
        day          = prevLast - firstDay + 1 + i;
        displayMonth = month - 1;
        displayYear  = year;
        if (displayMonth < 0) { displayMonth = 11; displayYear -= 1; }
        cell.classList.add('other-month');
      } else if (i - firstDay >= lastDate) {
        // Next month head
        day          = i - firstDay - lastDate + 1;
        displayMonth = month + 1;
        displayYear  = year;
        if (displayMonth > 11) { displayMonth = 0; displayYear += 1; }
        cell.classList.add('other-month');
      } else {
        day          = i - firstDay + 1;
        displayMonth = month;
        displayYear  = year;
        // highlight today
        if (
          today.getFullYear() === year &&
          today.getMonth()    === month &&
          today.getDate()     === day
        ) {
          cell.classList.add('today');
        }
      }

      const dateStr = _dateStr(displayYear, displayMonth, day);

      // Day number
      const numEl = document.createElement('div');
      numEl.className = 'day-num';
      numEl.textContent = day;
      cell.appendChild(numEl);

      // Events on this day
      const dayEvents = events.filter(e => e.date === dateStr);
      const maxShow   = 2;
      dayEvents.slice(0, maxShow).forEach(ev => {
        const el = document.createElement('div');
        el.className = `cal-event cat-${ev.category || '其他'}`;
        el.textContent = ev.title;
        el.title = ev.title;
        el.addEventListener('click', e => {
          e.stopPropagation();
          App.openEventModal(ev.id, dateStr);
        });
        cell.appendChild(el);
      });

      if (dayEvents.length > maxShow) {
        const more = document.createElement('div');
        more.className = 'cal-more';
        more.textContent = `＋${dayEvents.length - maxShow} 個事件`;
        cell.appendChild(more);
      }

      // Click empty area → create new event on that day
      cell.addEventListener('click', () => App.openEventModal(null, dateStr));

      grid.appendChild(cell);
    }
  }

  function prevMonth() {
    current.setMonth(current.getMonth() - 1);
    render();
  }

  function nextMonth() {
    current.setMonth(current.getMonth() + 1);
    render();
  }

  function _dateStr(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  /* Attach toolbar nav buttons */
  document.getElementById('cal-prev').addEventListener('click', prevMonth);
  document.getElementById('cal-next').addEventListener('click', nextMonth);
  document.getElementById('cal-add-btn').addEventListener('click', () => {
    // Default to the 1st of the currently displayed month when adding from toolbar
    const ds = _dateStr(current.getFullYear(), current.getMonth(), 1);
    App.openEventModal(null, ds);
  });

  return { render };
})();
