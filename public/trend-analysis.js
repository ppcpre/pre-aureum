/**
 * "RSI & แนวรับแนวต้าน" page — a candlestick chart with an auto-fitted price
 * trend channel (diagonal resistance/support lines connecting recent swing
 * highs/lows, per the reference charts the user shared) stacked above an
 * RSI(14) panel with its own trend channel, RSI=50 crossing markers, and a
 * plain-language list of crossing points + divergence below.
 *
 * Deliberately separate from the horizontal S/R levels already on the gold
 * Dashboard (index.html/app.js) — this page is about the diagonal trend
 * channel + RSI, not a replacement for the existing pivot/swing S/R feature.
 *
 * Reuses resolveColor() from candlestick-chart.js (loaded before this file,
 * same non-module <script> global scope) so trend-channel colors stay
 * pixel-identical to the rest of the app's oklch tokens.
 */

const tfButtons = document.querySelectorAll("#tf-tabs button");
const trendRefreshEl = document.getElementById("trend-refresh");
const priceContainerEl = document.getElementById("trend-price-container");
const rsiContainerEl = document.getElementById("trend-rsi-container");
const crossingListEl = document.getElementById("crossing-list");
const divergenceListEl = document.getElementById("divergence-list");

let currentTf = "H4";
let priceChart = null;
let rsiChart = null;

function pendingBadge(message) {
  return `<span class="pending-badge"><span class="dot"></span>${message}</span>`;
}

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

/** Keep both charts' visible time range in lockstep so scrolling/zooming one moves the other. */
function syncTimeScales(a, b) {
  let syncing = false;
  a.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (syncing || !range) return;
    syncing = true;
    b.timeScale().setVisibleLogicalRange(range);
    syncing = false;
  });
  b.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (syncing || !range) return;
    syncing = true;
    a.timeScale().setVisibleLogicalRange(range);
    syncing = false;
  });
}

function renderCharts(data) {
  const { candles, rsi, priceTrendlines, rsiTrendlines, rsiCrossings } = data;

  if (priceChart) { priceChart.remove(); priceChart = null; }
  if (rsiChart) { rsiChart.remove(); rsiChart = null; }
  priceContainerEl.innerHTML = "";
  rsiContainerEl.innerHTML = "";

  if (!candles || candles.length === 0) {
    priceContainerEl.innerHTML = pendingBadge("ยังไม่มีข้อมูลกราฟ (ข้อมูลย้อนหลังยังน้อยเกินไป)");
    rsiContainerEl.innerHTML = "";
    return;
  }

  const GREEN = resolveColor("oklch(0.72 0.15 150)");
  const RED = resolveColor("oklch(0.65 0.18 25)");
  const GOLD = resolveColor("oklch(0.75 0.14 85)");
  const BORDER = resolveColor("oklch(0.29 0.008 250)");
  const MUTED = resolveColor("oklch(0.60 0.01 250)");

  const commonOptions = {
    layout: { background: { color: "transparent" }, textColor: MUTED, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 },
    grid: { vertLines: { visible: false }, horzLines: { color: BORDER } },
    rightPriceScale: { borderColor: BORDER },
    timeScale: { borderColor: BORDER, timeVisible: true, secondsVisible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    handleScroll: true,
    handleScale: true,
  };

  // --- Price chart: candles + diagonal trend channel ---
  priceChart = LightweightCharts.createChart(priceContainerEl, {
    ...commonOptions,
    width: priceContainerEl.clientWidth,
    height: priceContainerEl.clientHeight,
    timeScale: { ...commonOptions.timeScale, visible: false }, // shared with the RSI chart's axis below
  });

  const candleSeries = priceChart.addCandlestickSeries({
    upColor: GREEN, downColor: RED, borderUpColor: GREEN, borderDownColor: RED, wickUpColor: GREEN, wickDownColor: RED,
  });
  candleSeries.setData(candles.map((c) => ({ time: c.ts, open: c.open, high: c.high, low: c.low, close: c.close })));

  function addTrendLine(chart, line, color) {
    if (!line) return;
    const series = chart.addLineSeries({ color, lineWidth: 2, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    series.setData([
      { time: line.start.ts, value: line.start.price },
      { time: line.end.ts, value: line.end.price },
    ]);
  }
  addTrendLine(priceChart, priceTrendlines.resistance, RED);
  addTrendLine(priceChart, priceTrendlines.support, GREEN);

  // --- RSI chart: oscillator line + its own trend channel + 30/50/70 refs + crossing markers ---
  rsiChart = LightweightCharts.createChart(rsiContainerEl, {
    ...commonOptions,
    width: rsiContainerEl.clientWidth,
    height: rsiContainerEl.clientHeight,
  });

  const rsiSeries = rsiChart.addLineSeries({ color: GOLD, lineWidth: 2, lastValueVisible: true, priceLineVisible: false });
  rsiSeries.setData((rsi || []).map((p) => ({ time: p.ts, value: p.value })));
  rsiSeries.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });

  rsiSeries.createPriceLine({ price: 70, color: RED, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: "70" });
  rsiSeries.createPriceLine({ price: 50, color: MUTED, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: "50" });
  rsiSeries.createPriceLine({ price: 30, color: GREEN, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: "30" });

  addTrendLine(rsiChart, rsiTrendlines.resistance, RED);
  addTrendLine(rsiChart, rsiTrendlines.support, GREEN);

  if (rsiCrossings && rsiCrossings.length > 0) {
    rsiSeries.setMarkers(
      rsiCrossings.map((cr) => ({
        time: cr.ts,
        position: cr.direction === "up" ? "belowBar" : "aboveBar",
        color: cr.direction === "up" ? GREEN : RED,
        shape: "circle",
        text: "50",
      }))
    );
  }

  const resizePrice = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    if (width > 0 && height > 0) priceChart.applyOptions({ width, height });
  });
  resizePrice.observe(priceContainerEl);
  const resizeRsi = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    if (width > 0 && height > 0) rsiChart.applyOptions({ width, height });
  });
  resizeRsi.observe(rsiContainerEl);

  // Fit both charts to their full data BEFORE wiring up the live pan/zoom
  // sync below — otherwise the RSI chart's own (narrower, shorter-series)
  // default auto-range fires a range-change event that the sync immediately
  // echoes back onto the price chart, clobbering its just-set full-content
  // view down to just the last few bars (reproduced directly against
  // production data, not a guess).
  priceChart.timeScale().fitContent();
  rsiChart.timeScale().fitContent();
  syncTimeScales(priceChart, rsiChart);
}

