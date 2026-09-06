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
  - ✅ **Chat history persist แล้ว** — เก็บบทสนทนาลง D1 table ใหม่ `chat_messages` (`lib/chat-history.ts`: `saveChatMessage`/`getChatHistory`/`clearChatHistory`) บันทึกทุกข้อความ user+assistant ทันทีที่ตอบ โหลด 50 ข้อความล่าสุดตอนเปิดหน้า (`GET /api/admin/chat/history`) ปิดแท็บ/reload แล้วคุยต่อได้ปกติ มีปุ่ม "เริ่มแชทใหม่" ลบประวัติทิ้ง (`DELETE /api/admin/chat/history`) — migrate ทั้ง local และ remote D1 แล้ว ทดสอบผ่าน browser จริงทั้ง flow (ส่ง → reload → ยังอยู่ → เริ่มแชทใหม่ → เคลียร์จริง) ทั้ง local dev และ production
  - ✅ **หน้าตา friendly ขึ้น** — icon AI น่ารัก (SVG หัวมน ตา 2 จุด ยิ้ม เสาอากาศ สี gold) โผล่ทั้ง topbar และข้าง bubble ของ assistant ระหว่างรอคำตอบเปลี่ยนจาก spinner ธรรมดาเป็น "thinking card": icon โยกเบาๆ (bob animation) + progress bar (ขยับแบบ asymptotic ตามเวลาจริงที่ผ่านไป บวก boost ทุกครั้งที่มี tool call จริงเกิดขึ้น ไม่ใช่ progress ปลอม) + ตัวนับวินาทีจริง (`(Date.now()-startedAt)/1000` อัปเดตทุก 100ms) — ทดสอบแล้วเห็น icon โยก, progress bar วิ่ง, ตัวนับวินาทีเดินจริงระหว่างรอ tool call

- ✅ กราฟแท่งเทียนจริง — SVG ล้วน ไม่พึ่ง library (`public/candlestick-chart.js`) ใช้ร่วมกันทั้งทองและหุ้นไทย วาดจาก `/api/price/*/history` จริง overlay เส้นแนวรับ-ต้าน + เส้นราคาปัจจุบัน สลับ timeframe/symbol แล้ว re-render ถูกต้อง — ตรวจด้วยตาจริงผ่าน browser ไม่ใช่แค่ curl (เจอบั๊ก `/api/price/stock/` มี trailing slash เกินจนหน้าเว็บพังเงียบๆ ระหว่างเช็ค แก้แล้ว)
  - เพิ่ม label "(ช่วงกราฟที่แสดง)" กำกับ % เปลี่ยนแปลงในหัวการ์ด เพราะความหมายเปลี่ยนไปตาม timeframe ที่เลือก (ไม่ใช่ % ต่อวันเสมอไป) กันเข้าใจผิด

