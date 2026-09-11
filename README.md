# Pre-AUREUM — Trading Analytics (Phase 1: ทอง)

> **หมายเหตุชื่อ**: แบรนด์/ข้อความในแอปเปลี่ยนเป็น "Pre-AUREUM" แล้ว (2026-09-07) — ส่วน URL ที่ deploy จริง (`aureum.precare.workers.dev`) และชื่อ Worker/โปรเจกต์ยังคงเป็น `aureum` เหมือนเดิม เพราะเปลี่ยน URL/slug ของ Worker เป็นการเปลี่ยน infrastructure จริง (ต้อง deploy ใหม่ทั้งหมด, ลิงก์เดิมพัง) ซึ่งไม่ได้อยู่ในขอบเขตของคำขอนี้

Cloudflare Workers app (Hono + D1 + KV + Cron) ที่ดึงราคาทอง (XAU/USD) จาก Twelve Data
คำนวณแนวรับ-แนวต้าน แล้วแสดงผลผ่านหน้าเว็บ static ที่ serve จาก Worker เดียวกัน

## สถานะตอนนี้ (Milestone ที่ scaffold แล้ว)

- ✅ M0 — โครงโปรเจกต์ (Hono, TypeScript, D1/KV/Cron config)
- ✅ M1 — Gold price pipeline (Twelve Data → KV cache + D1 history) — เชื่อม TWELVEDATA_API_KEY แล้ว (2026-09-06)
  - **✅ เปลี่ยนเป็น on-demand แล้ว (2026-09-08)**: ตามที่ขอ ("ไม่ต้องดึงตลอดเวลา ค่อยดึงตอนที่เปิด web app") — เดิม cron `*/5 * * * *` ดึงราคา+แท่งเทียนทองทุก 5 นาที **ตลอดเวลาไม่ว่าจะมีคนเปิดแอปดูอยู่หรือไม่** ตอนนี้ตัด `pollGoldPrice` ออกจาก cron แล้ว (cron ที่เหลือมีแค่ข่าว) — ราคา/กราฟ/แนวรับ-ต้าน **fetch จาก Twelve Data ก็ต่อเมื่อมีคนเปิดหน้าเว็บจริง** ผ่าน 3 route (`/api/price/gold`, `/api/price/gold/history`, `/api/sr/gold`) ที่ต่างก็ cache/throttle เอง (`src/lib/gold-refresh.ts`): ราคาจริง cache 90 วิใน KV, แท่งเทียนแต่ละ timeframe top-up แค่ tail (5 แท่งล่าสุด) โดยมี cooldown 240 วิ/timeframe กันยิง Twelve Data ซ้ำถ้ามีคนเปิดหลายแท็บ/reload ถี่ๆ
  - **⚠️ เจอ regression ระหว่างแก้**: ตอนรวม logic เข้า `getCachedGoldPrice()` เกือบทำให้ field `ts` ที่ frontend เอาไปโชว์เป็น "อัปเดตล่าสุด" กลายเป็นเวลาที่ **request เข้ามา** แทนที่จะเป็นเวลาที่ **ราคาถูก fetch จริง** (ถ้าไม่จับจุดนี้ หน้าเว็บจะโชว์ "อัปเดตล่าสุด" เป็นเวลาปัจจุบันตลอด ทั้งที่ราคาจริงอาจเก่ากว่านั้น — ผิดหลัก honest data ของโปรเจกต์นี้) แก้แล้วให้ `ts` มาจากตอน fetch จริงเท่านั้น
  - ผลข้างเคียงที่ดี: `routes/sr.ts` เดิมเรียก `fetchLatestPrice` สดทุกครั้งที่มีคน request (ไม่มี cache เลย) ตอนนี้ใช้ cache ร่วมกับ `/api/price/gold` แล้ว ลดจำนวนเรียก Twelve Data ลงไปอีก
  - **⚠️ ชน Twelve Data free-tier quota จริงในวันเดียวกัน (2026-09-08 บ่าย)**: cooldown เดิม (240 วิ/timeframe + TTL ราคา 90 วิ) ยังถี่เกินไป — ใช้ไป **1300+ credits จาก quota ฟรี 800/วัน** ภายในไม่กี่ชั่วโมง (เห็น error message ตรงจาก Twelve Data เอง ไม่ใช่เดา) ยิ่งไปกว่านั้น `dashboard-summary.ts` เดิมก็เรียก `fetchLatestPrice` ของตัวเองแยกต่างหาก ไม่ได้ใช้ cache ร่วม เป็นอีกจุดที่ยิงซ้ำ — และพบว่า **request ที่ถูกปฏิเสธเพราะเกิน quota ก็ยังถูกนับเป็น credit ใช้ไปด้วย** (เลข error message ขยับขึ้นเรื่อยๆ แม้ทุก call จะ fail หมด) ทำให้ยิ่งทดสอบซ้ำยิ่งแย่ลง
    - แก้โดย: เพิ่ม `REFRESH_COOLDOWN_SECONDS` เป็น **1800 วิ (30 นาที)/timeframe** และ `LATEST_PRICE_TTL_SECONDS` เป็น **300 วิ**, ให้ `dashboard-summary.ts` ใช้ `getCachedGoldPrice()` ร่วมกับ route อื่นแทนที่จะยิงเอง — ทั้งหมดนี้ป้องกันไม่ให้เกิดซ้ำ**วันถัดไป** เท่านั้น ของวันนี้ต้องรอ quota reset เอง (Twelve Data ไม่บอกเวลา reset ชัดเจนในข้อความ error)
    - ยังแก้ **ข้อความ error ที่ผิด** ไปด้วย: เดิม fallback ทุกจุดเขียนตายตัวว่า "รอเชื่อมต่อข้อมูลราคา (Twelve Data API key)" ซึ่งกลายเป็นข้อความเท็จตั้งแต่เชื่อม API key สำเร็จ (2026-09-06) — ตอนนี้เมื่อ fetch ล้มเหลวไม่ว่าสาเหตุอะไร (quota, network, ฯลฯ) จะขึ้น "ราคาทองยังใช้ไม่ได้ตอนนี้ ลองใหม่ภายหลัง" แทน (ไม่เจาะจงเดาสาเหตุผิดๆ) พร้อม log ข้อความจริงจาก Twelve Data ไว้ใน console ให้ debug ได้
  - **⚠️ เจอช่องโหว่เพิ่มอีกจุดจริง (2026-09-09 เช้า)**: ผู้ใช้เช็ค Cloudflare Observability เจอ error rate เกิน 50% เอง (203 errors / 190 success ใน 1 ชม.) — เข้าไปดู log ตรงๆ พบว่า `getCachedGoldPrice()` เขียน cache ลง KV **แค่ตอน fetch สำเร็จเท่านั้น** ถ้า fetch ล้มเหลว (เช่นตอน quota หมดจากบั่กเมื่อวาน) จะ**ไม่มี cooldown เลย** — ทุก request ที่เข้ามาหลังจากนั้นจะยิง live ซ้ำใหม่ทุกครั้ง ไม่ใช่แค่ตอน cache หมดอายุ เห็นชัดใน log: error รัวทุก 60 วิพอดี ตรงกับรอบ auto-poll ของหน้าเว็บ (คนละบั๊กกับเมื่อวาน — เมื่อวานคือ cooldown สั้นไป, วันนี้คือไม่มี cooldown เลยตอน fail) เทียบกับ `refreshGoldTail()` ที่ตั้ง cooldown **ก่อน**ลองยิงเสมอ (ปลอดภัยอยู่แล้วไม่ว่าสำเร็จหรือพัง)
    - แก้โดยเพิ่ม `withFailureBackoff()` helper ใน `gold-refresh.ts` — ตั้ง cooldown 60 วิเมื่อ fetch ล้มเหลว (ไม่ใช่แค่ตอนสำเร็จ) ใช้ร่วมกันทั้ง `getCachedGoldPrice()` และ backfill แบบเต็มช่วงตอน D1 ว่างครั้งแรก (`backfillGoldCandles()`, จุดที่ไม่เคยมี cooldown มาก่อนเลยเช่นกัน) — ทดสอบยืนยันแล้วว่า route ยังทำงานถูกต้อง (cache hit ให้ `ts` เดิม ไม่ยิงซ้ำ)
  - **✅ ประหยัด quota ฝั่ง frontend เพิ่มอีกชั้น (2026-09-09)**: ตามที่ขอ ("ถ้าไม่เปิดหน้า browser ไว้ไม่ต้องยิง, หรือเปิดค้างไม่เกิน 5 นาที ขึ้น popup ให้ refresh") — `public/app.js`'s auto-poll (`setInterval` ทุก 60 วิ บน Dashboard ทอง หน้าเดียวที่มี auto-poll จริงในทั้งแอป) ตอนนี้:
    - **หยุดยิงตอนแท็บไม่ visible** — เช็ค `document.visibilityState !== "visible"` ก่อนทุกครั้ง ถ้าซ่อนอยู่ (สลับแท็บ/ย่อหน้าต่าง) ข้ามรอบนั้นไปเลย ไม่ fetch
    - **หยุด auto-refresh ทั้งหมดหลังเปิดค้างไว้ 5 นาที** (`AUTO_REFRESH_MAX_DURATION_MS`) แล้วโชว์ banner "หยุดอัปเดตอัตโนมัติแล้ว ... กดรีเฟรช" แทนที่จะ poll เงียบๆ ต่อไปเรื่อยๆ ไม่มีกำหนด — กดปุ่ม "รีเฟรช" ใน banner แล้วจะโหลดข้อมูลใหม่ + เริ่มนับ 5 นาทีใหม่
    - ทดสอบยืนยันแล้วผ่าน browser จริง: trigger banner ได้ถูกต้อง, กดรีเฟรชแล้ว banner หายและ timer เริ่มใหม่ถูกต้อง
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
  - ✅ **แนบไฟล์ประกอบคำถามได้แล้ว (2026-09-11)**: ตามที่ขอ ("ต้องการให้สามารถส่งแนบ เช่น picture, doc ไปประกอบในการสอบถามได้") — แนบรูปภาพ (PNG/JPEG/WEBP/GIF) หรือไฟล์ข้อความ (.txt/.md) ได้สูงสุด 3 ไฟล์/ข้อความ ผ่านปุ่ม 📎 ข้างช่องพิมพ์
    - **ขอบเขตที่ตกลงกันไว้**: ยังไม่รองรับ PDF/Word ตรงๆ — ต้อง parse เป็นข้อความ/รูปก่อนถึงจะส่งเข้าโมเดลได้ เป็นงานเพิ่มที่ใหญ่กว่า (ต้องมี library แกะไฟล์ใน Workers runtime หรือพึ่ง external service) ตัดสินใจเริ่มจากรูปภาพ+ข้อความก่อนตามที่เลือกไว้
    - **✅ ตรวจสอบ schema จริงก่อนสร้างของจริง**: โมเดล `@cf/qwen/qwen3.8-27b` ที่ใช้อยู่แล้วรองรับรูปภาพ (vision) ตามเอกสาร Cloudflare — แต่ไม่เชื่อ code sample ในเอกสารเฉยๆ (เจอ GitHub issue จริงที่บอกว่า sample ของโมเดล vision ตัวอื่นใช้ไม่ได้) เลยสร้าง debug route ชั่วคราวยิงรูปทดสอบ (1x1 pixel สีแดง) เข้า `env.AI.run()` ตรงๆ ด้วย schema แบบ OpenAI (`content: [{type:"text",...},{type:"image_url",image_url:{url:dataUrl}}]`) ก่อนเขียนโค้ดจริง — โมเดลตอบ "The image is red" ถูกต้อง ยืนยันว่า schema นี้ใช้ได้จริงกับโมเดลนี้ ลบ debug route ทิ้งหลังยืนยันแล้ว
    - รูปภาพส่งแค่ **เทิร์นที่แนบเท่านั้น** ไม่ถูกส่งซ้ำในเทิร์นถัดๆ ไป (ประหยัด Neurons — ไฟล์ข้อความก็เหมือนกัน) ประวัติที่บันทึกลง D1 เก็บแค่ note "📎 ชื่อไฟล์" ไม่เก็บข้อมูลไฟล์จริง (กัน D1 บวมจาก base64 blob)
    - ไฟล์ข้อความ (.txt/.md) ต่อเข้ากับข้อความคำถามตรงๆ เป็น context ธรรมดา ไม่ต้องใช้ vision API
    - จำกัดขนาด: รูปไม่เกิน ~4MB/รูป, ไฟล์ข้อความไม่เกิน 50,000 ตัวอักษร, สูงสุด 3 ไฟล์/ข้อความ — เช็คทั้งฝั่ง client (แจ้งทันทีไม่ต้อง round-trip) และฝั่ง server (กันกรณี client ถูกข้าม)
    - อัปเดต system prompt ให้บอกโมเดลว่าเห็นรูปที่แนบได้จริง แต่ราคา/ระดับที่ "เห็น" ในรูปไม่ใช่ข้อมูล live — ถ้าคำถามต้องใช้ราคาจริง ให้เรียก tool เหมือนเดิม ไม่ใช่อ่านตัวเลขจากรูป
    - **หมายเหตุ**: ยังไม่ได้ click-test ผ่าน UI จริงเพราะหน้า AI Chat ล็อกอินด้วยรหัสผ่าน admin (ไม่ควรกรอกรหัสผ่านแทนเจ้าของ) — verify กลไก vision หลักผ่าน production โดยตรงแล้ว (ข้างบน), syntax/typecheck ผ่านสะอาด, และตรวจ layout ปุ่มแนบไฟล์ผ่าน browser แล้วว่าเรนเดอร์ถูกต้อง — รอ user ทดสอบ flow เต็มจริงหลังล็อกอิน

