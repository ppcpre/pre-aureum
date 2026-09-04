# Aureum — Trading Analytics (Phase 1: ทอง)

Cloudflare Workers app (Hono + D1 + KV + Cron) ที่ดึงราคาทอง (XAU/USD) จาก Twelve Data
คำนวณแนวรับ-แนวต้าน แล้วแสดงผลผ่านหน้าเว็บ static ที่ serve จาก Worker เดียวกัน

## สถานะตอนนี้ (Milestone ที่ scaffold แล้ว)

- ✅ M0 — โครงโปรเจกต์ (Hono, TypeScript, D1/KV/Cron config)
- ✅ M1 — Gold price pipeline (Twelve Data → KV cache + D1 history) — **รอ TWELVEDATA_API_KEY** (ตั้งใจข้ามไว้ก่อน)
- ✅ M2 — S/R engine: Pivot Points, Swing High/Low, EMA50/EMA200 (dynamic S/R), Volume Profile (POC/VAH/VAL) — ทั้งหมดคำนวณจริง ตรวจ sanity ด้วยข้อมูลสังเคราะห์แล้ว (ดูหมายเหตุด้านล่าง)
- ✅ M3 — Frontend เต็มไซต์แล้ว: sidebar เมนูแยกทอง/หุ้นไทย/Admin ใช้ได้ทุกหน้า
  - ทอง: Dashboard (จริง), ข่าว (จริง — ใช้ M4), คำนวณความเสี่ยง (จริง, client-side ล้วน)
  - หุ้นไทย: Dashboard, Screener (จริง — ใช้ M6, มี caveat banner เตือนเรื่อง data source ตลอด)
  - จุดที่ต้องรอ TWELVEDATA_API_KEY (เช่น ราคาทอง/S/R) โชว์ badge "รอเชื่อมต่อ" สีเหลือง ไม่ใช่ error แดง — เข้าหน้าอื่นได้ปกติ
- ✅ M4 — News pipeline (RSS → D1) — ทดสอบแล้วใช้งานได้จริง ไม่ต้องมี API key
  - แหล่งข่าวที่ยืนยันแล้วว่าใช้ได้ (เช็ค 2026-09-04): **FXStreet** (`fxstreet`)
  - แหล่งที่เช็คแล้วตายไปแล้ว อย่าใส่กลับโดยไม่เช็คซ้ำ: Kitco RSS (404), Investing.com commodities RSS (404)
  - Sentiment/Impact analysis: **เสร็จแล้ว** — Workers AI (`@cf/meta/llama-3.2-3b-instruct`) วิเคราะห์ทุกข่าวที่ยังไม่มี sentiment ทีละ 10 รายการ/รอบ cron (กันไม่ให้ใช้โควตาพุ่งทีเดียว, backlog ที่มีอยู่ก่อนจะค่อยๆ ถูกจัดการทีละรอบ)
    - เจอบั๊กระหว่างทดสอบ: field `response` จาก Workers AI บางครั้งเป็น object ที่ parse มาให้แล้ว ไม่ใช่ string เสมอไป (เจอกับโมเดลนี้ 2026-09-04) — เดิม parser เข้าใจผิดว่าเป็น string เสมอ ทำให้ผลลัพธ์ตกไปที่ fallback "neutral/low" ทุกข่าว แก้แล้วให้รองรับทั้งสองแบบ ทดสอบซ้ำแล้วได้ผลลัพธ์หลากหลายตามเนื้อข่าวจริง
- ✅ M5 — Admin auth (single-password session, cookie + KV, `requireAdmin` middleware) + หน้า Zone Finder (ทอง, logic จริง) / Watchlist / Auto Trade Status (placeholder ที่ซื่อสัตย์ อยู่หลัง auth เดียวกัน) — มีหน้า login จริงที่ `/admin/login`

