// Market open/closed status — computed purely client-side from the current
// time in Asia/Bangkok (works correctly regardless of the visitor's own
// timezone). No backend call needed; this is just a clock, not live data.

function bangkokNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());

  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayIndex[map.weekday],
    minutesOfDay: Number(map.hour) * 60 + Number(map.minute),
    dateStr: `${map.year}-${map.month}-${map.day}`, // e.g. "2026-10-13" — matches HOLIDAYS' date keys directly
  };
}

// ตามที่ขอ ("วันหยุดตลาด ให้ทำแค่ label บอกล่วงหน้าไว้ก็พอ", 2026-09-10) — แค่
// รายชื่อวันหยุดตรงๆ ให้ขึ้น label ล่วงหน้า + ขึ้น "ปิด" ให้ถูกในวันนั้นจริง
// ไม่ได้พยายามคำนวณปฏิทินวันหยุดเองหรือเดา — วันที่ทุกตัวเช็คตรงจากเว็บทางการ
//
// SET: ดึงจาก https://www.set.or.th/en/about/event-calendar/holiday ตรงๆ
// (เข้าไปอ่านหน้าเว็บจริง ไม่ใช่เดา หรือเชื่อ aggregator เว็บอื่นเฉยๆ) — ปี 2026
// เท่านั้น ปีถัดไปต้องมาอัปเดตรายการนี้เองตอน SET ประกาศออกมา (ปกติประกาศ
// ล่วงหน้าไม่กี่เดือนก่อนสิ้นปี)
const SET_HOLIDAYS_2026 = [
  { date: "2026-01-01", label: "วันขึ้นปีใหม่" },
  { date: "2026-01-02", label: "วันหยุดพิเศษเพิ่มเติม" },
  { date: "2026-03-03", label: "วันมาฆบูชา" },
  { date: "2026-04-06", label: "วันจักรี" },
  { date: "2026-04-13", label: "วันสงกรานต์" },
  { date: "2026-04-14", label: "วันสงกรานต์" },
  { date: "2026-04-15", label: "วันสงกรานต์" },
  { date: "2026-05-01", label: "วันแรงงานแห่งชาติ" },
  { date: "2026-05-04", label: "วันฉัตรมงคล" },
  { date: "2026-06-01", label: "ชดเชยวันวิสาขบูชา" },
  { date: "2026-06-03", label: "วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี" },
  { date: "2026-07-28", label: "วันเฉลิมพระชนมพรรษา ร.10" },
  { date: "2026-07-29", label: "วันอาสาฬหบูชา" },
  { date: "2026-08-12", label: "วันแม่แห่งชาติ" },
  { date: "2026-10-13", label: "วันคล้ายวันสวรรคต ร.9" },
  { date: "2026-10-16", label: "วันหยุดพิเศษเพิ่มเติม" },
  { date: "2026-10-23", label: "วันปิยมหาราช" },
  { date: "2026-12-07", label: "ชดเชยวันพ่อแห่งชาติ" },
  { date: "2026-12-10", label: "วันรัฐธรรมนูญ" },
  { date: "2026-12-31", label: "วันสิ้นปี" },
];

// ทอง/forex ไม่มีปฏิทินวันหยุดทางการแบบ SET — ตลาดเปิดเกือบ 24 ชม. 5 วัน/สัปดาห์
// วันที่ตลาดหลักทั่วโลกหยุดพร้อมกันจริงมีแค่ 2 วันที่ยอมรับกันทั่วไป (เช็คแล้วผ่าน
// หลายแหล่งตรงกัน): คริสต์มาสกับวันขึ้นปีใหม่ วันอื่นเป็นแค่ volume บางลง ไม่ใช่ปิดจริง
const GOLD_HOLIDAYS_2026 = [
  { date: "2026-12-25", label: "วันคริสต์มาส" },
];

const HOLIDAY_NOTICE_WINDOW_DAYS = 7; // "บอกล่วงหน้า" แค่ภายใน 1 สัปดาห์ ไม่ต้องโชว์ทั้งปี

