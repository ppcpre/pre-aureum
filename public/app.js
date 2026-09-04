const priceEl = document.getElementById("price");
const changeEl = document.getElementById("change");
const updatedEl = document.getElementById("updated");
const srListEl = document.getElementById("sr-list");
const chartContainerEl = document.getElementById("chart-container");
const tfButtons = document.querySelectorAll("#tf-tabs button");

const aiSummaryBodyEl = document.getElementById("ai-summary-body");
const aiSummaryFootEl = document.getElementById("ai-summary-foot");
const aiSummaryTsEl = document.getElementById("ai-summary-ts");
const aiSummaryRefreshEl = document.getElementById("ai-summary-refresh");

const SENTIMENT_LABEL = { bull: "โทนข่าว: ขาขึ้น", bear: "โทนข่าว: ขาลง", neutral: "โทนข่าว: เป็นกลาง" };
const SENTIMENT_ARROW = {
  bull: `<path d="M4 17 L11 10 L15 14 L20 6" stroke-linecap="round" stroke-linejoin="round"/>`,
  bear: `<path d="M4 7 L11 14 L15 10 L20 18" stroke-linecap="round" stroke-linejoin="round"/>`,
  neutral: `<path d="M4 12 H20" stroke-linecap="round"/>`,
};
const TAG_LABEL = { resistance: "ทะลุแนวต้าน", support: "ใกล้แนวรับ", gainer: "พุ่งแรง", loser: "ร่วงแรง" };

function renderAiSummary(data) {
  const parts = [];

  if (data.gold.available) {
    parts.push(`
      <div>
        <div class="ai-col-title">ทอง · XAU/USD</div>
        <span class="sentiment-pill ${data.gold.sentiment}">
          <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">${SENTIMENT_ARROW[data.gold.sentiment]}</svg>
          ${SENTIMENT_LABEL[data.gold.sentiment]}
        </span>
        <p class="ai-narrative">${data.gold.narrative}</p>
      </div>`);
  } else {
    parts.push(`
      <div>
        <div class="ai-col-title">ทอง · XAU/USD</div>
        ${pendingBadge(data.gold.reason)}
      </div>`);
  }

  if (data.stocks.length > 0) {
    parts.push(`
      <div>
        <div class="ai-col-title">หุ้นไทยที่น่าสนใจ</div>
        <div class="stock-pick-list">
          ${data.stocks
            .map(
              (s) => `
            <div class="stock-pick">
              <span class="sym mono">${s.symbol}</span>
              <span class="reason">${s.note}</span>
              <span class="tag ${s.tag}">${TAG_LABEL[s.tag]}</span>
            </div>`
            )
            .join("")}
        </div>
      </div>`);
  } else {
    parts.push(`
      <div>
        <div class="ai-col-title">หุ้นไทยที่น่าสนใจ</div>
        ${pendingBadge("ยังไม่มีหุ้นที่มีสัญญาณเด่นตอนนี้")}
      </div>`);
  }

  aiSummaryBodyEl.innerHTML = parts.join("");
  aiSummaryFootEl.style.display = data.gold.available || data.stocks.length > 0 ? "flex" : "none";
  aiSummaryTsEl.textContent = `อัปเดต ${new Date(data.generatedAt * 1000).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
}

async function loadAiSummary(forceRefresh = false) {
  try {
    const res = await fetch(`/api/dashboard-summary${forceRefresh ? "?refresh=1" : ""}`);
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    renderAiSummary(data);
  } catch {
    aiSummaryBodyEl.innerHTML = pendingBadge("โหลดสรุปจาก AI ไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
    aiSummaryFootEl.style.display = "none";
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
    if (!res.ok) throw new Error("not configured");
    const data = await res.json();
    latestPrice = data.price;
    priceEl.textContent = data.price.toFixed(2);
    updatedEl.textContent = `อัปเดตล่าสุด ${new Date(data.ts * 1000).toLocaleTimeString("th-TH")}`;
  } catch {
    latestPrice = null;
    priceEl.textContent = "—";
    updatedEl.innerHTML = pendingBadge("รอเชื่อมต่อข้อมูลราคา (Twelve Data API key)");
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
  }

  let levels = [];
  let srOk = false;
  if (srRes?.ok) {
    const data = await srRes.json();
    levels = data.levels ?? [];
    srOk = true;
  }

  if (candles.length === 0) {
    chartContainerEl.innerHTML = pendingBadge("รอเชื่อมต่อข้อมูลราคา (Twelve Data API key)");
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
    srListEl.innerHTML = pendingBadge("รอเชื่อมต่อข้อมูลราคา (Twelve Data API key)");
  }
}

tfButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tfButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTf = btn.dataset.tf;
    loadChartAndSR(currentTf);
  });
});

async function init() {
  await loadPrice();
  await loadChartAndSR(currentTf);
  loadAiSummary(); // independent of price/chart — don't block the rest of the page on it
}

init();
setInterval(async () => {
  await loadPrice();
  loadChartAndSR(currentTf);
}, 60_000);