- ✅ M6 — หุ้นไทย Dashboard/Screener ใช้งานได้จริง ผ่าน **Yahoo Finance (unofficial, `.BK`)** — Research แล้วว่านี่คือสิ่งที่นักพัฒนาไทยใช้กันจริงสำหรับข้อมูลฟรี (ยืนยัน 2026-09-04) แต่:
  - ⚠️ **มีรายงานราคา `.BK` ผิดปกติมาตั้งแต่ต้นปี 2024** (ราคาไม่ตรง/volume หาย บางวัน) — ต้องเช็คความแม่นยำเทียบ SETTRADE จริงก่อนเชื่อถือ 100%
  - ⚠️ ไม่ใช่ API ทางการ ไม่มี SLA ไม่มีสิทธิ์ redistribute — **ใช้ได้เฉพาะช่วงทดสอบความแม่นยำเท่านั้น** ก่อน public launch จริงต้องเปลี่ยนเป็น Twelve Data Pro (ต้อง Pro plan ถึงจะมี SET) หรือ EODHD commercial plan
  - Watchlist ตอนนี้เป็นชุดเล็กที่คัดไว้ก่อน (PTT, AOT, KBANK, CPALL) — ยังไม่รองรับค้นหาทุกหุ้นใน SET
  - Screener มี filter จริง: พุ่งขึ้น/ลงแรง 24ชม., ใกล้แนวรับ, ทะลุแนวต้าน (breakout = ทำ high ใหม่ในรอบ 10 วัน)
  - แก้บั๊ก: แนวรับ-ต้านเดิม cluster ถี่เกินไปสำหรับหุ้นราคาต่ำ (tick size ใหญ่กว่า tolerance เดิม) ปรับ `tolerancePct` 0.15% → 0.3% และเพิ่ม `pickNearestLevels()` ตัดเหลือแนวใกล้ราคาที่สุดฝั่งละ 4 ระดับ (ใช้ทั้งทองและหุ้นไทย)

- ✅ M7 — Admin AI Chat (`/admin/chat`) — **เปลี่ยนมาใช้ Cloudflare Workers AI แทน Claude แล้ว** (ตามที่คุยกัน: ทดลองฟรีก่อน Claude API มีค่าใช้จ่ายจริงต่อ request ไม่รวมอยู่ใน Claude.ai subscription ที่จ่ายอยู่)
  - **Model: `@cf/qwen/qwen3.8-27b`** — เลือกเพราะภาษาไทยดี (requirement จากคุณ) + รองรับ function calling — **ฟรีสนิท** อยู่ในโควตา 10,000 Neurons/วันของบัญชี Cloudflare ไม่ต้องสมัคร/จ่ายอะไรเพิ่ม (ไม่ต้องมี ANTHROPIC_API_KEY อีกต่อไป)
  - **Admin-only** เท่านั้น (ตัดสินใจไว้ตั้งแต่ตอนคุยเรื่อง Claude และยังคงไว้)
  - **Tool use / grounding**: เรียก tool จริงของระบบก่อนตอบเสมอ (ราคาทอง, S/R ทอง, ราคาหุ้น, S/R หุ้น, ข่าวล่าสุด, screener) tool ทั้งหมด **read-only** ไม่มี tool ไหนสั่งเทรดหรือแก้ค่าอะไรได้ — ทดสอบแล้ว chain หลาย tool ต่อกันได้ถูกต้อง (เช่น ถามหุ้น → เรียกราคา + S/R สองตัวติดกัน)
  - **⚠️ เจอปัญหาจริงระหว่าง implement**: ลองใช้ `@cloudflare/ai-utils`'s `runWithTools` ก่อน (ตามตัวอย่างในเอกสาร Cloudflare) แต่โมเดลนี้คืนค่าแบบ **OpenAI Chat Completions shape** (`choices[0].message`) ไม่ใช่ shape แบบง่าย `{response, tool_calls}` ที่ `runWithTools`/เอกสารส่วนใหญ่ของ Cloudflare ใช้เป็นตัวอย่าง — ผลคือ tool ไม่ถูกส่งเข้าไปให้โมเดลเห็นเลย (เห็นจาก debug log จริง) แก้โดยเลิกใช้ `runWithTools` แล้วเรียก `env.AI.run()` ตรงๆ พร้อม tools แบบ OpenAI-style เอง เขียน loop เองทั้งหมด — ทดสอบซ้ำแล้วทำงานถูกต้อง
  - Response เป็น**ก้อนเดียว ไม่ streaming ทีละคำ** (ต่างจากตอนใช้ Claude) เพราะไม่ได้ใช้ `runWithTools`'s `streamFinalResponse` (เพื่อให้ได้ `usage` ที่แม่นยำสำหรับ log แทน) — ยังคงเห็นสถานะ "กำลังเช็ค..." ระหว่างเรียก tool ผ่าน SSE เหมือนเดิม
  - **Usage dashboard** (ปุ่ม "Usage" มุมขวาบน) — log token จริงลง D1 (`chat_usage`) โชว์ prompt/completion tokens วันนี้/ทั้งหมด **ไม่มีตัวเลข $ ประมาณการ** เพราะ Workers AI คิดราคาเป็น Neuron ไม่ใช่ $/token ตรงๆ (เลขจริงเช็คได้ที่ Cloudflare Dashboard)
  - **Safety net**: จำกัด 200 ข้อความ/วัน (กันโควตา Neurons ฟรีของทั้งบัญชีหมดจาก bug), tool-loop จำกัดสูงสุด 4 รอบ/ข้อความ
  - อยากสลับกลับไปใช้ Claude (คุณภาพสูงกว่า, เสียเงิน) — โค้ดเวอร์ชัน Claude/Sonnet 5 อยู่ใน git history (commit ก่อนหน้านี้) กู้กลับมาได้ถ้าต้องการ

