// Market open/closed status — computed purely client-side from the current
// time in Asia/Bangkok (works correctly regardless of the visitor's own
// timezone). No backend call needed; this is just a clock, not live data.
//
// Caveat (shown honestly, not hidden): this only models the regular weekly
// schedule. It does NOT know about Thai public holidays (SET) or gold-market
// holidays (e.g. Christmas, New Year's) — on those days it will say "open"
// when the real market is actually closed.

function bangkokNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());

  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: weekdayIndex[map.weekday], minutesOfDay: Number(map.hour) * 60 + Number(map.minute) };
}

/** Gold/XAU trades ~24h on weekdays via the global forex market: opens Mon 05:00 ICT, closes Sat 05:00 ICT. */
function getGoldMarketStatus() {
  const { weekday, minutesOfDay } = bangkokNow();
  const OPEN_MIN = 5 * 60;
  const closed = weekday === 0 || (weekday === 6 && minutesOfDay >= OPEN_MIN) || (weekday === 1 && minutesOfDay < OPEN_MIN);
  return { open: !closed, label: closed ? "ปิด (วันหยุดสุดสัปดาห์)" : "เปิดตลาด" };
}

/** SET: Mon-Fri, sessions 10:00-12:30 and 14:30-16:30 ICT. */
function getSetMarketStatus() {
  const { weekday, minutesOfDay: t } = bangkokNow();
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
