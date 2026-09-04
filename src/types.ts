export type Timeframe = "M15" | "H1" | "H4" | "D1" | "W1";

export interface Env {
  CACHE: KVNamespace;
  DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  PRICE_POLL_MODE: string;
  TWELVEDATA_API_KEY: string;
  ADMIN_PASSWORD: string;
  AI: Ai;
}

export interface Candle {
  ts: number; // unix seconds, candle open time
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface SRLevel {
  price: number;
  type: "support" | "resistance";
  strength: number; // 1-5
  methods: string[]; // e.g. ["pivot", "swing"]
}
