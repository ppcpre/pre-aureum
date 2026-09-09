// Links out to SET's own official pages for dividend/rights info and
// historical price — per user request 2026-09-09. URL patterns verified by
// browsing set.or.th directly (WHA's page), not guessed:
//   .../quote/{SYMBOL}/rights-benefits    — สิทธิประโยชน์ (dividends live here)
//   .../quote/{SYMBOL}/historical-trading — ราคาย้อนหลัง
// Shared by stock-dashboard.js and screener.js so both stay consistent if
// SET ever changes its URL structure.
const SET_QUOTE_BASE_URL = "https://www.set.or.th/th/market/product/stock/quote";

const SET_DIVIDEND_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8.5 9.5h.01 M15.5 14.5h.01" stroke-width="2.4" stroke-linecap="round"/><path d="M8.5 15.5 15.5 8.5" stroke-linecap="round"/></svg>';
const SET_HISTORY_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 3-6.7" stroke-linecap="round"/><path d="M3 4v5h5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8v4l3 2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** @param {string} symbol @param {{iconOnly?: boolean}} [opts] */
function renderSetLinks(symbol, opts) {
  const iconOnly = opts?.iconOnly ?? false;
  const cls = iconOnly ? "set-link icon-only" : "set-link";
  return `
    <a class="${cls}" href="${SET_QUOTE_BASE_URL}/${symbol}/rights-benefits" target="_blank" rel="noopener" title="ปันผลบน SET" aria-label="ปันผลบน SET">${SET_DIVIDEND_ICON}${iconOnly ? "" : "ปันผลบน SET"}</a>
    <a class="${cls}" href="${SET_QUOTE_BASE_URL}/${symbol}/historical-trading" target="_blank" rel="noopener" title="ราคาย้อนหลังบน SET" aria-label="ราคาย้อนหลังบน SET">${SET_HISTORY_ICON}${iconOnly ? "" : "ราคาย้อนหลังบน SET"}</a>`;
}
