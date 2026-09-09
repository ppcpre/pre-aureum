const searchFormEl = document.getElementById("symbol-search-group");
const searchEl = document.getElementById("symbol-search");
const suggestionsEl = document.getElementById("symbol-suggestions");
const tfTabsEl = document.getElementById("tf-tabs");
const symbolLabelEl = document.getElementById("symbol-label");
const priceEl = document.getElementById("price");
const changeEl = document.getElementById("change");
const updatedEl = document.getElementById("updated");
const srListEl = document.getElementById("sr-list");
const chartContainerEl = document.getElementById("chart-container");
const chartRefreshEl = document.getElementById("chart-refresh");
const setLinksEl = document.getElementById("set-links");

let currentSymbol = null;
let currentTf = "D1";
let latestPrice = null;

function pendingBadge(message) {
  return `<span class="pending-badge"><span class="dot"></span>${message}</span>`;
}

// --- AI summary card (stocks only — gold's half lives on the ทอง Dashboard's
// own card, see app.js). Both read the same /api/dashboard-summary so the
// two cards stay in sync from one shared, cached digest.
const aiSummaryStatsEl = document.getElementById("ai-summary-stats");
const aiSummaryStocksEl = document.getElementById("ai-summary-stocks");
const aiSummaryChipsEl = document.getElementById("ai-summary-chips");
const aiSummaryTsEl = document.getElementById("ai-summary-ts");
const aiSummaryRefreshEl = document.getElementById("ai-summary-refresh");
const setMarketStatusEl = document.getElementById("set-market-status");

const TAG_LABEL = { resistance: "ทะลุแนวต้าน", support: "ใกล้แนวรับ", gainer: "พุ่งแรง", loser: "ร่วงแรง" };

function chatLink(prompt) {
  return `/admin/chat?q=${encodeURIComponent(prompt)}`;
}

