// Parse the schedule Excel file into a normalized JSON structure.
//
// Output:
// {
//   importedAt: ISO string,
//   sourceFile: string,
//   weekOneMonday: 'YYYY-MM-DD',  // inferred (overridable)
//   classes: [
//     { week, weekday, date, course, startTime, endTime, room }, ...
//   ],
//   stats: { totalCells, parsedClasses, weeksSeen: [..], months: [..] }
// }
//
// Strategy: don't rely on rigid row offsets. Anchor on cells whose text matches
// a time-range regex; the cell above is the course, the cell below is the room.
const Parser = (() => {
  const DATA_COLS = [3, 5, 7, 9, 11, 13, 15];  // D F H J L N P (0-indexed) → Mon..Sun
  const TIME_RE = /(\d{1,2})[:：](\d{2})\s*[-~–—]\s*(\d{1,2})[:：](\d{2})/;
  const MONTH_RE = /(\d{4})\.(\d{1,2})/;
  const STOP_RE = /暑假|考勤事项|考试安排|课程助教/;

  function pad2(n) { return String(n).padStart(2, '0'); }

  function isoDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  function cellStr(v) {
    if (v == null) return '';
    if (typeof v === 'number') return String(v);
    return String(v).trim();
  }

  async function parseFile(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    if (!wb.SheetNames.includes('课表')) {
      throw new Error('未找到「课表」工作表');
    }
    const ws = wb.Sheets['课表'];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true });
    return parseGrid(aoa, file.name);
  }

  function parseGrid(aoa, sourceFile) {
    // 1) Find stop row (metadata starts)
    let stopRow = aoa.length;
    for (let r = 0; r < aoa.length; r++) {
      const a = cellStr(aoa[r]?.[0]);
      if (a && STOP_RE.test(a)) {
        stopRow = r;
        break;
      }
    }

    // 2) Find month-header rows (col A contains YYYY.MM)
    const monthBlocks = [];
    for (let r = 0; r < stopRow; r++) {
      const a = cellStr(aoa[r]?.[0]);
      const m = a && a.match(MONTH_RE);
      if (m) {
        monthBlocks.push({ row: r, year: +m[1], month: +m[2] });
      }
    }
    if (monthBlocks.length === 0) {
      throw new Error('未找到月份标识（如 2026.03）');
    }

    // 3) Establish global anchor: week-1 Monday date.
    //    In the first month block, find row where col B = 1 and col C is a number;
    //    that number is the day-of-month for that week's Monday.
    let weekOneMonday = null;
    const firstBlock = monthBlocks[0];
    const firstBlockEnd = monthBlocks[1]?.row ?? stopRow;
    for (let r = firstBlock.row + 1; r < firstBlockEnd; r++) {
      if (aoa[r]?.[1] === 1 && typeof aoa[r]?.[2] === 'number') {
        const dayMon = aoa[r][2];
        weekOneMonday = new Date(firstBlock.year, firstBlock.month - 1, dayMon);
        break;
      }
    }
    if (!weekOneMonday) {
      throw new Error('无法推断第 1 周周一的日期，请在设置中手动指定');
    }

    // 4) Find all week-number rows: col B is an integer in [1, 40] AND at least one
    //    of the weekday-number cells (C/E/G/I/K/M/O) is numeric. The "any of" check
    //    matters for weeks that start mid-week (e.g. July week 18 starts Wed because
    //    July 1, 2026 is a Wednesday → Mon/Tue cells are empty).
    const DAY_NUM_COLS = [2, 4, 6, 8, 10, 12, 14];
    const weekRows = [];
    for (let r = 0; r < stopRow; r++) {
      const b = aoa[r]?.[1];
      if (!(Number.isInteger(b) && b >= 1 && b <= 40)) continue;
      const hasDayNumber = DAY_NUM_COLS.some(col => typeof aoa[r]?.[col] === 'number');
      if (hasDayNumber) weekRows.push({ row: r, week: b });
    }
    if (weekRows.length === 0) {
      throw new Error('未找到任何周次行');
    }

    // 5) For each week row, scan data rows up to next week row.
    //    For each weekday column, look for time-format cells and capture surrounding course/room.
    const seen = new Set();
    const classes = [];
    let timeCellCount = 0;

    for (let i = 0; i < weekRows.length; i++) {
      const { row, week } = weekRows[i];
      const nextRow = i + 1 < weekRows.length ? weekRows[i + 1].row : stopRow;

      for (let c = 0; c < 7; c++) {
        const col = DATA_COLS[c];
        const weekday = c + 1;  // 1=Mon, 7=Sun
        const classDate = addDays(weekOneMonday, (week - 1) * 7 + (weekday - 1));
        const dateIso = isoDate(classDate);

        for (let r = row + 1; r < nextRow; r++) {
          const val = cellStr(aoa[r]?.[col]);
          if (!val) continue;
          const m = val.match(TIME_RE);
          if (!m) continue;
          timeCellCount++;

          const startTime = `${pad2(+m[1])}:${m[2]}`;
          const endTime = `${pad2(+m[3])}:${m[4]}`;
          const course = cellStr(aoa[r - 1]?.[col]);
          const rawRoom = cellStr(aoa[r + 1]?.[col]);
          if (!course) continue;
          // Room can be missing (e.g., exams listed without a venue) — fall back gracefully.
          const room = rawRoom || '教室待定';

          const key = `${dateIso}|${startTime}|${course}|${room}`;
          if (seen.has(key)) continue;
          seen.add(key);

          classes.push({
            week,
            weekday,
            date: dateIso,
            course,
            startTime,
            endTime,
            room
          });
        }
      }
    }

    classes.sort((a, b) =>
      a.date === b.date
        ? a.startTime.localeCompare(b.startTime)
        : a.date.localeCompare(b.date)
    );

    return {
      importedAt: new Date().toISOString(),
      sourceFile: sourceFile || '',
      weekOneMonday: isoDate(weekOneMonday),
      classes,
      stats: {
        timeCells: timeCellCount,
        parsedClasses: classes.length,
        weeksSeen: [...new Set(classes.map(c => c.week))].sort((a, b) => a - b),
        months: monthBlocks.map(b => `${b.year}-${pad2(b.month)}`)
      }
    };
  }

  return { parseFile, parseGrid, isoDate, addDays };
})();
