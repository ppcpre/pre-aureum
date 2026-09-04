/**
 * Renders a real candlestick chart (SVG, no library) from OHLC candles into
 * `container`, overlaid with S/R level lines and the current price line.
 * Shared by the gold dashboard and the Thai stock dashboard.
 */
function renderCandlestickChart(container, candles, levels, currentPrice) {
  if (!candles || candles.length === 0) {
    container.innerHTML = `<span class="pending-badge"><span class="dot"></span>ยังไม่มีข้อมูลกราฟ (ข้อมูลย้อนหลังยังน้อยเกินไป)</span>`;
    return;
  }

  const W = 990;
  const H = 400;
  const PAD_L = 8;
  const PAD_R = 78;
  const PAD_T = 16;
  const PAD_B = 16;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const levelPrices = (levels || []).map((l) => l.price);
  let maxP = Math.max(...candles.map((c) => c.high), ...levelPrices, currentPrice ?? -Infinity);
  let minP = Math.min(...candles.map((c) => c.low), ...levelPrices, currentPrice ?? Infinity);
  const range = maxP - minP || Math.max(maxP * 0.01, 1);
  const pad = range * 0.08;
  maxP += pad;
  minP -= pad;

  const priceToY = (p) => PAD_T + ((maxP - p) / (maxP - minP)) * plotH;

  const n = candles.length;
  const slot = plotW / n;
  const bodyW = Math.max(1.5, Math.min(20, slot * 0.6));

  const GREEN = "oklch(0.72 0.15 150)";
  const RED = "oklch(0.65 0.18 25)";
  const GOLD = "oklch(0.75 0.14 85)";

  let svg = "";

  for (const lvl of levels || []) {
    const y = priceToY(lvl.price);
    const color = lvl.type === "resistance" ? RED : GREEN;
    svg += `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="${color}" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.85"/>`;
    svg += `<text x="${W - PAD_R + 5}" y="${y + 4}" font-family="'IBM Plex Mono', monospace" font-size="11" fill="${color}">${lvl.price.toFixed(2)}</text>`;
  }

  candles.forEach((c, i) => {
    const x = PAD_L + i * slot + slot / 2;
    const yHigh = priceToY(c.high);
    const yLow = priceToY(c.low);
    const yOpen = priceToY(c.open);
    const yClose = priceToY(c.close);
    const up = c.close >= c.open;
    const color = up ? GREEN : RED;
    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(1, Math.abs(yClose - yOpen));
    svg += `<line x1="${x}" y1="${yHigh}" x2="${x}" y2="${yLow}" stroke="${color}" stroke-width="1.3"/>`;
    svg += `<rect x="${x - bodyW / 2}" y="${bodyTop}" width="${bodyW}" height="${bodyH}" fill="${color}"/>`;
  });

  if (typeof currentPrice === "number") {
    const yCur = priceToY(currentPrice);
    svg += `<line x1="${PAD_L}" y1="${yCur}" x2="${W - PAD_R - 2}" y2="${yCur}" stroke="${GOLD}" stroke-width="1.1" stroke-dasharray="2 3"/>`;
    svg += `<rect x="${W - PAD_R}" y="${yCur - 10}" width="${PAD_R - 4}" height="20" rx="3" fill="${GOLD}"/>`;
    svg += `<text x="${W - PAD_R + (PAD_R - 4) / 2}" y="${yCur + 4}" font-family="'IBM Plex Mono', monospace" font-size="11" font-weight="600" fill="oklch(0.16 0.02 85)" text-anchor="middle">${currentPrice.toFixed(2)}</text>`;
  }

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%; height:100%; display:block;">${svg}</svg>`;
}