- ✅ กราฟแท่งเทียนจริง (`public/candlestick-chart.js`) ใช้ร่วมกันทั้งทองและหุ้นไทย วาดจาก `/api/price/*/history` จริง overlay เส้นแนวรับ-ต้าน + เส้นราคาปัจจุบัน สลับ timeframe/symbol แล้ว re-render ถูกต้อง — ตรวจด้วยตาจริงผ่าน browser ไม่ใช่แค่ curl (เจอบั๊ก `/api/price/stock/` มี trailing slash เกินจนหน้าเว็บพังเงียบๆ ระหว่างเช็ค แก้แล้ว)
  - เพิ่ม label "(ช่วงกราฟที่แสดง)" กำกับ % เปลี่ยนแปลงในหัวการ์ด เพราะความหมายเปลี่ยนไปตาม timeframe ที่เลือก (ไม่ใช่ % ต่อวันเสมอไป) กันเข้าใจผิด
  - **✅ ซูม/แพน/ปรับแกนได้แล้ว (2026-09-07)**: ตามที่ขอ (ให้ทำตาม UX ของ TradingView) — เดิมกราฟเป็น SVG ล้วน วาดครั้งเดียวแบบ static ไม่มี interaction เลย เปลี่ยนมาใช้ **TradingView Lightweight Charts** (open-source, MIT, โหลดจาก jsdelivr CDN) แทนการ hand-roll SVG เอง เพราะเป็น library ของ TradingView เองที่ให้ scroll-to-zoom, ลาก pan, ลากแกนราคา/เวลาเพื่อ rescale, double-click รีเซ็ต, pinch-zoom บนมือถือ — **ครบทุกอย่างที่ config default โดยไม่ต้องเขียน interaction เอง** ทดสอบยืนยันแล้วว่า handleScroll/handleScale ทำงานจริงทั้งสองหน้า (ทอง + หุ้นไทย)
    - **⚠️ เจอบั๊กจริงระหว่าง migrate**: library ตรวจสอบ color string เองก่อนใช้ (ไม่ได้ส่งตรงเข้า canvas เฉยๆ) และไม่รู้จัก `oklch()` ที่แอปใช้เป็น token หลักทั้งระบบ — ลองแก้ด้วย `getComputedStyle().color` ก่อน แต่พบว่า environment นี้ (เช็คจริงผ่าน browser ไม่ใช่เดา) คืนค่า oklch() กลับมาเหมือนเดิมไม่แปลงเป็น rgb() ให้ สุดท้ายแก้โดยวาดสีลงบน canvas 1x1 แล้วอ่านค่า pixel กลับด้วย `getImageData()` (`resolveColor()` ใน candlestick-chart.js) ซึ่ง canvas fillStyle รองรับ oklch() จริงและคืนค่า sRGB ที่แน่นอนเสมอ — ทดสอบแล้วสีตรงกับ token เดิมของแอปทุกจุด (เขียว/แดง/ทอง/border/muted)
    - เปลี่ยน `<script>` เพิ่มใน `index.html`/`stock-dashboard.html`: โหลด `lightweight-charts@4.2.3` (pinned) ก่อน `candlestick-chart.js`

