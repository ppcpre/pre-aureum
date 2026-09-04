const tabsEl = document.getElementById("symbol-tabs");
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
    tabsEl.innerHTML = pendingBadge("โหลดรายชื่อหุ้นไม่สำเร็จ");
    return;
  }

  tabsEl.innerHTML = data.items
    .map((s, i) => `<button data-symbol="${s.symbol}" class="${i === 0 ? "active" : ""}">${s.symbol}</button>`)
    .join("");

  tabsEl.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabsEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const item = data.items.find((s) => s.symbol === btn.dataset.symbol);
      symbolLabelEl.textContent = `${item.symbol} · ${item.name}`;
      loadSymbol(item.symbol);
    });
  });

  if (data.items.length > 0) {
    symbolLabelEl.textContent = `${data.items[0].symbol} · ${data.items[0].name}`;
    loadSymbol(data.items[0].symbol);
  }
}

init();
