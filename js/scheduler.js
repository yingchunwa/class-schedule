// Pure functions to query the schedule by date.
const Scheduler = (() => {
  function pad2(n) { return String(n).padStart(2, '0'); }

  function isoDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  // 1=Mon ... 7=Sun
  function jsWeekday(date) {
    const d = date.getDay(); // 0=Sun..6=Sat
    return d === 0 ? 7 : d;
  }

  function classesOnDate(schedule, date) {
    if (!schedule || !schedule.classes) return [];
    const iso = isoDate(date);
    return schedule.classes
      .filter(c => c.date === iso)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  // returns array of length 7, each entry is {date: Date, iso, weekday, classes: []}
  function classesThisWeek(schedule, refDate) {
    const wd = jsWeekday(refDate);
    const monday = new Date(refDate.getTime());
    monday.setDate(monday.getDate() - (wd - 1));
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getTime());
      d.setDate(d.getDate() + i);
      days.push({
        date: d,
        iso: isoDate(d),
        weekday: i + 1,
        classes: classesOnDate(schedule, d)
      });
    }
    return days;
  }

  function nextClass(schedule, now) {
    if (!schedule || !schedule.classes) return null;
    const nowIso = isoDate(now);
    const nowTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    // remaining today
    const todays = classesOnDate(schedule, now);
    const upcomingToday = todays.find(c => c.startTime > nowTime);
    if (upcomingToday) return { ...upcomingToday, _future: false };
    // find first future class after today
    const future = schedule.classes
      .filter(c => c.date > nowIso)
      .sort((a, b) => a.date === b.date
        ? a.startTime.localeCompare(b.startTime)
        : a.date.localeCompare(b.date));
    return future[0] || null;
  }

  function currentOrPast(c, now) {
    const nowIso = isoDate(now);
    const nowTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    if (c.date < nowIso) return 'past';
    if (c.date > nowIso) return 'future';
    if (c.endTime <= nowTime) return 'past';
    if (c.startTime <= nowTime && nowTime < c.endTime) return 'current';
    return 'future';
  }

  const WEEKDAY_CN = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  function applyWeekOneOverride(schedule, isoOverride) {
    // Recompute every class's date based on (week, weekday) and the new anchor.
    if (!isoOverride) return schedule;
    const [y, m, d] = isoOverride.split('-').map(n => +n);
    const anchor = new Date(y, m - 1, d);
    const updated = { ...schedule, weekOneMonday: isoOverride };
    updated.classes = schedule.classes.map(c => {
      const newDate = new Date(anchor.getTime());
      newDate.setDate(newDate.getDate() + (c.week - 1) * 7 + (c.weekday - 1));
      return { ...c, date: isoDate(newDate) };
    });
    return updated;
  }

  // 班级过滤：返回该课程是否应该在该 group 下显示
  // 规则：
  //   - 课程带 G2 → 选 G2 时显示，选 G1 时根据是否也带 G1 决定
  //   - 课程带 G1 → 反之
  //   - 不带 G1/G2（合班课，如 'Embedded C Exam'）→ 永远显示
  function keepForGroup(course, group) {
    if (group === 'all') return true;
    const hasG1 = /\bG1\b/i.test(course);
    const hasG2 = /\bG2\b/i.test(course);
    if (group === 'G2') return hasG2 || !hasG1;
    if (group === 'G1') return hasG1 || !hasG2;
    return true;
  }

  function filterScheduleByGroup(schedule, group) {
    if (!schedule || !group || group === 'all') return schedule;
    return {
      ...schedule,
      classes: schedule.classes.filter(c => keepForGroup(c.course, group))
    };
  }

  return {
    isoDate,
    jsWeekday,
    classesOnDate,
    classesThisWeek,
    nextClass,
    currentOrPast,
    applyWeekOneOverride,
    keepForGroup,
    filterScheduleByGroup,
    WEEKDAY_CN
  };
})();
