/**
 * Renders a real, interactive candlestick chart into `container`, overlaid
 * with S/R level lines and the current price line — via TradingView's own
 * open-source "Lightweight Charts" library (loaded as a <script> tag before
 * this file; see index.html / stock-dashboard.html), which is what gives
 * this chart mouse-wheel zoom, click-drag pan, and drag-the-price-axis
 * rescaling out of the box — the same interaction as tradingview.com itself,
 * with no extra code needed for any of that.
 *
 * (Previously this was a static, non-interactive hand-rolled SVG renderer —
 * replaced 2026-09-07 because zoom/pan/axis-drag were explicitly requested,
 * and reimplementing that by hand would have been both a lot of surface
 * area to get right and strictly worse than the library TradingView itself
 * ships for exactly this.)
 *
 * Shared by the gold dashboard and the Thai stock dashboard.
 */

const _colorCache = {};
/**
 * Resolves an oklch() (or any CSS color) string to a concrete rgb()/rgba().
 * getComputedStyle().color turns out to just echo oklch() back verbatim in
 * this environment rather than converting it (checked directly, not assumed)
 * — so this reads the color back off a 1x1 canvas instead, since
 * CanvasRenderingContext2D.fillStyle does resolve oklch() to real sRGB
 * bytes. Cached — these are static tokens, never worth recomputing.
 */
function resolveColor(cssColor) {
  if (_colorCache[cssColor]) return _colorCache[cssColor];
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const resolved = a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
  _colorCache[cssColor] = resolved;
  return resolved;
}

function renderCandlestickChart(container, candles, levels, currentPrice) {
  // Tear down whatever this container was previously showing — either a
  // pending-badge message, or a prior chart instance (symbol/timeframe
  // switches call this function again on the SAME container element).
  if (container._lwChart) {
    container._lwChart.remove();
    container._lwChart = null;
  }
  if (container._lwResizeObserver) {
    container._lwResizeObserver.disconnect();
    container._lwResizeObserver = null;
  }
  container.innerHTML = "";

  if (!candles || candles.length === 0) {
    container.innerHTML = `<span class="pending-badge"><span class="dot"></span>ยังไม่มีข้อมูลกราฟ (ข้อมูลย้อนหลังยังน้อยเกินไป)</span>`;
    return;
  }

  // Lightweight Charts validates color strings itself (rather than just
  // handing them to canvas) and doesn't understand oklch() — resolve our
  // design tokens to the rgb() the browser's own CSS engine computes for
  // them, so the chart gets colors it accepts while staying pixel-identical
  // to the oklch() used everywhere else in the app.
  const GREEN = resolveColor("oklch(0.72 0.15 150)");
  const RED = resolveColor("oklch(0.65 0.18 25)");
  const GOLD = resolveColor("oklch(0.75 0.14 85)");
  const BORDER = resolveColor("oklch(0.29 0.008 250)");
  const MUTED = resolveColor("oklch(0.60 0.01 250)");

  const chart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: { background: { color: "transparent" }, textColor: MUTED, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 },
    grid: { vertLines: { visible: false }, horzLines: { color: BORDER } },
    rightPriceScale: { borderColor: BORDER },
    timeScale: { borderColor: BORDER, timeVisible: true, secondsVisible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    // Zoom/pan are on by default (handleScroll/handleScale both default true) —
    // this is the whole point of switching to this library, left explicit here
    // so it's clear it's not accidental.
    handleScroll: true,
    handleScale: true,
  });

  const series = chart.addCandlestickSeries({
    upColor: GREEN,
    downColor: RED,
    borderUpColor: GREEN,
    borderDownColor: RED,
    wickUpColor: GREEN,
    wickDownColor: RED,
  });

  series.setData(candles.map((c) => ({ time: c.ts, open: c.open, high: c.high, low: c.low, close: c.close })));

  for (const lvl of levels || []) {
    series.createPriceLine({
      price: lvl.price,
      color: lvl.type === "resistance" ? RED : GREEN,
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: lvl.type === "resistance" ? "แนวต้าน" : "แนวรับ",
    });
  }

  if (typeof currentPrice === "number") {
    series.createPriceLine({
      price: currentPrice,
      color: GOLD,
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted,
      axisLabelVisible: true,
      title: "ปัจจุบัน",
    });
  }

  chart.timeScale().fitContent();

  // Keep the chart sized to its container — the container's own size is
  // driven by flex/min-height CSS, not fixed pixels, so it can change
  // (window resize, sidebar collapse, etc.) after this initial render.
  const resizeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    if (width > 0 && height > 0) chart.applyOptions({ width, height });
  });
  resizeObserver.observe(container);

  container._lwChart = chart;
  container._lwResizeObserver = resizeObserver;
}
