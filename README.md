# Aureum — Trading Analytics (Phase 1: ทอง)

Cloudflare Workers app (Hono + D1 + KV + Cron) ที่ดึงราคาทอง (XAU/USD) จาก Twelve Data
คำนวณแนวรับ-แนวต้าน แล้วแสดงผลผ่านหน้าเว็บ static ที่ serve จาก Worker เดียวกัน

## สถานะตอนนี้ (Milestone ที่ scaffold แล้ว)

- ✅ M0 — โครงโปรเจกต์ (Hono, TypeScript, D1/KV/Cron config)
- ✅ M1 — Gold price pipeline (Twelve Data → KV cache + D1 history)
- ✅ M2 — S/R engine (Pivot Points + Swing High/Low, จริง ใช้งานได้)
- ✅ M3 — Frontend ทอง Dashboard ขั้นต่ำ (ต่อ API จริงแล้ว)

## ยังไม่ทำ (ทำต่อได้ตามลำดับ)

- ⬜ M4 — News pipeline (RSS Reuters/Kitco → D1 → sentiment ผ่าน Workers AI)
- ⬜ M5 — Admin auth + หน้า Zone Finder / Watchlist / Auto Trade
- ⬜ M6 — Data source หุ้นไทยฝั่ง public (ยังไม่ฟันธง — ดู README เดิมของแชท)
- ⬜ Volume Profile + Moving Average dynamic S/R (ตอนนี้มีแค่ Pivot + Swing)
- ⬜ Scalp Mode (poll ทุก 10-15 วิ) — ยังไม่เปิดใช้ จนกว่าจะเช็ค quota ฟรีของ Twelve Data ว่าพอจริงไหม

## เริ่มใช้งาน

```bash
npm install
cp .dev.vars.example .dev.vars   # ใส่ TWELVEDATA_API_KEY ของตัวเอง (สมัครฟรีที่ twelvedata.com)
```

### สร้างทรัพยากรจริงบน Cloudflare (ต้องทำครั้งเดียว ด้วยบัญชีของคุณเอง)

```bash
npx wrangler login

npx wrangler kv namespace create AUREUM_CACHE
# เอา id ที่ได้ไปใส่ใน wrangler.jsonc -> kv_namespaces[0].id

npx wrangler d1 create aureum-db
# เอา database_id ที่ได้ไปใส่ใน wrangler.jsonc -> d1_databases[0].database_id

npm run db:migrate:local     # สร้างตารางสำหรับ dev
npm run db:migrate:remote    # สร้างตารางบน Cloudflare จริง

npx wrangler secret put TWELVEDATA_API_KEY   # ใส่ key เดียวกับใน .dev.vars สำหรับ production
```

### รัน local dev

```bash
npm run dev
```

เปิด http://localhost:8787

### Deploy

```bash
npm run deploy
```

## โครงสร้างโปรเจกต์

```
src/
  index.ts          Hono app + scheduled handler (cron poll ราคาทุก 5 นาที)
  types.ts          Env bindings + shared types
  routes/
    price.ts        GET /api/price/gold, /api/price/gold/history
    sr.ts            GET /api/sr/gold
  lib/
    twelvedata.ts    Twelve Data API client
    sr-engine.ts     Pivot Points + Swing High/Low + strength scoring
    candles-db.ts    D1 read/write helper
    kv-cache.ts      KV read/write helper
public/              Static frontend (ทอง Dashboard ขั้นต่ำ)
schema.sql           D1 schema
```