- ✅ ขยาย watchlist หุ้นไทยเป็น **SET50 ทั้งชุด (50 ตัว)** (source: เอกสาร constituents ทางการของ SET, ปรับปรุงทุก 6 เดือน ม.ค./ก.ค. — ดูหมายเหตุใน `stock-symbols.ts` ว่าต้องไปดึงใหม่ตอนไหน) เปลี่ยน symbol selector หน้า Dashboard จาก tab ปุ่ม (ใช้ไม่ได้ที่ 50 ตัว) เป็น dropdown แทน
  - **⚠️ เจอบั๊กจริงจัง**: Cloudflare Workers Free plan จำกัด **50 subrequests ต่อ 1 invocation** — ทั้ง Screener (loop 50 หุ้น) และ cron รายชั่วโมงเดิม (fetch ราคา+ประวัติ 50 หุ้น) จะ**เกินลิมิตแล้วพังกลางคัน**ถ้าไม่แก้ พบระหว่างทดสอบจริง (screener โหลด 12.5 วิ ตอน cache ว่าง) ไม่ใช่แค่เดา
  - แก้โดย: **Screener อ่านจาก D1 อย่างเดียว ไม่ fetch สดเด็ดขาด** (ข้ามหุ้นที่ cron ยังไปไม่ถึง แทนที่จะ fetch แทน) + **cron แบ่งเป็น batch 15 ตัว/รอบ หมุนผ่าน KV cursor** (ครบ 50 ตัวใน ~4 ชั่วโมง) + cron ดึงแค่ D1 (ตัด H4 ออกจาก eager fetch, timeframe อื่น lazy-load ทีหลังตอนมีคนดูจริง)
  - ผลคือหลัง deploy ใหม่ **หุ้น 46 ตัวที่เพิ่มมาจะยังไม่ขึ้นใน Screener ทันที** ต้องรอ cron หมุนไปถึงภายในไม่กี่ชั่วโมง (4 ตัวเดิมที่มีข้อมูลอยู่แล้วขึ้นปกติ)
  - **✅ พิมพ์ชื่อหุ้นได้ทุกตัว ไม่จำกัดแค่ watchlist แล้ว (2026-09-08)**: ตามที่ขอ ("เพื่อไม่ให้เปลือง API ค่อยยิงหาแนวรับต้าน เฉพาะตัวที่อยากดู เปิดให้พิมพ์ชื่อหุ้นได้") — Dashboard หุ้นไทยเปลี่ยนจาก `<select>` ที่เลือกได้แค่ 50 ตัวใน watchlist เป็นช่องพิมพ์ (`<input list>` + datalist แนะนำ SET50 แต่ไม่บังคับ) — พิมพ์ชื่อย่อหุ้นตัวไหนก็ได้ในตลาด แล้วกดปุ่ม "ไปดู" (หรือ Enter — ใช้ `<form>` submit จริง ไม่ใช่ keydown listener เอง เพราะทดสอบแล้วพบว่า Enter ตอน datalist dropdown เปิดอยู่ อาจไม่ยิง manual keydown handler ให้)
    - แก้ backend: `routes/stock.ts` เดิม gate ด้วย `isKnownSymbol()` (ต้องอยู่ใน watchlist 50 ตัวเท่านั้น) เปลี่ยนเป็น `isValidSymbolFormat()` (เช็คแค่รูปแบบตัวอักษร/ตัวเลขสมเหตุสมผล ไม่ผูกกับ watchlist) — symbol นอก watchlist ก็ query จริงผ่าน Yahoo Finance ได้ ถ้าไม่มีจริง Yahoo จะ error ชัดเจน ไม่ต้องเดา
    - ทดสอบยืนยันแล้วด้วยหุ้นจริงนอก watchlist (`MAJOR`, `CENTEL`) — ราคา, กราฟ, แนวรับ-ต้านคำนวณถูกต้องทั้งคู่ ไม่ต่างจากหุ้นใน watchlist เลย
    - **หมายเหตุ**: หน้า AI Chat ยังคงจำกัด tool หุ้นไว้แค่ watchlist 50 ตัวเหมือนเดิม (`chat-tools.ts`'s `isKnownSymbol`) — เป็นการตัดสินใจแยกกัน ไม่ได้แก้ในรอบนี้ เพราะยังอยากคุมขอบเขตของ AI tool ไว้ให้แคบ
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
    - **✅ เพิ่มวันหยุดตลาดแล้ว (2026-09-10, ตามที่ขอ "ให้ทำแค่ label บอกล่วงหน้าไว้ก็พอ")**: ไม่ได้สร้างระบบคำนวณปฏิทินวันหยุดเอง — ใส่เป็น**รายการวันที่ตรงๆ** ที่เช็คจากเว็บทางการแล้ว: SET ทั้ง 20 วันหยุดปี 2026 ดึงจริงจาก [set.or.th/en/about/event-calendar/holiday](https://www.set.or.th/en/about/event-calendar/holiday) (เข้าไปอ่านหน้าเว็บจริง ไม่ใช่เชื่อ aggregator เว็บอื่น — ระหว่างเช็คเจอ aggregator บางเว็บบอกวันอาสาฬหบูชาผิดวัน, และไม่มีวันหยุดพิเศษ 16 ต.ค. ที่ SET เพิ่งประกาศเพิ่มด้วย) ส่วนทอง/forex ใช้แค่ 2 วันที่ตลาดหลักทั่วโลกปิดพร้อมกันจริง (คริสต์มาส + ปีใหม่ — ตรวจสอบผ่านหลายแหล่งแล้ว)
      - โชว์ 2 แบบ: (1) วันหยุดวันนั้นเอง — pill สถานะตลาดเปลี่ยนจาก "เปิด/ปิด" ปกติเป็น "ปิด (ชื่อวันหยุด)" ตรงๆ (2) **ล่วงหน้า** — ถ้าวันหยุดถัดไปอยู่ภายใน 7 วัน ขึ้น badge เพิ่มข้างๆ เช่น "อีก 3 วันตลาดปิด: วันปิยมหาราช" ทั้งหน้า Dashboard ทอง (`#gold-holiday-notice`) และหุ้นไทย (`#set-holiday-notice`)
      - **ข้อจำกัดที่บอกตรงๆ**: รายการปี 2026 เท่านั้น เป็น hardcoded list ไม่ใช่ดึงสดจาก API ไหน — ปี 2027 ต้องมาอัปเดตโค้ด `market-hours.js` เอง (SET ปกติประกาศล่วงหน้าไม่กี่เดือนก่อนสิ้นปี ดูหมายเหตุในไฟล์ว่าต้องอัปเดตตอนไหน)
- ✅ **หน้าจอ responsive รองรับมือถือแล้ว (2026-09-08)**: ก่อนหน้านี้ sidebar 220px คงที่กินพื้นที่หน้าจอมือถือเกือบหมด และการ์ดหัวข้อยาวๆ (เช่น "หุ้นที่น่าจับตาวันนี้") หักคำเป็นคอลัมน์แคบๆ น่าเกลียดที่หน้าจอแคบ (พบจริงตอนเทส `resize_window` preset mobile 375px ไม่ใช่แค่เดา)
  - `sidebar.js`/`styles.css`: sidebar กลายเป็น off-canvas drawer ที่ ≤768px (ปุ่ม hamburger ลอยมุมซ้ายบน กด backdrop หรือกด nav link แล้วปิดอัตโนมัติ) — เดิมไม่มีทางย่อ sidebar เลย
  - `.ai-summary-head` (การ์ด AI summary ทั้งทองและหุ้น): เพิ่ม `flex-wrap` ให้ badge/เวลา/ปุ่มรีเฟรชตกไปบรรทัดใหม่แทนที่จะบีบหัวข้อจนตัวหนังสือหักคำ
  - `main` แบบ 2 คอลัมน์ (Dashboard ทอง + หุ้นไทย) ยุบเหลือ 1 คอลัมน์ที่ ≤900px
  - `#usage-panel` (หน้า AI Chat) จำกัด `max-width: calc(100vw - 40px)` กันล้นขอบจอที่แคบมากๆ
  - ทดสอบยืนยันแล้วไม่มี horizontal overflow (`scrollWidth === innerWidth`) ที่ 375px ทั้ง 3 หน้าหลัก (ทอง Dashboard, หุ้นไทย Dashboard, AI Chat)
- ✅ **ลิงก์ข้อมูล SET อย่างเป็นทางการ (2026-09-09)**: ตามที่ขอ ("แปะลิ้ง icon ให้กดไปดูข้อมูลปันผล, ราคาย้อนหลัง ใน web SET") — Screener และ Dashboard หุ้นไทย มีปุ่ม icon 2 อัน (ปันผล/ราคาย้อนหลัง) เปิดหน้า set.or.th จริงในแท็บใหม่ ต่อ symbol ที่กำลังดูอยู่
  - URL pattern ยืนยันจริงด้วยการเข้า set.or.th ดู DOM ตรงๆ (ไม่ได้เดา): `.../market/product/stock/quote/{SYMBOL}/rights-benefits` (ปันผล/สิทธิประโยชน์) และ `.../quote/{SYMBOL}/historical-trading` (ราคาย้อนหลัง)
  - แชร์โค้ดเดียว (`public/set-links.js`) ระหว่าง Screener (icon อย่างเดียว ในคอลัมน์ตาราง) กับ Dashboard (icon + label เต็ม)
  - ออกแบบผ่าน mockup ก่อนเขียนโค้ดจริง (ขอ approve ก่อนตามที่คุยกันไว้ตั้งแต่ต้น session)
- ✅ **สัญญาณซื้อ-ขายทอง หลาย timeframe (2026-09-09)**: ตามที่ขอ ("ทำสัญญาณซื้อ สัญญาณขาย มาเพิ่มให้หน่อย ... ให้มีหลายๆ timeframe ด้วย") — การ์ดใหม่บน Dashboard ทอง โชว์ badge หลัก (ซื้อ/ขาย/รอดู) + chip แยกทั้ง 5 timeframe (M15/H1/H4/D1/W1) คู่กับการ์ด "สรุปทองประจำวัน"
  - **ไม่ได้คิด indicator ใหม่** — ใช้สูตร 3-factor scoring เดิมที่มีอยู่แล้วและทดสอบแล้วจาก Zone Finder's "Bias" (`zone-finder.ts`): ราคายืนเหนือแนวรับใกล้สุด, EMA50>EMA200 (เทรนด์), มีที่ว่างพอก่อนถึงแนวต้าน — แต่ละอย่าง ~33.3 คะแนน รวม ≥67=ซื้อ, ≤33=ขาย, กลางๆ=รอดู เพียงคำนวณแยกทีละ timeframe แทนที่จะคำนวณทีเดียวรวม
  - Backend ใหม่: `src/lib/gold-signal.ts` + `GET /api/signal/gold` (public, ข้อมูลชั้นเดียวกับ `/api/sr/gold` ที่เปิดอยู่แล้ว) — ดึงแท่งเทียนผ่าน `gold-refresh.ts`'s cache/cooldown/backoff เดิมเสมอ ไม่เคยยิง Twelve Data ตรงๆ กันโควตาพังซ้ำแบบที่เจอมาก่อนหน้านี้ในวันเดียวกัน
  - Frontend: fetch ครั้งเดียวตอนเปิดหน้า/รีเฟรช ได้ข้อมูลครบ 5 timeframe มาพร้อมกัน — สลับปุ่ม timeframe บนกราฟแค่ **เปลี่ยน badge ที่โชว์อยู่** (re-render จาก data เดิมในมือ) ไม่ยิง fetch ใหม่ทุกครั้งที่กด tab
  - ออกแบบผ่าน mockup 4 รอบก่อนเขียนโค้ดจริง (การ์ดเดี่ยว → in-context → compact คู่กับสรุปทอง → จัดแถวใหม่เป็น 3 แถวตามที่ขอสุดท้าย) — Dashboard ทองตอนนี้เป็น 3 แถว: (1) สรุปทองประจำวัน + สัญญาณซื้อ-ขาย คู่กัน (2) กราฟราคา เต็มความกว้าง (3) แนวสำคัญใกล้ราคา เต็มความกว้าง เปลี่ยนจาก list เป็นตาราง tile 4 ช่อง ให้เห็นแนวรับ-ต้านหลายระดับพร้อมกันชัดเจนขึ้น (สไตล์เปลี่ยนเฉพาะ CSS ใน `index.html` เอง ไม่แตะ `styles.css` ที่ใช้ร่วมกับ Dashboard หุ้นไทย กันกระทบหน้าอื่น)
  - **✅ แก้แล้ว (2026-09-10, ตามที่ขอ "ทำ EMA200")**: เดิม EMA200 ต้องการแท่งเทียนอย่างน้อย 200 แท่งถึงจะคำนวณได้ แต่ทุก route ขอแค่ 150 แท่ง — ทำให้เงื่อนไขเทรนด์ของสัญญาณซื้อ-ขาย**ไม่มีทางผ่านได้เลยไม่ว่าตลาดจริงจะเป็นขาขึ้นหรือลง** คะแนนสูงสุดที่เป็นไปได้เลยค้างอยู่ที่ ~67/100 ตลอด
    - เพิ่ม `GOLD_CANDLE_COUNT = 210` ค่ากลางใน `gold-refresh.ts` ใช้แทนเลข 150 เดิมที่กระจายอยู่ 5 จุด (sr.ts, gold-signal.ts, trend-analysis.ts, chat-tools.ts) และยก `MIN_HEALTHY_CANDLES` จาก 50 เป็น **200** โดยเฉพาะ — เพื่อให้ timeframe ที่เคย "สุขภาพดี" อยู่แล้วที่ 150 แท่ง (ต่ำกว่า 200) ยัง trigger backfill รอบใหม่ได้อีกครั้งจนครบ 210 แทนที่จะค้างที่ 150 ตลอดไป (ปัญหาเดียวกับบั๊ก D1-ค้าง-8-แท่งก่อนหน้านี้ แค่คนละเลขเกณฑ์)
    - ทดสอบยืนยันบน production แล้ว: ทุก timeframe (M15/H1/H4/D1/W1) มี **210 แท่งเต็ม** หลัง deploy, คำนวณ EMA200 มือเทียบกับผลจริงตรงกัน (เช่น H4: EMA50=4420.3 < EMA200=4440.6 → เทรนด์ขาลงจริง คะแนนเทรนด์เลยไม่ผ่านอย่างถูกต้อง ไม่ใช่ค้างเป็น false เหมือนเดิมที่ผ่านไม่ได้ไม่ว่ากรณีไหน) — ตอนนี้คะแนนสัญญาณสามารถขึ้นถึง 100/100 ได้จริงเมื่อทั้ง 3 เงื่อนไขผ่านพร้อมกัน
- ✅ **RSI(14) + ปรับเส้นแนวรับ-ต้านบนกราฟให้อ่านง่ายขึ้น (2026-09-09)**: ตามที่ถาม/ขอ ("โมเมนตัม (RSI) และปริมาณเทรด มีข้อมูลมาแสดงหรือยัง ... design เส้นกรอบแนวรับ แนวต้านมาหน่อย")
  - **RSI**: เพิ่ม `calculateRSI()` ใน `sr-engine.ts` (Wilder's smoothing มาตรฐาน period 14, คำนวณได้จากแค่ราคาปิดล้วนๆ ไม่ต้องพึ่ง volume) ต่อจากนี้ `GET /api/sr/gold` คืน field `rsi` เพิ่ม (ปัดทศนิยม 1 ตำแหน่ง, `null` ถ้าแท่งเทียนไม่พอ) — หน้า Dashboard ทองโชว์เป็น pill "RSI XX" ข้างราคา: สีแดงถ้า ≥70 (overbought), สีเขียวถ้า ≤30 (oversold), เทาปกติถ้ากลางๆ
  - **ปริมาณเทรด (Volume)**: **ยังไม่มี** — เช็คจาก response จริงของ Twelve Data แล้ว ทุกแท่งเทียนทอง `volume: null` เพราะเป็นราคา spot/CFD (OTC) ไม่มี volume จริงให้รายงาน (โค้ด `buildVolumeProfile` เขียนรองรับไว้แล้วตั้งแต่ M2 แต่จะ return "ไม่มีข้อมูล" เสมอสำหรับทอง) — ผู้ใช้เลือกไม่ทำต่อตอนนี้ (ต้องเปลี่ยน provider ถึงจะได้ volume จริง)
  - **เส้นแนวรับ-ต้านบนกราฟ**: ใช้ field `strength` (1-5, มีอยู่แล้วจาก `sr-engine.ts`, ยิ่งมีหลาย method ยืนยันพร้อมกันยิ่งสูง) ปรับสีเข้ม/จางตามความแข็งแรงของแนว (opacity 0.52-1.0) และโชว์ label ข้อความบนแกนราคาแค่ **แนวที่แข็งแรงที่สุดฝั่งละ 1 เส้น** (ที่เหลือยังคงเป็นเส้นบางสีเดิม แต่ไม่มี label) — ก่อนหน้านี้แนวรับ-ต้าน 4 ระดับ/ฝั่งที่ราคาใกล้กันมากจะมี label "แนวต้าน"/"แนวรับ" ซ้อนกันเป็นแถวยาวอ่านยาก ยืนยันจากภาพหน้าจอจริงที่ผู้ใช้ส่งมา
  - ทดสอบยืนยันแล้วบน production ทั้ง desktop และ mobile: RSI pill ขึ้นค่าจริงถูกสี ไม่มี label ซ้อนกันบนกราฟอีกต่อไป
- ✅ **หน้าใหม่ "RSI & แนวรับแนวต้าน" (2026-09-09)**: ตามที่ขอ ("อยากได้อีกกราฟ ตีเส้นกรอบมาให้แบบตัวอย่างนี้เลย แล้วบอกจุดตัด" + ภาพตัวอย่างเส้นแนวโน้มทแยง/RSI divergence 2 ภาพ) — สร้างเป็นหน้าใหม่แยกต่างหาก (`/trend-analysis`, เมนู "RSI & แนวรับแนวต้าน" ใต้ ทอง) **ไม่แตะ Dashboard เดิม** ตามที่ขอ เลือก timeframe ได้ (M15/H1/H4/D1/W1)
  - **เส้นแนวโน้มทแยง (trend channel)**: `buildTrendLine`/`findBestTouchLine` ใน `trend-analysis.ts` — ใช้แค่ **จุดสวิง 8 จุดล่าสุด** ต่อฝั่ง ไม่ใช่ทั้งประวัติ
  - **✅ ปรับให้แม่นยำขึ้นอีกรอบ (2026-09-10, ตามที่ขอ "ปรับปรุงเส้น RSI คำนวณแนวโน้มต่างๆให้แม่นยำ")**: เปลี่ยนจาก regression ล้วนๆ มาเป็นอัลกอริทึมที่ตรงนิยามเส้นแนวโน้มจริง — ลองทุกคู่จุดสวิงในกลุ่มล่าสุด เก็บเฉพาะคู่ที่ **ไม่มีจุดอื่นทะลุเส้น** (นิยามจริงของเส้นแนวรับ-ต้านทแยง) แล้วเลือกคู่ที่มีจุดอื่นมา "แตะ" เส้นมากที่สุด (เส้นที่ราคาเคารพจริง ไม่ใช่บังเอิญ) — เหมือนที่เทรดเดอร์ลากมือจริง ไม่ใช่ fit เส้นเฉลี่ย
    - เพิ่มเงื่อนไข **จุดหลังต้องอยู่ในกลุ่มล่าสุด (4 จุดท้าย)**: เจอบั๊กจริงตอนทดสอบ — เส้นที่ต่อจุดสวิงเก่ามากกับจุดสวิงกลางๆ ยัง "ไม่ถูกทะลุ" อยู่ (เพราะไม่มีจุดไหนมาแหกเส้น) แต่พอลากยาวไปถึงราคาปัจจุบันบน W1 กลับพุ่งไป **$7,154** ทั้งที่ราคาจริง ~$4,350 (เกิดเพราะทองวิ่งแรงมากในช่วงที่ผ่านมา จุดสวิง 8 จุดล่าสุดบน W1 กินเวลาเป็นปี) บังคับให้จุดหลังต้องใกล้ปัจจุบันกันเส้นเอียงชันเกินจริงจากการลากยาวข้ามเวลา
    - เพิ่ม **clamp กันเพี้ยน**: ผูกเพดาน/พื้นของเส้นกับ**ช่วงราคาจริง 30 แท่งล่าสุด** (บวก padding 30%) ไม่ใช่จากจุดสวิงที่ห่างกันเอง — เป็นเซฟตี้เน็ตสำรอง เผื่ออัลกอริทึมหลักยังเลือกคู่จุดที่ไกลราคาปัจจุบันอยู่ (เกิดขึ้นจริงกับ W1 เพราะช่วงเทรนด์แรงมีจุดสวิงน้อยแต่ห่างกันมาก) — เส้น RSI เองก็ผูกไว้ที่ 0-100 ตามธรรมชาติของ RSI
    - เพิ่ม lookback การหาจุดสวิงจาก 2 เป็น **3 แท่ง** เฉพาะไฟล์นี้ (ไม่แตะ default ของ `findSwingPoints` ที่ Dashboard/สัญญาณซื้อ-ขายใช้อยู่) ลดจุดสวิงจิ๊บจ๊อยที่เป็นสัญญาณรบกวน ให้เหลือแต่จุดที่มีนัยสำคัญจริงสำหรับลากเส้น
    - ทดสอบยืนยันบน production แล้วทุก timeframe: เส้นเกาะราคาจริงเป็นแนวโน้มที่ดูสมเหตุสมผล (เช่น W1 ตอนนี้เป็นกรอบขาขึ้น "wedge" บีบเข้าใกล้ราคาปัจจุบัน ตรงกับที่เห็นในกราฟตัวอย่างที่ส่งมา) ไม่มีเส้นพุ่งหลุดจอแบบเดิมอีกแล้ว
  - **RSI แบบ series เต็ม**: เพิ่ม `calculateRSISeries()` ใน `sr-engine.ts` (คำนวณทุกแท่ง ไม่ใช่แค่ค่าล่าสุดแบบ `calculateRSI()` เดิม) สำหรับวาดเป็นเส้นกราฟ
  - **จุดตัด RSI=50**: รายการ "จุดตัด" ใต้กราฟ บอกวันที่ + ทิศทาง (ตัดขึ้น/ตัดลง) + ค่า RSI ตอนนั้นจริง
  - **Divergence**: เทียบราคาที่จุดสวิงสูง/ต่ำ 2 จุดล่าสุดกับค่า RSI ณ เวลาเดียวกันตรงๆ (นิยามมาตรฐาน ไม่ใช้จุดสวิงของ RSI เอง) — ราคาสูงใหม่+RSI อ่อนลง = Bearish, ราคาต่ำใหม่+RSI แข็งขึ้น = Bullish ขึ้น banner สีแดง/เขียวเมื่อเจอ ถ้าไม่เจอบอกตรงๆ ว่ายังไม่พบ ไม่เคยแต่งสัญญาณลอยๆ
  - Backend: `GET /api/trend-analysis/gold?tf=` (public, ข้อมูลชั้นเดียวกับ `/api/sr/gold`) ผ่านโค้ดใหม่ `src/lib/trend-analysis.ts` + `src/routes/trend-analysis.ts` — ดึงแท่งเทียนผ่าน `gold-refresh.ts` เดิมเสมอเหมือนทุก route ของทอง
  - กราฟราคา + กราฟ RSI เป็นสอง chart instance ของ Lightweight Charts ซิงค์ zoom/pan กันเอง (เพราะ v4.2.3 ที่ pin ไว้ยังไม่มี multi-pane ในตัว) — ต้อง fit เนื้อหาให้เสร็จทั้งคู่ก่อนค่อยผูก sync listener ไม่งั้น range ของ RSI chart (ข้อมูลสั้นกว่าเพราะ RSI ต้องใช้ 15 แท่งแรกไปคำนวณ) จะสะท้อนกลับไปตัด range เต็มของกราฟราคาให้แคบลง (เจอบั๊กนี้จริงระหว่างทดสอบ แก้โดยสลับลำดับ)
  - **✅ แก้ต้นตอแล้ว (ตามที่ตอบ "Ok cont.")**: root cause คือทุก route ของทอง (price.ts, sr.ts, gold-signal.ts, trend-analysis.ts — 4 ชุดโค้ดแยกกัน) เช็คแค่ `candles.length === 0` ถึงจะ backfill เต็มช่วง ถ้ามีแม้แต่แท่งเดียวอยู่แล้วจะถือว่า "ไม่ว่าง" แล้วสลับไป top-up แค่ 5 แท่งล่าสุดตลอดไป — D1 มีแท่งเทียนติดค้างอยู่ 8 แท่งมาตั้งแต่ก่อนมี pattern นี้ เลยไม่เคย "ว่างสนิท" พอจะ trigger backfill เต็มช่วงอีกเลย ค้างอยู่แค่ 8 แท่งตลอดมาโดยไม่มีใครสังเกต
    - รวม logic เป็นฟังก์ชันเดียว `getGoldCandles()` ใน `gold-refresh.ts` แทนที่โค้ดซ้ำ 4 จุด — เกณฑ์ใหม่คือ **น้อยกว่า 50 แท่ง = backfill เต็มช่วงใหม่** (ไม่ใช่แค่ "ว่างสนิท") ถ้า backfill ล้มเหลวแต่มีข้อมูลเดิมอยู่บ้าง (แม้ไม่พอ) จะ fallback ไปใช้ของเดิมแทนที่จะ error (ตาม philosophy best-effort เดิมของไฟล์นี้) — error จริงเฉพาะกรณีไม่มีข้อมูลอะไรเลยและ backfill ก็ล้มเหลวด้วย
    - ทดสอบยืนยันบน production แล้ว: D1 กลับมามี **150 แท่งเต็ม** ทันทีหลัง deploy, `/api/sr/gold?tf=D1` มี RSI+แนวรับ-ต้านจริง (ก่อนหน้านี้ไม่มีเพราะข้อมูลน้อยเกิน), `/api/signal/gold` timeframe D1 ให้สัญญาณจริงแล้ว (ก่อนหน้านี้คำนวณจากข้อมูลไม่พอ), timeframe อื่นที่เคยปกติอยู่แล้ว (M15/H1/H4/W1) ยังทำงานถูกต้องเหมือนเดิมไม่มี regression
    - **เจอเพิ่มระหว่างแก้ (คนละจุดแต่เกี่ยวข้องกัน)**: `chat-tools.ts`'s `get_gold_price`/`get_gold_support_resistance` (tool ของ AI Chat) เรียก `twelvedata.fetchLatestPrice`/`fetchTimeSeries` **ตรงๆ** มาตลอด ข้าม `gold-refresh.ts` ทั้งหมด — ไม่มี cache, ไม่มี cooldown, ไม่มี failure backoff เลย ทั้งที่เป็นบั๊กคลาสเดียวกับที่ทำโควตาพังไปก่อนหน้านี้ในวันเดียวกัน (ดู M1 ด้านบน) แก้แล้วให้เรียก `getCachedGoldPrice()`/`getGoldCandles()` เหมือน route อื่นทุกจุด — ยังไม่ได้ click-test จริงเพราะหน้า AI Chat ล็อกอินด้วยรหัสผ่าน admin (ไม่ควรให้ AI เป็นคนกรอกรหัสผ่านแทนเจ้าของ) แต่โค้ดเรียกฟังก์ชันชุดเดียวกับที่ทดสอบผ่าน route อื่นแล้วเป๊ะ — `get_stock_support_resistance` (หุ้นไทย ผ่าน Yahoo Finance) ไม่ได้แตะ เพราะหุ้นไม่มี quota รายวันจำกัดแบบทอง
  - ทดสอบยืนยันแล้วบน production ทุก timeframe + mobile: เส้นแนวโน้มขึ้นสมเหตุสมผลเทียบราคาจริง, จุดตัด RSI=50 ตรงกับกราฟ, ไม่มี console error
- ⬜ ยืนยัน Volume Profile กับข้อมูลจริง — Twelve Data มักไม่รายงาน volume จริงสำหรับทอง/CFD (เป็น OTC) ฟังก์ชัน `buildVolumeProfile` คืนค่า `undefined` ถ้าไม่มี volume ในแท่งเทียนเลย ต้องเช็คตอนมี API key แล้วว่า field `volume` มาจริงไหม
- ⬜ ~~Scalp Mode (poll ทุก 10-15 วิ)~~ — เลิกทำแนวคิดนี้แล้ว (2026-09-08) หลังเปลี่ยนราคาทองเป็น on-demand: ไม่มี "โหมด poll แบบ fixed interval" อีกต่อไป (ดูหัวข้อ M1 ด้านบน) ถ้าอยากได้ความถี่สูงขึ้นตอนมีคนเปิดแอปอยู่ ให้ลด `REFRESH_COOLDOWN_SECONDS` ใน `lib/gold-refresh.ts` แทน (ตอนนี้ 1800 วิ — ปรับขึ้นจาก 240 วิเดิมหลังชนโควตา ดูหัวข้อ M1 ด้านบน)

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
  index.ts          Hono app + scheduled handler (cron: ข่าวทุก 5 นาที, หุ้นไทยทุกชั่วโมง — ราคาทองไม่มี cron แล้ว ดึงแบบ on-demand ผ่าน gold-refresh.ts)
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
    signal.ts        GET /api/signal/gold — สัญญาณซื้อ-ขายทอง 5 timeframe (public, เหมือน sr.ts)
    trend-analysis.ts  GET /api/trend-analysis/gold?tf= — RSI series + เส้นแนวโน้มทแยง + จุดตัด + divergence (public, เหมือน sr.ts)
  lib/
    twelvedata.ts    Twelve Data API client (ทอง)
    gold-refresh.ts  On-demand ราคา+แท่งเทียนทอง เดียว (cache 300s + tail-refresh throttle 1800s/timeframe + failure backoff 60s) — ไม่มี cron แล้ว, ทุกจุดที่ต้องใช้ข้อมูลทองต้องผ่านไฟล์นี้ ห้ามเรียก twelvedata.ts ตรงๆ. `getGoldCandles()` คือจุดเดียวที่ควรเรียกจาก routes (แทน backfillGoldCandles/refreshGoldTail แยกกัน) — backfill เต็มช่วงใหม่ถ้าแท่งเทียนที่มีอยู่ < 50 แท่ง ไม่ใช่แค่ตอนว่างสนิท (แก้บั๊ก D1 ค้าง 8 แท่งตลอดกาล 2026-09-09)
    gold-signal.ts   คำนวณสัญญาณซื้อ-ขาย 5 timeframe — reuse สูตร 3-factor เดิมจาก zone-finder.ts
    yahoo-finance.ts Yahoo Finance unofficial client (หุ้นไทย, .BK) — ดู caveat ในไฟล์
    stock-symbols.ts Watchlist หุ้นไทย SET50 เต็มชุด (50 ตัว) + isValidSymbolFormat() (ไม่ผูก symbol นอก watchlist)
    screener.ts      Logic กรอง gainer/loser/near_support/breakout
    zone-finder.ts   Confluence checklist สำหรับ Admin Zone Finder (ทอง)
    sr-engine.ts     Pivot Points, Swing High/Low, EMA50/200, RSI(14) + calculateRSISeries, Volume Profile (no data for gold — no volume field), pickNearestLevels, findSwingPoints
    trend-analysis.ts  เส้นแนวโน้มทแยง (envelope-fit ผ่านจุดสวิงล่าสุด) + จุดตัด RSI=50 + divergence — ใช้โดย routes/trend-analysis.ts
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
  set-links.js       ปุ่ม/ลิงก์ icon ไปหน้าปันผล+ราคาย้อนหลังบน set.or.th ต่อ symbol — ใช้ร่วมกันทั้ง Screener และ Dashboard หุ้นไทย
  index.html/js      ทอง Dashboard — 3 แถว: สรุปทอง+สัญญาณซื้อ-ขาย (คู่กัน) / กราฟ (เต็มความกว้าง) / แนวสำคัญ tile grid (เต็มความกว้าง)
  trend-analysis.html/js  "RSI & แนวรับแนวต้าน" — กราฟราคา+เส้นแนวโน้มทแยง คู่กับกราฟ RSI(14)+เส้นแนวโน้มของมันเอง (2 chart ซิงค์ zoom/pan กัน) + จุดตัด RSI=50 + divergence, เลือก timeframe ได้
  news.html/js       ทอง ข่าว
  risk-calculator.*  ทอง คำนวณความเสี่ยง (client-side ล้วน)
  stock-dashboard.*  หุ้นไทย Dashboard
  screener.html/js   หุ้นไทย Screener
  admin/             login, zone-finder, watchlist, auto-trade, chat (+ common.js: auth guard/logout)
schema.sql           D1 schema
```
