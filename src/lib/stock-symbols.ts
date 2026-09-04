export interface StockSymbol {
  symbol: string; // SET ticker, no suffix (e.g. "PTT")
  name: string;
}

// Small curated starter list — expand once accuracy is confirmed (see README).
// Search-across-all-SET-symbols is out of scope until then.
export const STOCK_WATCHLIST: StockSymbol[] = [
  { symbol: "PTT", name: "ปตท." },
  { symbol: "AOT", name: "ท่าอากาศยานไทย" },
  { symbol: "KBANK", name: "ธนาคารกสิกรไทย" },
  { symbol: "CPALL", name: "ซีพี ออลล์" },
];

export function isKnownSymbol(symbol: string): boolean {
  return STOCK_WATCHLIST.some((s) => s.symbol === symbol.toUpperCase());
}
