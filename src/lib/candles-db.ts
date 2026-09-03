import type { Candle, Env, Timeframe } from "../types";

export async function upsertCandles(
  db: D1Database,
  symbol: string,
  timeframe: Timeframe,
  candles: Candle[]
): Promise<void> {
  if (candles.length === 0) return;

  const stmt = db.prepare(
    `INSERT INTO price_history (symbol, timeframe, ts, open, high, low, close, volume)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (symbol, timeframe, ts) DO UPDATE SET
       open = excluded.open, high = excluded.high, low = excluded.low,
       close = excluded.close, volume = excluded.volume`
  );

  const batch = candles.map((c) =>
    stmt.bind(symbol, timeframe, c.ts, c.open, c.high, c.low, c.close, c.volume ?? null)
  );
  await db.batch(batch);
}

export async function getCandles(
  db: D1Database,
  symbol: string,
  timeframe: Timeframe,
  limit = 100
): Promise<Candle[]> {
  const { results } = await db
    .prepare(
      `SELECT ts, open, high, low, close, volume FROM price_history
       WHERE symbol = ? AND timeframe = ?
       ORDER BY ts DESC LIMIT ?`
    )
    .bind(symbol, timeframe, limit)
    .all<Candle>();

  return (results ?? []).reverse();
}

/** Most recent *completed* daily candle — used as the source for pivot points. */
export async function getPreviousDayCandle(env: Env, symbol: string): Promise<Candle | undefined> {
  const daily = await getCandles(env.DB, symbol, "D1", 2);
  return daily[daily.length - 2] ?? daily[daily.length - 1];
}
