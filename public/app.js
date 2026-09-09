const priceEl = document.getElementById("price");
const changeEl = document.getElementById("change");
const updatedEl = document.getElementById("updated");
const srListEl = document.getElementById("sr-list");
const chartContainerEl = document.getElementById("chart-container");
const chartRefreshEl = document.getElementById("chart-refresh");
const tfButtons = document.querySelectorAll("#tf-tabs button");

const aiSummarySubEl = document.getElementById("ai-summary-sub");
const aiSummaryStatsEl = document.getElementById("ai-summary-stats");
const aiSummaryChipsEl = document.getElementById("ai-summary-chips");
const aiSummaryTsEl = document.getElementById("ai-summary-ts");
const aiSummaryRefreshEl = document.getElementById("ai-summary-refresh");
const goldMarketStatusEl = document.getElementById("gold-market-status");

function chatLink(prompt) {
  return `/admin/chat?q=${encodeURIComponent(prompt)}`;
}

// This card now shows gold only — the stock half moved to its own card on
// the หุ้นไทย Dashboard (see stock-dashboard.js), both reading the same
// /api/dashboard-summary so they stay in sync from one shared digest.
function renderAiSummary(data) {
  applyMarketStatus(goldMarketStatusEl, getGoldMarketStatus());

  aiSummarySubEl.className = data.gold.available ? "digest-sub" : "digest-sub pending";
  aiSummarySubEl.innerHTML = data.gold.available ? data.gold.narrative : pendingBadge(data.gold.reason);

  const { goldChangePct, newsCount24h } = data.stats;
  const goldValueClass = goldChangePct === null ? "" : goldChangePct >= 0 ? "bull" : "bear";
  const goldValueText = goldChangePct === null ? "—" : `${goldChangePct >= 0 ? "+" : ""}${goldChangePct.toFixed(2)}%`;
  aiSummaryStatsEl.innerHTML = `
    <div class="digest-stat"><div class="n ${goldValueClass}">${goldValueText}</div><div class="l">ทอง 24 ชม.</div></div>
    <div class="digest-stat"><div class="n">${newsCount24h}</div><div class="l">ข่าวใหม่ 24 ชม.</div></div>`;

  const chipDefs = [
    ...(data.gold.available ? [{ label: "แนวรับ-ต้านทองตอนนี้", prompt: "แนวรับ-แนวต้านทองตอนนี้เท่าไหร่" }] : []),
    { label: "ข่าวล่าสุดมีอะไรบ้าง", prompt: "ข่าวทองล่าสุดมีอะไรบ้าง" },
  ];
  aiSummaryChipsEl.innerHTML = chipDefs
    .map((c) => `<a class="digest-chip" href="${chatLink(c.prompt)}">${c.label}</a>`)
    .join("");

  aiSummaryTsEl.textContent = new Date(data.generatedAt * 1000).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

async function loadAiSummary(forceRefresh = false) {
  try {
    const res = await fetch(`/api/dashboard-summary${forceRefresh ? "?refresh=1" : ""}`);
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    renderAiSummary(data);
  } catch {
    aiSummarySubEl.className = "digest-sub pending";
    aiSummarySubEl.innerHTML = pendingBadge("โหลดสรุปจาก AI ไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
    aiSummaryStatsEl.innerHTML = "";
    aiSummaryStocksEl.innerHTML = "";
    aiSummaryChipsEl.innerHTML = "";
  }
}

aiSummaryRefreshEl.addEventListener("click", () => {
  const svg = aiSummaryRefreshEl.querySelector("svg");
  svg.classList.add("spinning");
  aiSummaryRefreshEl.disabled = true;
  loadAiSummary(true).finally(() => {
    svg.classList.remove("spinning");
    aiSummaryRefreshEl.disabled = false;
  });
});

let currentTf = "H4";
let latestPrice = null;

function pendingBadge(message) {
  return `<span class="pending-badge"><span class="dot"></span>${message}</span>`;
}

async function loadPrice() {
  try {
    const res = await fetch("/api/price/gold");
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "fetch failed");
    latestPrice = data.price;
    priceEl.textContent = data.price.toFixed(2);
    updatedEl.textContent = `อัปเดตล่าสุด ${new Date(data.ts * 1000).toLocaleTimeString("th-TH")}`;
  } catch (err) {
    console.error("[gold] price fetch failed:", err.message);
    latestPrice = null;
    priceEl.textContent = "—";
    updatedEl.innerHTML = pendingBadge("ราคาทองยังใช้ไม่ได้ตอนนี้ ลองใหม่ภายหลัง");
  }
}

function renderSRList(levels) {
  if (!levels || levels.length === 0) {
    srListEl.innerHTML = pendingBadge("ยังไม่มีแนวรับ-แนวต้าน (ข้อมูลย้อนหลังยังน้อยเกินไป)");
    return;
  }
  srListEl.innerHTML = levels
    .sort((a, b) => b.price - a.price)
    .map(
      (lvl) => `
      <div class="sr-tile ${lvl.type}">
        <div class="p mono">${lvl.price.toFixed(2)}</div>
        <div class="l">${lvl.type === "resistance" ? "แนวต้าน" : "แนวรับ"} · ${lvl.methods.join("+")}</div>
      </div>`
    )
    .join("");
}

async function loadChartAndSR(tf) {
  srListEl.textContent = "กำลังโหลด…";
  chartContainerEl.innerHTML = "กำลังโหลด…";
  changeEl.textContent = "";

  const [historyRes, srRes] = await Promise.all([
    fetch(`/api/price/gold/history?tf=${tf}`).catch(() => null),
    fetch(`/api/sr/gold?tf=${tf}`).catch(() => null),
  ]);

  let candles = [];
  if (historyRes?.ok) {
    const data = await historyRes.json();
    candles = data.candles ?? [];
  } else if (historyRes) {
    console.error("[gold] history fetch failed:", (await historyRes.json().catch(() => ({}))).message);
  }

  let levels = [];
  let srOk = false;
  if (srRes?.ok) {
    const data = await srRes.json();
    levels = data.levels ?? [];
    srOk = true;
  } else if (srRes) {
    console.error("[gold] S/R fetch failed:", (await srRes.json().catch(() => ({}))).message);
  }

  if (candles.length === 0) {
    chartContainerEl.innerHTML = pendingBadge("โหลดกราฟไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
  } else {
    renderCandlestickChart(chartContainerEl, candles, levels, latestPrice ?? candles[candles.length - 1].close);
    const first = candles[0].open;
    const last = latestPrice ?? candles[candles.length - 1].close;
    const pct = ((last - first) / first) * 100;
    changeEl.innerHTML = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% <span class="muted" style="font-weight:400;">(ช่วงกราฟที่แสดง)</span>`;
    changeEl.style.color = pct >= 0 ? "oklch(0.72 0.15 150)" : "oklch(0.65 0.18 25)";
  }

  if (srOk) {
    renderSRList(levels);
  } else {
    srListEl.innerHTML = pendingBadge("โหลดแนวรับ-แนวต้านไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
  }
}

// Multi-timeframe buy/sell/hold signal (M15/H1/H4/D1/W1) — one shared fetch,
// re-rendered (not re-fetched) whenever the tf tab changes, since all 5
// timeframes come back from /api/signal/gold in a single call.
const signalBadgeEl = document.getElementById("signal-badge");
const signalBadgeTextEl = document.getElementById("signal-badge-text");
const tfSignalRowEl = document.getElementById("tf-signal-row");

const SIGNAL_LABEL_TH = { buy: "ซื้อ", sell: "ขาย", hold: "รอดู" };
let latestSignals = null; // TimeframeSignal[] from /api/signal/gold

function renderGoldSignal() {
  if (!latestSignals) return;

  const current = latestSignals.find((s) => s.tf === currentTf);
  signalBadgeEl.className = `signal-badge ${current ? current.signal : "hold"}`;
  signalBadgeTextEl.textContent = current ? SIGNAL_LABEL_TH[current.signal] : "—";

  tfSignalRowEl.innerHTML = latestSignals
    .map((s) => `<span class="tf-chip ${s.signal}">${s.tf}</span>`)
    .join("");
}

async function loadGoldSignal() {
  try {
    const res = await fetch("/api/signal/gold");
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "fetch failed");
    latestSignals = data.timeframes;
    renderGoldSignal();
  } catch (err) {
    console.error("[gold] signal fetch failed:", err.message);
    latestSignals = null;
    signalBadgeEl.className = "signal-badge hold";
    signalBadgeTextEl.textContent = "—";
    tfSignalRowEl.innerHTML = ["M15", "H1", "H4", "D1", "W1"].map((tf) => `<span class="tf-chip na">${tf}</span>`).join("");
  }
}

tfButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tfButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTf = btn.dataset.tf;
    loadChartAndSR(currentTf);
    renderGoldSignal(); // same 5-timeframe payload already in hand — no new fetch
  });
});

chartRefreshEl.addEventListener("click", () => {
  const svg = chartRefreshEl.querySelector("svg");
  svg.classList.add("spinning");
  chartRefreshEl.disabled = true;
  Promise.all([loadPrice(), loadChartAndSR(currentTf), loadGoldSignal()]).finally(() => {
    svg.classList.remove("spinning");
    chartRefreshEl.disabled = false;
  });
});

async function init() {
  await loadPrice();
  await loadChartAndSR(currentTf);
  loadAiSummary(); // independent of price/chart — don't block the rest of the page on it
  loadGoldSignal();
}

// Auto-refresh: paced, quota-conscious, and time-bounded (per user request
// 2026-09-09 — "ถ้าไม่เปิดหน้า browser ไว้ไม่ต้องยิง, หรือเปิดค้างไม่เกิน
// 5 นาที ขึ้น popup ให้ refresh"):
//   - skips the fetch entirely while the tab is hidden/backgrounded — a tab
//     left open in another window shouldn't keep spending Twelve Data calls
//   - stops after 5 minutes of wall-clock time regardless of visibility, so
//     a tab forgotten open for hours can't silently poll all day — instead
//     shows a banner asking for a manual refresh (which also restarts the
//     5-minute window)
const AUTO_REFRESH_INTERVAL_MS = 60_000;
const AUTO_REFRESH_MAX_DURATION_MS = 5 * 60_000;

const staleBannerEl = document.getElementById("stale-banner");
const staleRefreshBtnEl = document.getElementById("stale-refresh-btn");

let autoRefreshTimer = null;
let autoRefreshStartedAt = 0;

function stopAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
}

function showStaleBanner() {
  stopAutoRefresh();
  staleBannerEl.classList.add("show");
}

function startAutoRefresh() {
  autoRefreshStartedAt = Date.now();
  staleBannerEl.classList.remove("show");
  stopAutoRefresh();
  autoRefreshTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return; // backgrounded — skip this tick, no fetch spent

    if (Date.now() - autoRefreshStartedAt >= AUTO_REFRESH_MAX_DURATION_MS) {
      showStaleBanner();
      return;
    }

    loadPrice();
    loadChartAndSR(currentTf);
    loadGoldSignal();
  }, AUTO_REFRESH_INTERVAL_MS);
}

staleRefreshBtnEl.addEventListener("click", async () => {
  staleRefreshBtnEl.disabled = true;
  await loadPrice();
  await loadChartAndSR(currentTf);
  await loadGoldSignal();
  staleRefreshBtnEl.disabled = false;
  startAutoRefresh(); // manual refresh resets the 5-minute window
});

init().then(startAutoRefresh);