function renderCrossings(rsiCrossings) {
  if (!rsiCrossings || rsiCrossings.length === 0) {
    crossingListEl.innerHTML = pendingBadge("ยังไม่พบจุดตัด RSI=50 ในช่วงข้อมูลนี้");
    return;
  }
  crossingListEl.innerHTML = [...rsiCrossings]
    .reverse()
    .map(
      (cr) => `
      <div class="crossing-item">
        <span class="crossing-dot ${cr.direction}"></span>
        <span class="crossing-date">${fmtDate(cr.ts)}</span>
        <span class="crossing-note">${cr.direction === "up" ? "RSI ตัดขึ้นเหนือ 50 (โมเมนตัมเริ่มเป็นบวก)" : "RSI ตัดลงต่ำกว่า 50 (โมเมนตัมเริ่มเป็นลบ)"}</span>
        <span class="crossing-rsi mono" style="color:${cr.direction === "up" ? "oklch(0.72 0.15 150)" : "oklch(0.65 0.18 25)"}">${cr.rsi.toFixed(1)}</span>
      </div>`
    )
    .join("");
}

function renderDivergences(divergences) {
  if (!divergences || divergences.length === 0) {
    divergenceListEl.innerHTML = "";
    return;
  }
  divergenceListEl.innerHTML = divergences
    .map((d) => {
      const isBearish = d.type === "bearish";
      const title = isBearish ? "Bearish Divergence" : "Bullish Divergence";
      const desc = isBearish
        ? `ราคาทำจุดสูงใหม่ (${d.priceSwing1.price.toFixed(2)} → ${d.priceSwing2.price.toFixed(2)}) แต่ RSI กลับอ่อนตัวลง (${d.rsiAtSwing1.toFixed(1)} → ${d.rsiAtSwing2.toFixed(1)}) — โมเมนตัมไม่ยืนยันแนวโน้มขึ้น เสี่ยงย่อ/กลับตัว`
        : `ราคาทำจุดต่ำใหม่ (${d.priceSwing1.price.toFixed(2)} → ${d.priceSwing2.price.toFixed(2)}) แต่ RSI กลับแข็งขึ้น (${d.rsiAtSwing1.toFixed(1)} → ${d.rsiAtSwing2.toFixed(1)}) — โมเมนตัมไม่ยืนยันแนวโน้มลง เสี่ยงเด้ง/กลับตัว`;
      return `
        <div class="divergence-banner ${d.type}">
          <span class="tag ${isBearish ? "loser" : "gainer"}">${title}</span>
          <span>${desc} (${fmtDate(d.priceSwing1.ts)} → ${fmtDate(d.priceSwing2.ts)})</span>
        </div>`;
    })
    .join("");
}

async function loadTrendAnalysis(tf) {
  priceContainerEl.innerHTML = "กำลังโหลด…";
  rsiContainerEl.innerHTML = "";
  crossingListEl.innerHTML = "กำลังโหลด…";
  divergenceListEl.innerHTML = "";

  try {
    const res = await fetch(`/api/trend-analysis/gold?tf=${tf}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "fetch failed");

    renderCharts(data);
    renderCrossings(data.rsiCrossings);
    renderDivergences(data.divergences);
  } catch (err) {
    console.error("[trend-analysis] fetch failed:", err.message);
    priceContainerEl.innerHTML = pendingBadge("โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
    rsiContainerEl.innerHTML = "";
    crossingListEl.innerHTML = "";
  }
}

tfButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tfButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTf = btn.dataset.tf;
    loadTrendAnalysis(currentTf);
  });
});

trendRefreshEl.addEventListener("click", () => {
  const svg = trendRefreshEl.querySelector("svg");
  svg.classList.add("spinning");
  trendRefreshEl.disabled = true;
  loadTrendAnalysis(currentTf).finally(() => {
    svg.classList.remove("spinning");
    trendRefreshEl.disabled = false;
  });
});

loadTrendAnalysis(currentTf);