- ✅ ขยาย watchlist หุ้นไทยเป็น **SET50 ทั้งชุด (50 ตัว)** (source: เอกสาร constituents ทางการของ SET, ปรับปรุงทุก 6 เดือน ม.ค./ก.ค. — ดูหมายเหตุใน `stock-symbols.ts` ว่าต้องไปดึงใหม่ตอนไหน) เปลี่ยน symbol selector หน้า Dashboard จาก tab ปุ่ม (ใช้ไม่ได้ที่ 50 ตัว) เป็น dropdown แทน
  - **⚠️ เจอบั๊กจริงจัง**: Cloudflare Workers Free plan จำกัด **50 subrequests ต่อ 1 invocation** — ทั้ง Screener (loop 50 หุ้น) และ cron รายชั่วโมงเดิม (fetch ราคา+ประวัติ 50 หุ้น) จะ**เกินลิมิตแล้วพังกลางคัน**ถ้าไม่แก้ พบระหว่างทดสอบจริง (screener โหลด 12.5 วิ ตอน cache ว่าง) ไม่ใช่แค่เดา
  - แก้โดย: **Screener อ่านจาก D1 อย่างเดียว ไม่ fetch สดเด็ดขาด** (ข้ามหุ้นที่ cron ยังไปไม่ถึง แทนที่จะ fetch แทน) + **cron แบ่งเป็น batch 15 ตัว/รอบ หมุนผ่าน KV cursor** (ครบ 50 ตัวใน ~4 ชั่วโมง) + cron ดึงแค่ D1 (ตัด H4 ออกจาก eager fetch, timeframe อื่น lazy-load ทีหลังตอนมีคนดูจริง)
  - ผลคือหลัง deploy ใหม่ **หุ้น 46 ตัวที่เพิ่มมาจะยังไม่ขึ้นใน Screener ทันที** ต้องรอ cron หมุนไปถึงภายในไม่กี่ชั่วโมง (4 ตัวเดิมที่มีข้อมูลอยู่แล้วขึ้นปกติ)
  - **⚠️ เจอบั๊กจริงอีกรอบ (2026-09-04)**: Cloudflare ส่งอีเมลเตือน **D1 `rows_written` แตะ 93% ของโควตาฟรี 100,000 rows/วัน** — สาเหตุคือ `pollStockPrices` เขียนทับ candle ย้อนหลัง**ทั้งช่วง 6 เดือน** (~126 แท่ง) ต่อหุ้น **ทุกครั้ง**ที่ cron รัน ทั้งที่มีแค่แท่งล่าสุด 1-2 แท่งที่เปลี่ยนจริง (15 หุ้น/รอบ × ~126 แท่ง × 24 รอบ/วัน ≈ 45,000+ rows/วัน จากจุดเดียว) — free plan ไม่มีบิลเกิน แค่ D1 write จะ error ชั่วคราวถ้าชนแคปจนกว่าจะ reset เที่ยงคืน UTC
  - แก้โดย: `pollStockPrices` เขียนเฉพาะ **3 แท่งล่าสุด** ต่อรอบแทนทั้ง 126 แท่ง (`candles.slice(-3)`) ลด rows_written ของ cron นี้ลง ~97% (จาก ~45k เหลือ ~1k/วัน) — ประวัติเต็มช่วงยังคง backfill ครั้งเดียวผ่าน lazy-load เดิมใน `routes/stock.ts` ตอนมีคนเปิดดูหุ้นตัวนั้นครั้งแรก (ที่จุดนั้นเขียนเต็มช่วงแค่ครั้งเดียว ไม่ใช่ปัญหาซ้ำ)
  - **Redesign การ์ดบน Dashboard (2026-09-04)**: ตามที่ขอ — เปลี่ยนจาก layout 2 คอลัมน์เดิมเป็น layout เดียวกับการ์ด digest ของ AI Chat: 3 stat tiles จริง (% ทอง 24 ชม., จำนวนหุ้นที่มีสัญญาณ/ทั้งหมด 50, จำนวนข่าวใหม่ใน 24 ชม. — คำนวณจริงจาก D1 ทั้งหมด ไม่มีตัวไหน hardcode) ตามด้วยรายการหุ้นและปุ่ม quick-action ที่เป็น **ลิงก์ไปหน้า AI Chat พร้อม prefill คำถาม** (`/admin/chat?q=...`) — `chat.js` อ่าน `?q=` ตอนโหลด, ใส่ในกล่องข้อความ, ส่งอัตโนมัติ, แล้วลบ query param ออกจาก URL กันส่งซ้ำตอน reload — ทดสอบ flow เต็ม (กด chip บน Dashboard → เข้าหน้าแชท → ถามอัตโนมัติ → ได้คำตอบจริงจาก tool-use loop เดิม) ผ่านแล้วบน production
  - เพิ่ม **floating chat icon** (`public/chat-fab.js`, มุมขวาล่าง) ลิงก์ตรงไปหน้า `/admin/chat` — ใส่ไว้**ทุกหน้า** ยกเว้น `/admin/chat` เอง (ซ้ำซ้อน) กับ `/admin/login` (หน้า auth ชั่วคราว) ทดสอบแล้วขึ้นถูกทั้งหน้า public (Screener) และหน้า admin ที่ล็อกอินแล้ว (Watchlist)
