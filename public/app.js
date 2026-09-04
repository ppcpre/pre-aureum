const priceEl = document.getElementById("price");
const changeEl = document.getElementById("change");
const updatedEl = document.getElementById("updated");
const srListEl = document.getElementById("sr-list");
const chartContainerEl = document.getElementById("chart-container");
const tfButtons = document.querySelectorAll("#tf-tabs button");

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
}

init();
setInterval(async () => {
  await loadPrice();
  loadChartAndSR(currentTf);
}, 60_000);
