// Main app: state, routing, view rendering.
(function () {
  const state = {
    schedule: null,
    settings: null,
    view: 'today'
  };

  // ---------- bootstrap ----------
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    state.schedule = Storage.loadSchedule();
    state.settings = Storage.loadSettings();
    if (state.schedule && state.settings.weekOneOverride) {
      state.schedule = Scheduler.applyWeekOneOverride(state.schedule, state.settings.weekOneOverride);
    }
    bindTabs();
    bindSettings();
    render();
    if (state.settings.notifEnabled && state.schedule) {
      Notifs.scheduleTodayReminders(state.schedule, state.settings);
    }
    // Re-render daily across midnight & every 60s for "next class" highlight
    setInterval(() => { if (state.view === 'today' || state.view === 'tomorrow') renderViews(); }, 60000);
  }

  // ---------- tabs ----------
  function bindTabs() {
    document.querySelectorAll('#tabbar .tab').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
  }
  function switchView(name) {
    state.view = name;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    document.getElementById('topbar-title').textContent =
      ({ today: '今天', tomorrow: '明天', week: '本周', settings: '设置' })[name];
    document.getElementById('topbar-sub').textContent = topbarSub(name);
    render();
  }
  function topbarSub(view) {
    const now = new Date();
    if (view === 'today')    return `${formatDate(now)} ${Scheduler.WEEKDAY_CN[Scheduler.jsWeekday(now)]}`;
    if (view === 'tomorrow') { const t = new Date(now); t.setDate(t.getDate()+1); return `${formatDate(t)} ${Scheduler.WEEKDAY_CN[Scheduler.jsWeekday(t)]}`; }
    if (view === 'week') {
      const days = Scheduler.classesThisWeek(state.schedule || { classes: [] }, now);
      return `${days[0].iso.slice(5)} ~ ${days[6].iso.slice(5)}`;
    }
    return '';
  }

  // ---------- main render ----------
  function render() {
    document.getElementById('topbar-sub').textContent = topbarSub(state.view);
    renderViews();
    renderSettings();
  }
  function renderViews() {
    renderToday();
    renderTomorrow();
    renderWeek();
  }

  function noScheduleEmpty() {
    return `<div class="empty"><div class="icon">📭</div>
      <div>还没有导入课表</div>
      <div class="small" style="margin-top:8px">点底部「设置」→ 选择 Excel 文件</div></div>`;
  }

  function renderToday() {
    const root = document.getElementById('view-today');
    if (!state.schedule) { root.innerHTML = noScheduleEmpty(); return; }
    const now = new Date();
    const todays = Scheduler.classesOnDate(state.schedule, now);
    if (todays.length === 0) {
      root.innerHTML = `<div class="empty"><div class="icon">☕</div><div>今天没有课</div><div class="small" style="margin-top:8px">好好休息</div></div>`;
      return;
    }
    const next = todays.find(c => Scheduler.currentOrPast(c, now) === 'future');
    const cards = todays.map(c => classCard(c, now, c === next));
    root.innerHTML = cards.join('');
  }

  function renderTomorrow() {
    const root = document.getElementById('view-tomorrow');
    if (!state.schedule) { root.innerHTML = noScheduleEmpty(); return; }
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const cls = Scheduler.classesOnDate(state.schedule, tomorrow);
    if (cls.length === 0) {
      root.innerHTML = `<div class="empty"><div class="icon">🌙</div><div>明天没有课</div></div>`;
      return;
    }
    root.innerHTML = cls.map(c => classCard(c, tomorrow, false)).join('');
  }

  function renderWeek() {
    const root = document.getElementById('view-week');
    if (!state.schedule) { root.innerHTML = noScheduleEmpty(); return; }
    const now = new Date();
    const days = Scheduler.classesThisWeek(state.schedule, now);
    const todayIso = Scheduler.isoDate(now);
    const html = `<div class="week-grid">${days.map(d => {
      const isToday = d.iso === todayIso;
      const items = d.classes.length === 0
        ? '<div class="none">无课</div>'
        : d.classes.map(c => `
          <div class="mini">
            <div class="t">${c.startTime}–${c.endTime}</div>
            <div class="c">${escapeHtml(c.course)}</div>
            <div class="r">📍 ${escapeHtml(c.room)}</div>
          </div>`).join('');
      return `<div class="week-day ${isToday ? 'today' : ''}">
        <h3>${Scheduler.WEEKDAY_CN[d.weekday]}<span class="date">${d.iso.slice(5)}</span></h3>
        ${items}
      </div>`;
    }).join('')}</div>`;
    root.innerHTML = html;
  }

  function classCard(c, refDate, isNext) {
    const status = Scheduler.currentOrPast(c, new Date());
    const cls = ['class-card'];
    if (status === 'past') cls.push('past');
    if (isNext) cls.push('next');
    const badge = status === 'current' ? '<span class="badge">进行中</span>'
                  : isNext ? '<span class="badge">下一节</span>' : '';
    return `<div class="${cls.join(' ')}">
      <div class="time">${c.startTime} – ${c.endTime}${badge}</div>
      <div class="course">${escapeHtml(c.course)}</div>
      <div class="room">${escapeHtml(c.room)}</div>
    </div>`;
  }

  // ---------- settings ----------
  function bindSettings() {
    document.getElementById('excel-input').addEventListener('change', onExcelPicked);
    document.getElementById('save-week-one').addEventListener('click', onSaveWeekOne);
    document.getElementById('export-ics').addEventListener('click', onExportIcs);
    document.getElementById('enable-notifs').addEventListener('change', onToggleNotifs);
    document.getElementById('clear-data').addEventListener('click', onClearData);
  }

  function renderSettings() {
    const wInput = document.getElementById('week-one-date');
    wInput.value = state.schedule?.weekOneMonday || '';
    document.getElementById('enable-notifs').checked = !!state.settings.notifEnabled;
    const meta = document.getElementById('meta-info');
    if (state.schedule) {
      const s = state.schedule.stats || {};
      meta.innerHTML = `已导入 <b>${state.schedule.classes.length}</b> 节课<br>
        覆盖周次：${(s.weeksSeen || []).join(', ') || '–'}<br>
        覆盖月份：${(s.months || []).join(', ') || '–'}<br>
        第 1 周周一：${state.schedule.weekOneMonday}<br>
        导入时间：${formatDateTime(new Date(state.schedule.importedAt))}<br>
        源文件：${escapeHtml(state.schedule.sourceFile || '–')}`;
    } else {
      meta.textContent = '未导入数据';
    }
  }

  async function onExcelPicked(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const status = document.getElementById('import-status');
    status.textContent = '解析中…';
    try {
      const parsed = await Parser.parseFile(file);
      // re-apply override if user previously set one
      const finalSchedule = state.settings.weekOneOverride
        ? Scheduler.applyWeekOneOverride(parsed, state.settings.weekOneOverride)
        : parsed;
      Storage.saveSchedule(finalSchedule);
      state.schedule = finalSchedule;
      status.textContent = `成功：解析出 ${parsed.classes.length} 节课，覆盖第 ${parsed.stats.weeksSeen.join(', ')} 周。`;
      toast('课表已更新');
      render();
      if (state.settings.notifEnabled) Notifs.scheduleTodayReminders(state.schedule, state.settings);
    } catch (err) {
      console.error(err);
      status.textContent = '失败：' + err.message;
    } finally {
      e.target.value = ''; // allow re-pick same file
    }
  }

  function onSaveWeekOne() {
    const iso = document.getElementById('week-one-date').value;
    if (!iso) { toast('请选择日期'); return; }
    if (!state.schedule) { toast('请先导入课表'); return; }
    state.settings.weekOneOverride = iso;
    Storage.saveSettings(state.settings);
    // Re-apply against the original parsed data — easiest: reload from storage,
    // but storage holds already-modified one. Recompute by treating current weekOneMonday
    // as basis: shift all dates by delta from current to new.
    state.schedule = Scheduler.applyWeekOneOverride(state.schedule, iso);
    Storage.saveSchedule(state.schedule);
    toast('已更新');
    render();
  }

  function onExportIcs() {
    if (!state.schedule) { toast('请先导入课表'); return; }
    // Default: export from today onwards to keep file small & relevant.
    const todayIso = Scheduler.isoDate(new Date());
    Notifs.downloadICS(state.schedule, {
      fromIso: todayIso,
      minutesBefore: state.settings.notifMinutesBefore
    });
    toast('已生成 .ics，请打开它导入到日历');
  }

  async function onToggleNotifs(e) {
    const checked = e.target.checked;
    if (checked) {
      const ok = await Notifs.ensurePermission();
      if (!ok) {
        e.target.checked = false;
        toast('浏览器拒绝了通知权限');
        return;
      }
    }
    state.settings.notifEnabled = checked;
    Storage.saveSettings(state.settings);
    if (checked && state.schedule) {
      Notifs.scheduleTodayReminders(state.schedule, state.settings);
      toast('已为今日剩余课程排好提醒');
    } else {
      Notifs.clearScheduled();
    }
  }

  function onClearData() {
    if (!confirm('确认清除所有数据？')) return;
    Storage.clearAll();
    state.schedule = null;
    state.settings = Storage.loadSettings();
    Notifs.clearScheduled();
    render();
    toast('已清除');
  }

  // ---------- utils ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  function formatDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  function formatDateTime(d) {
    return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function pad2(n) { return String(n).padStart(2, '0'); }

  let toastTimer = null;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
})();
