# Aureum — Trading Analytics (Phase 1: ทอง)

Cloudflare Workers app (Hono + D1 + KV + Cron) ที่ดึงราคาทอง (XAU/USD) จาก Twelve Data
คำนวณแนวรับ-แนวต้าน แล้วแสดงผลผ่านหน้าเว็บ static ที่ serve จาก Worker เดียวกัน

## สถานะตอนนี้ (Milestone ที่ scaffold แล้ว)

- ✅ M0 — โครงโปรเจกต์ (Hono, TypeScript, D1/KV/Cron config)
- ✅ M1 — Gold price pipeline (Twelve Data → KV cache + D1 history) — **รอ TWELVEDATA_API_KEY** (ตั้งใจข้ามไว้ก่อน)
- ✅ M2 — S/R engine (Pivot Points + Swing High/Low, จริง ใช้งานได้)
- ✅ M3 — Frontend ทอง Dashboard ขั้นต่ำ (ต่อ API จริงแล้ว)
- ✅ M4 — News pipeline (RSS → D1) — ทดสอบแล้วใช้งานได้จริง ไม่ต้องมี API key
  - แหล่งข่าวที่ยืนยันแล้วว่าใช้ได้ (เช็ค 2026-09-04): **FXStreet** (`fxstreet`)
  - แหล่งที่เช็คแล้วตายไปแล้ว อย่าใส่กลับโดยไม่เช็คซ้ำ: Kitco RSS (404), Investing.com commodities RSS (404)
  - Sentiment/Impact analysis (Workers AI) — ยังไม่ทำ ฟิลด์ยังเป็น `null`
- ✅ M5 (บางส่วน) — Admin auth: single-password session (cookie + KV) พร้อม `requireAdmin` middleware ให้ endpoint อื่นต่อยอดได้

## ยังไม่ทำ (ทำต่อได้ตามลำดับ)

- ⬜ M5 (ต่อ) — หน้า Zone Finder / Watchlist / Auto Trade (ต่อบน `requireAdmin` middleware ที่มีแล้ว)
- ⬜ M6 — Data source หุ้นไทยฝั่ง public (ยังไม่ฟันธง — ดู README เดิมของแชท)
- ⬜ Volume Profile + Moving Average dynamic S/R (ตอนนี้มีแค่ Pivot + Swing)
- ⬜ Sentiment/Impact scoring ข่าว ผ่าน Workers AI
- ⬜ Scalp Mode (poll ทุก 10-15 วิ) — ยังไม่เปิดใช้ จนกว่าจะเช็ค quota ฟรีของ Twelve Data ว่าพอจริงไหม

## Admin auth (ใหม่)

```bash
curl -X POST https://aureum.precare.workers.dev/api/admin/login \
  -H "Content-Type: application/json" -d '{"password":"..."}' -c cookies.txt

curl -b cookies.txt https://aureum.precare.workers.dev/api/admin/ping
```

ตั้งรหัสผ่าน production: `npx wrangler secret put ADMIN_PASSWORD` (ยังไม่ได้ตั้ง — ต้องรันเองก่อนใช้งานจริง)

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
  index.ts          Hono app + scheduled handler (cron: poll ราคา + ข่าว ทุก 5 นาที)
  types.ts          Env bindings + shared types
  routes/
    price.ts        GET /api/price/gold, /api/price/gold/history
    sr.ts            GET /api/sr/gold
    news.ts          GET /api/news
    admin.ts         POST /api/admin/login, /logout, GET /me, /ping (protected)
  lib/
    twelvedata.ts    Twelve Data API client
    sr-engine.ts     Pivot Points + Swing High/Low + strength scoring
    candles-db.ts    D1 read/write helper
    kv-cache.ts      KV read/write helper
    rss.ts           RSS feed fetch + parse (fast-xml-parser)
    news-sources.ts  รายชื่อ RSS feed ที่เช็คแล้วว่าใช้ได้
    news-db.ts       D1 upsert สำหรับข่าว (dedupe ด้วย url)
    news-poll.ts     ฟังก์ชันดึงข่าวทุก source แล้วบันทึก
    auth.ts          Admin session (cookie + KV) + requireAdmin middleware
public/              Static frontend (ทอง Dashboard ขั้นต่ำ)
schema.sql           D1 schema
```
