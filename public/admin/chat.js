const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input-box");
const sendBtn = document.getElementById("send-btn");
const clearBtn = document.getElementById("clear-btn");
const attachBtn = document.getElementById("attach-btn");
const attachInputEl = document.getElementById("attach-input");
const attachmentRowEl = document.getElementById("attachment-row");

let history = []; // { role: "user"|"assistant", content: string }[] — mirrors server (chat_messages table)
let sending = false;
let pendingAttachments = []; // { type: "image"|"text", name, dataUrl?, content?, previewUrl? }[] — cleared after each send

// Mirrors the server's own limits (routes/chat.ts) — checked client-side too
// so a bad file is rejected instantly instead of round-tripping first.
const MAX_ATTACHMENTS = 3;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 50_000;

const AI_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
  <rect x="4" y="7" width="16" height="13" rx="5" stroke="oklch(0.75 0.14 85)" stroke-width="1.8"/>
  <circle cx="9" cy="13" r="1.4" fill="oklch(0.75 0.14 85)"/>
  <circle cx="15" cy="13" r="1.4" fill="oklch(0.75 0.14 85)"/>
  <path d="M9.5 16.3 Q12 18 14.5 16.3" stroke="oklch(0.75 0.14 85)" stroke-width="1.5" stroke-linecap="round" fill="none"/>
  <path d="M12 7 V4" stroke="oklch(0.75 0.14 85)" stroke-width="1.7" stroke-linecap="round"/>
  <circle cx="12" cy="3" r="1.2" fill="oklch(0.75 0.14 85)"/>
</svg>`;

const GREETING = "สวัสดีครับ ถามเรื่องราคาทอง แนวรับ-แนวต้าน หรือข่าวได้เลย — ผมจะเช็คข้อมูลจริงจากระบบก่อนตอบ";

const SENTIMENT_LABEL = { bull: "โทนข่าว: ขาขึ้น", bear: "โทนข่าว: ขาลง", neutral: "โทนข่าว: เป็นกลาง" };
const TAG_LABEL = { resistance: "ทะลุแนวต้าน", support: "ใกล้แนวรับ", gainer: "พุ่งแรง", loser: "ร่วงแรง" };

const FILE_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`;

function addMessage(role, text, attachments) {
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  if (role === "assistant") {
    row.innerHTML = `<span class="ai-avatar">${AI_ICON_SVG}</span>`;
  }

  const bubble = document.createElement("div");
  bubble.className = `msg ${role}`;

  if (attachments && attachments.length > 0) {
    const attachEl = document.createElement("div");
    attachEl.className = "msg-attachments";
    attachEl.innerHTML = attachments
      .map((a) =>
        a.type === "image"
          ? `<img src="${a.previewUrl || a.dataUrl}" alt="${a.name}">`
          : `<span class="file-pill">${FILE_ICON_SVG}${a.name}</span>`
      )
      .join("");
    bubble.appendChild(attachEl);
  }

  const textEl = document.createElement("div");
  textEl.textContent = text;
  bubble.appendChild(textEl);
  row.appendChild(bubble);

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

/** The "thinking" card: cute bobbing avatar + label + a soft progress bar + a real elapsed-seconds counter. */
function createThinkingCard() {
  const row = document.createElement("div");
  row.className = "msg-row assistant";
  row.innerHTML = `
    <span class="ai-avatar thinking">${AI_ICON_SVG}</span>
    <div class="thinking-card">
      <div class="thinking-top">
        <span class="thinking-label">กำลังคิด…</span>
        <span class="thinking-seconds">0 วิ</span>
      </div>
      <div class="thinking-track"><div class="thinking-fill"></div></div>
    </div>`;
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const labelEl = row.querySelector(".thinking-label");
  const secondsEl = row.querySelector(".thinking-seconds");
  const fillEl = row.querySelector(".thinking-fill");

  const startedAt = Date.now();
  let boostPct = 0; // bumped by real tool_call/tool_result events
  const timer = setInterval(() => {
    const elapsedSec = (Date.now() - startedAt) / 1000;
    secondsEl.textContent = `${elapsedSec.toFixed(1)} วิ`;
    // Smooth asymptotic trickle toward ~90%, nudged along by real progress (boostPct).
    const trickle = 90 * (1 - Math.exp(-elapsedSec / 4));
    fillEl.style.width = `${Math.min(96, Math.max(trickle, boostPct))}%`;
  }, 100);

  return {
    setLabel(text) {
      labelEl.textContent = text;
      boostPct = Math.min(92, boostPct + 14); // real signal: a tool call actually happened
    },
    finish() {
      clearInterval(timer);
      row.remove();
    },
  };
}

/**
 * Renders the AI's daily digest (gold + interesting Thai stocks) as the
 * opening message of a fresh conversation — reuses the same
 * /api/dashboard-summary the Dashboard card already calls, so there's no
 * separate digest engine to keep in sync. Purely a display concern: this
 * card is never pushed into `history`, so it never reaches the model as
 * conversation context.
 */
function renderDigestCard(data) {
  const row = document.createElement("div");
  row.className = "msg-row assistant";

  const ts = new Date(data.generatedAt * 1000);
  const dateStr = ts.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "short" });
  const timeStr = ts.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

  const goldHtml = data.gold.available
    ? `<p class="digest-sub">${data.gold.narrative}</p>`
    : `<p class="digest-sub pending">${data.gold.reason}</p>`;

  const stocksHtml =
    data.stocks.length > 0
      ? `
        <div class="digest-section-title">หุ้นไทยที่น่าสนใจ</div>
        <div class="digest-list">
          ${data.stocks
            .map(
              (s) => `
            <div class="digest-row">
              <span class="sym mono">${s.symbol}</span>
              <span class="note">${s.note}</span>
              <span class="tag ${s.tag}">${TAG_LABEL[s.tag] ?? s.tag}</span>
            </div>`
            )
            .join("")}
        </div>`
      : "";

  const chipDefs = [
    ...data.stocks.slice(0, 2).map((s) => ({ label: `ขยายความเรื่อง ${s.symbol}`, prompt: `ขยายความเรื่อง ${s.symbol} หน่อย` })),
    ...(data.gold.available ? [{ label: "แนวรับ-ต้านทองตอนนี้", prompt: "แนวรับ-แนวต้านทองตอนนี้เท่าไหร่" }] : []),
  ];
  const chipsHtml =
    chipDefs.length > 0
      ? `<div class="digest-chips">${chipDefs.map((c) => `<span class="digest-chip" data-prompt="${c.prompt}">${c.label}</span>`).join("")}</div>`
      : "";

  row.innerHTML = `
    <span class="ai-avatar">${AI_ICON_SVG}</span>
    <div class="digest-card">
      <div class="digest-head"><strong>สรุปประจำวัน</strong><span>${dateStr} · ${timeStr}</span></div>
      ${goldHtml}
      ${stocksHtml}
      ${chipsHtml}
    </div>`;

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  row.querySelectorAll(".digest-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (sending) return;
      inputEl.value = chip.dataset.prompt;
      send();
    });
  });
}