function renderStockSummary(data) {
  applyMarketStatus(setMarketStatusEl, getSetMarketStatus());

  const { stockSignalCount, stockWatchlistSize } = data.stats;
  aiSummaryStatsEl.innerHTML = `
    <div class="digest-stat"><div class="n">${stockSignalCount} / ${stockWatchlistSize}</div><div class="l">หุ้นที่มีสัญญาณ</div></div>`;

  if (data.stocks.length > 0) {
    // The card only ever lists the top N biggest movers (see dashboard-summary.ts) — the stat
    // tile above shows the true total, and this link is how you reach the rest of them.
    const moreCount = stockSignalCount - data.stocks.length;
    aiSummaryStocksEl.innerHTML = `
      <div class="digest-list">
        ${data.stocks
          .map(
            (s) => `
          <div class="digest-row">
            <span class="sym mono">${s.symbol}</span>
            <span class="note">${s.note}</span>
            <span class="tag ${s.tag}">${TAG_LABEL[s.tag]}</span>
          </div>`
          )
          .join("")}
      </div>
      ${moreCount > 0 ? `<a class="digest-more-link" href="/screener">ดูอีก ${moreCount} ตัวที่มีสัญญาณใน Screener →</a>` : ""}`;
  } else {
    aiSummaryStocksEl.innerHTML = pendingBadge("ยังไม่มีหุ้นที่มีสัญญาณเด่นตอนนี้");
  }

  const chipDefs = data.stocks.slice(0, 3).map((s) => ({ label: `ขยายความเรื่อง ${s.symbol}`, prompt: `ขยายความเรื่อง ${s.symbol} หน่อย` }));
  aiSummaryChipsEl.innerHTML = chipDefs.map((c) => `<a class="digest-chip" href="${chatLink(c.prompt)}">${c.label}</a>`).join("");

  aiSummaryTsEl.textContent = new Date(data.generatedAt * 1000).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

async function loadStockSummary(forceRefresh = false) {
  try {
    const res = await fetch(`/api/dashboard-summary${forceRefresh ? "?refresh=1" : ""}`);
    if (!res.ok) throw new Error("failed");
    renderStockSummary(await res.json());
  } catch {
    aiSummaryStocksEl.innerHTML = pendingBadge("โหลดสรุปจาก AI ไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
    aiSummaryStatsEl.innerHTML = "";
    aiSummaryChipsEl.innerHTML = "";
  }
}

aiSummaryRefreshEl.addEventListener("click", () => {
  const svg = aiSummaryRefreshEl.querySelector("svg");
  svg.classList.add("spinning");
  aiSummaryRefreshEl.disabled = true;
  loadStockSummary(true).finally(() => {
    svg.classList.remove("spinning");
    aiSummaryRefreshEl.disabled = false;
  });
});

loadStockSummary();

function renderSRList(levels) {
  if (!levels || levels.length === 0) {
    srListEl.innerHTML = pendingBadge("ยังไม่มีแนวรับ-แนวต้าน (ข้อมูลย้อนหลังยังน้อยเกินไป)");
    return;
  }
  srListEl.innerHTML = levels
    .sort((a, b) => b.price - a.price)
    .map(
      (lvl) => `
      <div class="sr-row ${lvl.type}">
        <div>
          <div class="mono" style="font-weight:700;">${lvl.price.toFixed(2)}</div>
          <div class="muted">${lvl.methods.join(" + ")}</div>
        </div>
        <span class="tag ${lvl.type}">${lvl.type === "resistance" ? "แนวต้าน" : "แนวรับ"}</span>
      </div>`
    )
    .join("");
}

async function loadSymbol(symbol) {
  currentSymbol = symbol;
  priceEl.textContent = "–";
  changeEl.textContent = "";
  updatedEl.textContent = "กำลังโหลด…";
  srListEl.textContent = "กำลังโหลด…";
  chartContainerEl.innerHTML = "กำลังโหลด…";
  setLinksEl.innerHTML = renderSetLinks(symbol);

  try {
    const res = await fetch(`/api/price/stock/${symbol}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || "fetch failed");
    }
    const data = await res.json();
    latestPrice = data.price;
    priceEl.textContent = data.price.toFixed(2);
    updatedEl.textContent = `อัปเดตล่าสุด ${new Date(data.ts * 1000).toLocaleTimeString("th-TH")}`;
  } catch (err) {
    console.error(`[stock] price fetch failed for ${symbol}:`, err.message);
    latestPrice = null;
    // Any failure here (unofficial feed, so a typo'd or delisted ticker looks
    // identical to a network hiccup from here) reads honestly as "couldn't find it".
    updatedEl.innerHTML = pendingBadge(`ไม่พบข้อมูลหุ้น "${symbol}" ตรวจสอบชื่อย่ออีกครั้ง หรือลองรีเฟรช`);
  }

  await loadChartAndSR();
}

async function loadChartAndSR() {
  if (!currentSymbol) return;
  chartContainerEl.innerHTML = "กำลังโหลด…";
  srListEl.textContent = "กำลังโหลด…";

  const [historyRes, srRes] = await Promise.all([
    fetch(`/api/price/stock/${currentSymbol}/history?tf=${currentTf}`).catch(() => null),
    fetch(`/api/sr/stock/${currentSymbol}?tf=${currentTf}`).catch(() => null),
  ]);

  let candles = [];
  if (historyRes?.ok) {
    const data = await historyRes.json();
    candles = data.candles ?? [];
  }

  let levels = [];
  let srOk = false;
  if (srRes?.ok) {
    const data = await srRes.json();
    levels = data.levels ?? [];
    srOk = true;
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

tfTabsEl.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => {
    tfTabsEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTf = btn.dataset.tf;
    loadChartAndSR();
  });
});

chartRefreshEl.addEventListener("click", () => {
  if (!currentSymbol) return;
  const svg = chartRefreshEl.querySelector("svg");
  svg.classList.add("spinning");
  chartRefreshEl.disabled = true;
  loadSymbol(currentSymbol).finally(() => {
    svg.classList.remove("spinning");
    chartRefreshEl.disabled = false;
  });
});

// Symbol name lookup (for the curated SET50 watchlist) — populated in init().
// A symbol typed outside that list just shows as itself, with no Thai name
// (honest: we don't have one to show, not a placeholder/guess).
let watchlistBySymbol = new Map();

function submitSymbol() {
  const symbol = searchEl.value.trim().toUpperCase();
  if (!symbol) return;
  const known = watchlistBySymbol.get(symbol);
  symbolLabelEl.textContent = known ? `${symbol} · ${known.name}` : symbol;
  searchEl.value = symbol;
  loadSymbol(symbol);
}

// A <form> submit (not a manual keydown listener) is what reliably catches
// Enter here — a plain keydown handler on the input missed Enter presses
// while the <datalist> suggestion dropdown was open (verified in-browser,
// not assumed): the browser's own native "Enter submits the form" handling
// interacts correctly with that dropdown where a hand-rolled listener didn't.
searchFormEl.addEventListener("submit", (e) => {
  e.preventDefault();
  submitSymbol();
});

async function init() {
  let data;
  try {
    const res = await fetch("/api/price/stock");
    if (!res.ok) throw new Error("failed to load watchlist");
    data = await res.json();
  } catch {
    searchEl.placeholder = "โหลดรายชื่อหุ้นแนะนำไม่สำเร็จ — แต่ยังพิมพ์ชื่อย่อหุ้นเองได้";
    return;
  }

  watchlistBySymbol = new Map(data.items.map((s) => [s.symbol, s]));

  // <datalist> gives free type-ahead suggestions from the curated SET50 list
  // WITHOUT restricting input to it — unlike the old <select>, any symbol can
  // still be typed and submitted (per user request 2026-09-08: "เปิดให้พิมพ์
  // ชื่อหุ้นได้" — fetch S/R only for the one stock someone actually wants).
  suggestionsEl.innerHTML = data.items.map((s) => `<option value="${s.symbol}">${s.symbol} · ${s.name}</option>`).join("");

  if (data.items.length > 0) {
    searchEl.value = data.items[0].symbol;
    symbolLabelEl.textContent = `${data.items[0].symbol} · ${data.items[0].name}`;
    loadSymbol(data.items[0].symbol);
  }
}

init();
