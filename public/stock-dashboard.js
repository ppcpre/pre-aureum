const selectEl = document.getElementById("symbol-select");
const tfTabsEl = document.getElementById("tf-tabs");
const symbolLabelEl = document.getElementById("symbol-label");
const priceEl = document.getElementById("price");
const changeEl = document.getElementById("change");
const updatedEl = document.getElementById("updated");
const srListEl = document.getElementById("sr-list");
const chartContainerEl = document.getElementById("chart-container");

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

  try {
    const res = await fetch(`/api/price/stock/${symbol}`);
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    latestPrice = data.price;
    priceEl.textContent = data.price.toFixed(2);
    updatedEl.textContent = `อัปเดตล่าสุด ${new Date(data.ts * 1000).toLocaleTimeString("th-TH")}`;
  } catch {
    latestPrice = null;
    updatedEl.innerHTML = pendingBadge("โหลดราคาไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
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

async function init() {
  let data;
  try {
    const res = await fetch("/api/price/stock");
    if (!res.ok) throw new Error("failed to load watchlist");
    data = await res.json();
  } catch {
    selectEl.innerHTML = `<option>โหลดรายชื่อหุ้นไม่สำเร็จ</option>`;
    return;
  }

  // Native <select> — 50 symbols (SET50) is too many for a tab row, and a
  // native select gives free type-to-search without building a custom
  // dropdown component.
  selectEl.innerHTML = data.items.map((s) => `<option value="${s.symbol}">${s.symbol} · ${s.name}</option>`).join("");

  selectEl.addEventListener("change", () => {
    const item = data.items.find((s) => s.symbol === selectEl.value);
    symbolLabelEl.textContent = `${item.symbol} · ${item.name}`;
    loadSymbol(item.symbol);
  });

  if (data.items.length > 0) {
    symbolLabelEl.textContent = `${data.items[0].symbol} · ${data.items[0].name}`;
    loadSymbol(data.items[0].symbol);
  }
}

init();