- ✅ กราฟแท่งเทียนจริง — SVG ล้วน ไม่พึ่ง library (`public/candlestick-chart.js`) ใช้ร่วมกันทั้งทองและหุ้นไทย วาดจาก `/api/price/*/history` จริง overlay เส้นแนวรับ-ต้าน + เส้นราคาปัจจุบัน สลับ timeframe/symbol แล้ว re-render ถูกต้อง — ตรวจด้วยตาจริงผ่าน browser ไม่ใช่แค่ curl (เจอบั๊ก `/api/price/stock/` มี trailing slash เกินจนหน้าเว็บพังเงียบๆ ระหว่างเช็ค แก้แล้ว)
  - เพิ่ม label "(ช่วงกราฟที่แสดง)" กำกับ % เปลี่ยนแปลงในหัวการ์ด เพราะความหมายเปลี่ยนไปตาม timeframe ที่เลือก (ไม่ใช่ % ต่อวันเสมอไป) กันเข้าใจผิด

- ✅ ขยาย watchlist หุ้นไทยเป็น **SET50 ทั้งชุด (50 ตัว)** (source: เอกสาร constituents ทางการของ SET, ปรับปรุงทุก 6 เดือน ม.ค./ก.ค. — ดูหมายเหตุใน `stock-symbols.ts` ว่าต้องไปดึงใหม่ตอนไหน) เปลี่ยน symbol selector หน้า Dashboard จาก tab ปุ่ม (ใช้ไม่ได้ที่ 50 ตัว) เป็น dropdown แทน
  - **⚠️ เจอบั๊กจริงจัง**: Cloudflare Workers Free plan จำกัด **50 subrequests ต่อ 1 invocation** — ทั้ง Screener (loop 50 หุ้น) และ cron รายชั่วโมงเดิม (fetch ราคา+ประวัติ 50 หุ้น) จะ**เกินลิมิตแล้วพังกลางคัน**ถ้าไม่แก้ พบระหว่างทดสอบจริง (screener โหลด 12.5 วิ ตอน cache ว่าง) ไม่ใช่แค่เดา
  - แก้โดย: **Screener อ่านจาก D1 อย่างเดียว ไม่ fetch สดเด็ดขาด** (ข้ามหุ้นที่ cron ยังไปไม่ถึง แทนที่จะ fetch แทน) + **cron แบ่งเป็น batch 15 ตัว/รอบ หมุนผ่าน KV cursor** (ครบ 50 ตัวใน ~4 ชั่วโมง) + cron ดึงแค่ D1 (ตัด H4 ออกจาก eager fetch, timeframe อื่น lazy-load ทีหลังตอนมีคนดูจริง)
  - ผลคือหลัง deploy ใหม่ **หุ้น 46 ตัวที่เพิ่มมาจะยังไม่ขึ้นใน Screener ทันที** ต้องรอ cron หมุนไปถึงภายในไม่กี่ชั่วโมง (4 ตัวเดิมที่มีข้อมูลอยู่แล้วขึ้นปกติ)