/**
 * Shows the daily digest if there's real data to show; falls back to the
 * plain greeting otherwise. On a cache miss /api/dashboard-summary makes a
 * real Workers AI call and can take 15-20s — show the same "thinking" card
 * used for live chat replies instead of leaving the page blank while it loads.
 */
async function showOpeningMessage() {
  const loading = createThinkingCard();
  loading.setLabel("กำลังเตรียมสรุปประจำวัน…");
  try {
    const res = await fetch("/api/dashboard-summary");
    if (res.ok) {
      const data = await res.json();
      if (data.gold?.available || (data.stocks && data.stocks.length > 0)) {
        loading.finish();
        renderDigestCard(data);
        return;
      }
    }
  } catch {
    // fall through to the plain greeting below
  }
  loading.finish();
  addMessage("assistant", GREETING);
}

async function loadHistory() {
  try {
    const res = await fetch("/api/admin/chat/history");
    if (!res.ok) throw new Error("failed");
    const data = await res.json();

    if (!data.messages || data.messages.length === 0) {
      await showOpeningMessage();
      return;
    }

    history = data.messages.map((m) => ({ role: m.role, content: m.content }));
    for (const m of data.messages) addMessage(m.role, m.content);
  } catch {
    await showOpeningMessage();
  }
}

// --- Attachments ---

function renderAttachmentRow() {
  attachmentRowEl.innerHTML = pendingAttachments
    .map(
      (a, i) => `
      <span class="attachment-chip">
        ${a.type === "image" ? `<img src="${a.previewUrl}" alt="">` : `<span class="file-icon">${FILE_ICON_SVG}</span>`}
        <span class="name">${a.name}</span>
        <button class="remove" type="button" data-i="${i}" aria-label="เอาออก">×</button>
      </span>`
    )
    .join("");
  attachmentRowEl.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      pendingAttachments.splice(Number(btn.dataset.i), 1);
      renderAttachmentRow();
    });
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function handleFilesSelected(fileList) {
  for (const file of Array.from(fileList)) {
    if (pendingAttachments.length >= MAX_ATTACHMENTS) {
      alert(`แนบไฟล์ได้สูงสุด ${MAX_ATTACHMENTS} ไฟล์ต่อข้อความ`);
      break;
    }
    const isImage = file.type.startsWith("image/");
    const isText = /\.(txt|md)$/i.test(file.name);

    if (isImage) {
      if (file.size > MAX_IMAGE_BYTES) {
        alert(`รูป "${file.name}" ใหญ่เกินไป (จำกัดไม่เกิน 4MB/รูป)`);
        continue;
      }
      const dataUrl = await readFileAsDataUrl(file);
      pendingAttachments.push({ type: "image", name: file.name, dataUrl, previewUrl: dataUrl });
    } else if (isText) {
      const content = await readFileAsText(file);
      if (content.length > MAX_TEXT_CHARS) {
        alert(`ไฟล์ "${file.name}" ยาวเกินไป (จำกัดไม่เกิน ${MAX_TEXT_CHARS.toLocaleString()} ตัวอักษร)`);
        continue;
      }
      pendingAttachments.push({ type: "text", name: file.name, content });
    } else {
      alert(`ไม่รองรับไฟล์ "${file.name}" — แนบได้แค่รูปภาพ หรือไฟล์ข้อความ (.txt/.md)`);
    }
  }
  renderAttachmentRow();
}