- ✅ **AI Dashboard summary card** (`GET /api/dashboard-summary`) — การ์ดสรุปข่าวทอง + หุ้นไทยที่น่าสนใจ โผล่บน Dashboard ทองทันทีที่เปิดหน้า (`lib/dashboard-summary.ts`)
  - ดึงข้อมูลจริงล้วน: ราคา+แนวรับ-ต้านทอง (ถ้ามี), ข่าวทองล่าสุด 5 ชิ้นจาก D1, สัญญาณหุ้นไทยจาก **screener engine เดิม** (`buildScreener` ที่มีอยู่แล้ว, D1-only, ไม่เพิ่ม subrequest) — เรียก Workers AI (`@cf/qwen/qwen3.8-27b`, โมเดลเดียวกับ chat) **1 ครั้ง** ให้แต่งเป็นภาษาไทยธรรมชาติจากข้อมูลจริงเท่านั้น ห้ามเดาตัวเลข
  - **Cache 30 นาทีใน KV** (ไม่ใช่ cron ใหม่) — "ตอนเปิดหน้า" ไม่ได้แปลว่าเรียก AI ทุกครั้งที่มีคนเข้า สร้างใหม่แบบ lazy ตอน cache หมดอายุ ปุ่ม "รีเฟรชสรุป" บังคับสร้างใหม่ได้แต่มี **cooldown 60 วิ ที่ shared กันทุกคน** กัน spam (เพราะ route นี้ public ไม่มี auth เหมือนหน้า Dashboard อื่น)
  - Gold/stock ส่วนไหนไม่มีข้อมูลพอ (เช่น ยังไม่มี TWELVEDATA_API_KEY หรือไม่มีหุ้นที่มีสัญญาณตอนนั้น) โชว์ `pending-badge` เดิมของแอป ไม่ใช่ error, ไม่เคยแต่งข้อมูลลอยๆ
  - **⚠️ เจอบั๊กจริงระหว่างทดสอบ**: ตอนแรก map ทั้ง `gainer` และ `loser` signal ไปเป็น tag "gainer" (สีเขียว) เหมือนกัน — ผลคือหุ้นที่ร่วง -3% ขึ้น badge สีเขียวเหมือนหุ้นที่พุ่งขึ้น (สื่อความหมายผิดทาง) แก้โดยเพิ่ม tag "loser" แยก (สีแดง) ทดสอบซ้ำแล้วหุ้นลบเปลี่ยนแปลงขึ้น badge สีแดงถูกต้อง — และปรับ prompt เพราะรอบแรกโมเดลตอบแบบ data-dump ตรงๆ ("สัญญาณ gainer") ไม่เป็นธรรมชาติ ปรับ system prompt ให้เขียนแบบนักเทรดคุยกับเพื่อน ผลลัพธ์เป็นธรรมชาติขึ้นชัดเจน
  - ✅ **สรุปประจำวันใน AI Chat** — ใช้ **endpoint เดียวกัน** (`/api/dashboard-summary`) เป็นข้อความแรกของแชทว่างๆ (เปิดครั้งแรก หรือหลังกด "เริ่มแชทใหม่") แทน greeting ธรรมดา แสดงเป็นการ์ดพร้อม stat, รายการหุ้น, และปุ่ม quick-action ("ขยายความเรื่อง XXX") กดแล้ว prefill คำถามแล้วส่งจริงเข้า tool-use loop เดิมทันที — digest นี้เป็นแค่ display, **ไม่เคย** ถูกบันทึกลง `chat_messages` หรือส่งกลับเข้า model เป็น context (กัน token เปลืองและกันโมเดลเห็น JSON/สรุปเก่าปนกับบทสนทนาจริง)
    - **⚠️ เจอปัญหาจริงตอน deploy**: ตอน cache 30 นาทีหมดอายุ endpoint นี้เรียก Workers AI จริง ใช้เวลา **~20 วิ** (เทสจริงบน production ด้วย curl) — เดิมหน้าแชทว่างเปล่าไม่มีอะไรโชว์ระหว่างรอ (ดูเหมือนพัง) แก้โดยใช้ "thinking card" ตัวเดียวกับตอนแชทจริงกำลังทำงาน (icon โยก + progress bar + นับวินาที) โชว์ระหว่างรอ digest โหลด ทดสอบซ้ำแล้ว UX ลื่นขึ้นชัดเจน ทั้งกรณี cache miss (ช้า) และ cache hit (ไวทันที)
  - **✅ แยกการ์ดทอง/หุ้น + เพิ่มเวลาเปิด-ปิดตลาด (2026-09-06)**: ตามที่ขอ — การ์ด AI summary เดิมที่รวมทองกับหุ้นไว้ในการ์ดเดียวบน ทอง Dashboard ถูกแยกเป็น 2 การ์ดอิสระ:
    - **ทอง Dashboard**: การ์ด "สรุปทองประจำวัน" เหลือแค่ narrative/sentiment ทอง + stat 2 อัน (% 24 ชม., ข่าวใหม่) + chip เฉพาะทอง
    - **หุ้นไทย Dashboard**: การ์ด "หุ้นที่น่าจับตาวันนี้" ใหม่ (ก่อนหน้านี้ไม่มีการ์ด AI เลยในหน้านี้) — stat จำนวนหุ้นที่มีสัญญาณ + รายการหุ้น + chip
    - ทั้งสองการ์ดอ่านจาก **`/api/dashboard-summary` ตัวเดียวกัน** (ไม่มี endpoint ใหม่) แค่แสดงคนละครึ่งของข้อมูลเดิม เลยซิงค์กันเองโดยอัตโนมัติ (cache/digest เดียวกัน)
    - เพิ่ม **`public/market-hours.js`** — คำนวณสถานะเปิด/ปิดตลาดจากเวลาปัจจุบันจริง (ไม่ใช่ backend, คำนวณฝั่ง browser ล้วนๆ โดยยึด **timezone Asia/Bangkok เสมอ** ไม่ว่าเครื่องผู้ใช้จะตั้ง timezone อะไร): ทอง/XAU เปิดจันทร์ 05:00 – เสาร์ 05:00 (ตลาด forex เกือบ 24 ชม.), SET เปิด จ.-ศ. 10:00-12:30 และ 14:30-16:30 — แสดงเป็น pill สีเขียว/เทาข้างชื่อการ์ด
    - **⚠️ ข้อจำกัดที่บอกตรงๆ**: ไม่รู้จักวันหยุดนักขัตฤกษ์ไทย (SET) หรือวันหยุดตลาดทอง (เช่น คริสต์มาส) — วันแบบนั้นจะขึ้นว่า "เปิด" ทั้งที่จริงปิด เพราะโค้ดเช็คแค่ตารางเวลาประจำสัปดาห์เท่านั้น ยังไม่ได้ผูกกับปฏิทินวันหยุดจริง
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
    dashboard-summary.ts  GET /api/dashboard-summary — AI gold+stock digest for the Dashboard card (public)
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
    chat-history.ts  Persist chat_messages (D1) — save/get/clear, ใช้โดย routes/chat.ts
    dashboard-summary.ts  สร้าง digest จริง (ราคา+ข่าวทอง, screener หุ้น) แล้วเรียก Workers AI 1 ครั้งแต่งข้อความ, cache 30 นาทีใน KV
public/
  sidebar.js         Sidebar เมนู (mount ทุกหน้าผ่าน #sidebar-mount)
  chat-fab.js        Floating chat icon ลิงก์ไป /admin/chat (ทุกหน้า ยกเว้น chat เองกับ login)
  market-hours.js    คำนวณสถานะเปิด/ปิดตลาดทอง+SET จากเวลาจริง (client-side, timezone Asia/Bangkok เสมอ) — ไม่รู้จักวันหยุดนักขัตฤกษ์
  index.html/js      ทอง Dashboard
  news.html/js       ทอง ข่าว
  risk-calculator.*  ทอง คำนวณความเสี่ยง (client-side ล้วน)
  stock-dashboard.*  หุ้นไทย Dashboard
  screener.html/js   หุ้นไทย Screener
  admin/             login, zone-finder, watchlist, auto-trade, chat (+ common.js: auth guard/logout)
schema.sql           D1 schema
```
