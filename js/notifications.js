// Two ways to remind: (A) .ics export → system calendar (preferred);
// (B) in-app Web Notifications via setTimeout while app open (best-effort).
const Notifs = (() => {
  // ---------- (A) .ics export ----------

  function pad2(n) { return String(n).padStart(2, '0'); }

  function icsDateTime(dateIso, hhmm) {
    // local time floating (no TZID) — system calendar interprets as device local time
    const [y, m, d] = dateIso.split('-');
    const [hh, mm] = hhmm.split(':');
    return `${y}${m}${d}T${hh}${mm}00`;
  }

  function escapeIcs(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function buildICS(schedule, opts = {}) {
    const minutesBefore = opts.minutesBefore ?? 30;
    const fromIso = opts.fromIso;
    const calName = (opts.calendarName || '我的课表').trim() || '我的课表';
    const TZID = 'Asia/Shanghai';
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//classSchedule//PWA//ZH',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:' + escapeIcs(calName),
      'X-WR-CALDESC:' + escapeIcs(calName),
      'NAME:' + escapeIcs(calName),
      'X-WR-TIMEZONE:' + TZID,
      // 中国不使用夏令时，VTIMEZONE 只需一个 STANDARD 块
      'BEGIN:VTIMEZONE',
      'TZID:' + TZID,
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0800',
      'TZOFFSETTO:+0800',
      'TZNAME:CST',
      'END:STANDARD',
      'END:VTIMEZONE'
    ];
    const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
    for (const c of schedule.classes) {
      if (fromIso && c.date < fromIso) continue;
      const uid = `${c.date}-${c.startTime.replace(':', '')}-${c.course}@classSchedule`.replace(/\s+/g, '_');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${escapeIcs(uid)}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${TZID}:${icsDateTime(c.date, c.startTime)}`,
        `DTEND;TZID=${TZID}:${icsDateTime(c.date, c.endTime)}`,
        `SUMMARY:${escapeIcs(c.course)}`,
        `LOCATION:${escapeIcs(c.room)}`,
        `DESCRIPTION:${escapeIcs('第 ' + c.week + ' 周')}`,
        `CATEGORIES:${escapeIcs(calName)}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER:-PT${minutesBefore}M`,
        `DESCRIPTION:${escapeIcs(c.course + ' @ ' + c.room)}`,
        'END:VALARM',
        'END:VEVENT'
      );
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function downloadICS(schedule, opts = {}) {
    const ics = buildICS(schedule, opts);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (opts.calendarName || '我的课表').replace(/[\\/:*?"<>|]/g, '');
    a.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // ---------- (B) browser notifications (best effort) ----------

  let scheduledTimers = [];

  function clearScheduled() {
    scheduledTimers.forEach(t => clearTimeout(t));
    scheduledTimers = [];
  }

  async function ensurePermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const res = await Notification.requestPermission();
    return res === 'granted';
  }

  function scheduleTodayReminders(schedule, settings) {
    clearScheduled();
    if (!settings.notifEnabled) return;
    if (Notification.permission !== 'granted') return;
    const now = new Date();
    const todays = Scheduler.classesOnDate(schedule, now);
    const minsBefore = settings.notifMinutesBefore ?? 30;
    for (const c of todays) {
      const [h, m] = c.startTime.split(':').map(n => +n);
      const fire = new Date(now.getTime());
      fire.setHours(h, m, 0, 0);
      fire.setMinutes(fire.getMinutes() - minsBefore);
      const ms = fire.getTime() - now.getTime();
      if (ms <= 0) continue;
      const id = setTimeout(() => {
        try {
          new Notification(`${minsBefore} 分钟后上课`, {
            body: `${c.course}\n${c.startTime}-${c.endTime} ${c.room}`,
            tag: `${c.date}-${c.startTime}`,
            icon: 'icons/icon-192.png'
          });
        } catch (e) { /* ignore */ }
      }, ms);
      scheduledTimers.push(id);
    }
  }

  return {
    downloadICS,
    buildICS,
    ensurePermission,
    scheduleTodayReminders,
    clearScheduled
  };
})();