attachBtn.addEventListener("click", () => attachInputEl.click());
attachInputEl.addEventListener("change", () => {
  if (attachInputEl.files.length > 0) handleFilesSelected(attachInputEl.files);
  attachInputEl.value = ""; // allow re-selecting the same file later
});

async function send() {
  const text = inputEl.value.trim();
  if ((!text && pendingAttachments.length === 0) || sending) return;

  sending = true;
  sendBtn.disabled = true;
  inputEl.value = "";
  const attachmentsForThisMessage = pendingAttachments;
  pendingAttachments = [];
  renderAttachmentRow();
  addMessage("user", text, attachmentsForThisMessage);

  const thinking = createThinkingCard();
  let assistantText = "";
  let assistantBubbleShown = false;

  try {
    const res = await fetch("/api/admin/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        history,
        attachments: attachmentsForThisMessage.map((a) =>
          a.type === "image" ? { type: "image", name: a.name, dataUrl: a.dataUrl } : { type: "text", name: a.name, content: a.content }
        ),
      }),
    });

    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    if (!res.body) throw new Error("no response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? ""; // last (possibly incomplete) frame stays buffered

      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const event = JSON.parse(line.slice("data: ".length));

        if (event.type === "tool_call") {
          thinking.setLabel(event.label ?? event.tool);
        } else if (event.type === "text") {
          thinking.finish();
          assistantText = event.text;
          addMessage("assistant", assistantText);
          assistantBubbleShown = true;
        } else if (event.type === "error") {
          thinking.finish();
          const friendly = /neuron|quota|rate.?limit/i.test(event.message)
            ? "ถึงโควตา Workers AI ฟรีของวันนี้แล้ว ลองใหม่พรุ่งนี้ (หรือรอสักครู่แล้วลองอีกครั้ง)"
            : event.message;
          addMessage("assistant", `⚠️ ${friendly}`);
        } else if (event.type === "done") {
          if (assistantText) {
            const attachmentNote =
              attachmentsForThisMessage.length > 0 ? "\n\n" + attachmentsForThisMessage.map((a) => `📎 ${a.name}`).join("\n") : "";
            history.push({ role: "user", content: text + attachmentNote }, { role: "assistant", content: assistantText });
          }
        }
      }
    }
  } catch (err) {
    thinking.finish();
    if (!assistantBubbleShown) addMessage("assistant", "⚠️ เกิดข้อผิดพลาด ลองส่งใหม่อีกครั้ง");
  } finally {
    sending = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

sendBtn.addEventListener("click", send);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

clearBtn.addEventListener("click", async () => {
  if (sending) return;
  clearBtn.disabled = true;
  try {
    await fetch("/api/admin/chat/history", { method: "DELETE" });
  } catch {
    // best-effort — clear the visible chat either way
  }
  history = [];
  messagesEl.innerHTML = "";
  await showOpeningMessage();
  clearBtn.disabled = false;
});

// --- Usage panel ---
const usageToggle = document.getElementById("usage-toggle");
const usagePanel = document.getElementById("usage-panel");

async function loadUsage() {
  try {
    const res = await fetch("/api/admin/chat/usage");
    const data = await res.json();
    document.getElementById("usage-today-count").textContent = `${data.messagesToday} / ${data.dailyMessageLimit}`;
    document.getElementById("usage-today-input").textContent = data.today.promptTokens.toLocaleString();
    document.getElementById("usage-today-output").textContent = data.today.completionTokens.toLocaleString();
    document.getElementById("usage-all-count").textContent = data.allTime.messageCount;
    document.getElementById("usage-all-tokens").textContent = (
      data.allTime.promptTokens + data.allTime.completionTokens
    ).toLocaleString();
  } catch {
    // Silently ignore — usage panel is a nice-to-have, not core chat function.
  }
}

usageToggle.addEventListener("click", () => {
  usagePanel.classList.toggle("open");
  if (usagePanel.classList.contains("open")) loadUsage();
});

guardAdminAuth().then(async (ok) => {
  if (!ok) return;
  await loadHistory();

  // Deep link from the Dashboard card's chips (/admin/chat?q=...) — ask it right away.
  const q = new URLSearchParams(window.location.search).get("q");
  if (q) {
    window.history.replaceState({}, "", window.location.pathname); // don't re-send on reload
    inputEl.value = q;
    send();
  }
});
inputEl.focus();