- ⬜ Chat history ยังไม่ persist (เก็บแค่ฝั่ง browser ปิดแท็บแล้วหาย) — ถ้าอยากคุยต่อได้ข้ามเซสชัน ต้องเพิ่ม D1 table เก็บบทสนทนา
- ⬜ ยืนยัน Volume Profile กับข้อมูลจริง — Twelve Data มักไม่รายงาน volume จริงสำหรับทอง/CFD (เป็น OTC) ฟังก์ชัน `buildVolumeProfile` คืนค่า `undefined` ถ้าไม่มี volume ในแท่งเทียนเลย ต้องเช็คตอนมี API key แล้วว่า field `volume` มาจริงไหม
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
    price.ts         GET /api/price/gold, /api/price/gold/history
    sr.ts            GET /api/sr/gold
    news.ts          GET /api/news
    admin.ts         POST /api/admin/login, /logout, GET /me, /ping, /zone-finder/gold, /watchlist, /auto-trade/status (all protected)
    stock.ts         GET /api/price/stock(/:symbol), /api/sr/stock/:symbol — หุ้นไทย
    screener.ts      GET /api/screener/stock
    chat.ts          POST /api/admin/chat (SSE), GET /api/admin/chat/usage (both protected)
  lib/
    twelvedata.ts    Twelve Data API client (ทอง)
    yahoo-finance.ts Yahoo Finance unofficial client (หุ้นไทย, .BK) — ดู caveat ในไฟล์
    stock-symbols.ts Watchlist หุ้นไทยที่คัดไว้ (ตอนนี้ 4 ตัว)
    screener.ts      Logic กรอง gainer/loser/near_support/breakout
    zone-finder.ts   Confluence checklist สำหรับ Admin Zone Finder (ทอง)
    sr-engine.ts     Pivot Points, Swing High/Low, EMA50/200, Volume Profile, pickNearestLevels
    candles-db.ts    D1 read/write helper (ใช้ร่วมกันทองและหุ้นไทย)
    kv-cache.ts      KV read/write helper
    rss.ts           RSS feed fetch + parse (fast-xml-parser)
    news-sources.ts  รายชื่อ RSS feed ที่เช็คแล้วว่าใช้ได้
    news-db.ts       D1 upsert สำหรับข่าว (dedupe ด้วย url)
    news-poll.ts     ฟังก์ชันดึงข่าวทุก source แล้วบันทึก
    auth.ts          Admin session (cookie + KV) + requireAdmin middleware
    chat.ts          Workers AI (Qwen3.8-27B) manual tool-use loop, OpenAI Chat Completions shape — SSE relay
    chat-tools.ts    Tool definitions (OpenAI-style) + executor — read-only, calls the same lib fns as the REST routes
    chat-usage.ts    Token usage logging + summary (chat_usage table) — no $ estimate, see M7 notes above
public/
  sidebar.js         Sidebar เมนู (mount ทุกหน้าผ่าน #sidebar-mount)
  index.html/js      ทอง Dashboard
  news.html/js       ทอง ข่าว
  risk-calculator.*  ทอง คำนวณความเสี่ยง (client-side ล้วน)
  stock-dashboard.*  หุ้นไทย Dashboard
  screener.html/js   หุ้นไทย Screener
  admin/             login, zone-finder, watchlist, auto-trade, chat (+ common.js: auth guard/logout)
schema.sql           D1 schema
```