function findHolidayOn(holidays, dateStr) {
  return holidays.find((h) => h.date === dateStr);
}

/** Next holiday strictly after today, within HOLIDAY_NOTICE_WINDOW_DAYS — or null if none (list exhausted, or too far out). */
function findUpcomingHoliday(holidays, todayStr) {
  const today = new Date(todayStr + "T00:00:00Z");
  for (const h of holidays) {
    const days = Math.round((new Date(h.date + "T00:00:00Z") - today) / 86400000);
    if (days > 0 && days <= HOLIDAY_NOTICE_WINDOW_DAYS) return { ...h, daysAway: days };
  }
  return null;
}

/** Gold/XAU trades ~24h on weekdays via the global forex market: opens Mon 05:00 ICT, closes Sat 05:00 ICT. */
function getGoldMarketStatus() {
  const { weekday, minutesOfDay, dateStr } = bangkokNow();

  const holidayToday = findHolidayOn(GOLD_HOLIDAYS_2026, dateStr);
  if (holidayToday) return { open: false, label: `ปิด (${holidayToday.label})` };

  const OPEN_MIN = 5 * 60;
  const closed = weekday === 0 || (weekday === 6 && minutesOfDay >= OPEN_MIN) || (weekday === 1 && minutesOfDay < OPEN_MIN);
  return { open: !closed, label: closed ? "ปิด (วันหยุดสุดสัปดาห์)" : "เปิดตลาด" };
}

/** SET: Mon-Fri, sessions 10:00-12:30 and 14:30-16:30 ICT. */
function getSetMarketStatus() {
  const { weekday, minutesOfDay: t, dateStr } = bangkokNow();

  const holidayToday = findHolidayOn(SET_HOLIDAYS_2026, dateStr);
  if (holidayToday) return { open: false, label: `ปิด (${holidayToday.label})` };

  if (weekday === 0 || weekday === 6) return { open: false, label: "ปิด (วันหยุดสุดสัปดาห์)" };

  const morningOpen = 10 * 60;
  const morningClose = 12 * 60 + 30;
  const afternoonOpen = 14 * 60 + 30;
  const afternoonClose = 16 * 60 + 30;

  if (t >= morningOpen && t < morningClose) return { open: true, label: "เปิดตลาด (ภาคเช้า)" };
  if (t >= afternoonOpen && t < afternoonClose) return { open: true, label: "เปิดตลาด (ภาคบ่าย)" };
  if (t < morningOpen) return { open: false, label: "ปิด (เปิด 10:00 น.)" };
  if (t >= morningClose && t < afternoonOpen) return { open: false, label: "พักเที่ยง (เปิดอีกครั้ง 14:30 น.)" };
  return { open: false, label: "ปิดตลาดแล้ววันนี้ (เปิดอีกครั้ง 10:00 น. พรุ่งนี้)" };
}

/** Updates an existing <span> in place (keeps the element reference valid across repeated calls, e.g. on refresh). */
function applyMarketStatus(el, status) {
  el.className = `market-status ${status.open ? "open" : "closed"}`;
  el.innerHTML = `<span class="dot"></span>${status.label}`;
}

/**
 * Advance notice for an upcoming holiday (within a week) — separate from
 * applyMarketStatus() above, which only reflects *today*. Hides the element
 * entirely when there's nothing upcoming, rather than leaving stale text.
 * Reuses the app's existing .pending-badge look (same amber "heads up"
 * style as every other advance-notice/fallback message in this app) instead
 * of introducing a new visual style just for this.
 */
function applyHolidayNotice(el, holidays) {
  const { dateStr } = bangkokNow();
  const upcoming = findUpcomingHoliday(holidays, dateStr);
  if (!upcoming) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.className = "pending-badge";
  const dayWord = upcoming.daysAway === 1 ? "พรุ่งนี้" : `อีก ${upcoming.daysAway} วัน`;
  el.innerHTML = `<span class="dot"></span>${dayWord}ตลาดปิด: ${upcoming.label}`;
}
