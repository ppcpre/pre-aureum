const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input-box");
const sendBtn = document.getElementById("send-btn");
const clearBtn = document.getElementById("clear-btn");

let history = []; // { role: "user"|"assistant", content: string }[] — mirrors server (chat_messages table)
let sending = false;

const AI_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
  <rect x="4" y="7" width="16" height="13" rx="5" stroke="oklch(0.75 0.14 85)" stroke-width="1.8"/>
  <circle cx="9" cy="13" r="1.4" fill="oklch(0.75 0.14 85)"/>
  <circle cx="15" cy="13" r="1.4" fill="oklch(0.75 0.14 85)"/>
  <path d="M9.5 16.3 Q12 18 14.5 16.3" stroke="oklch(0.75 0.14 85)" stroke-width="1.5" stroke-linecap="round" fill="none"/>
  <path d="M12 7 V4" stroke="oklch(0.75 0.14 85)" stroke-width="1.7" stroke-linecap="round"/>
  <circle cx="12" cy="3" r="1.2" fill="oklch(0.75 0.14 85)"/>
</svg>`;

const GREETING = "สวัสดีครับ ถามเรื่องราคาทอง แนวรับ-แนวต้าน หรือข่าวได้เลย — ผมจะเช็คข้อมูลจริงจากระบบก่อนตอบ";

function addMessage(role, text) {
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  if (role === "assistant") {
    row.innerHTML = `<span class="ai-avatar">${AI_ICON_SVG}</span>`;
  }

  const bubble = document.createElement("div");
  bubble.className = `msg ${role}`;
  bubble.textContent = text;
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

async function loadHistory() {
  try {
    const res = await fetch("/api/admin/chat/history");
    if (!res.ok) throw new Error("failed");
    const data = await res.json();

    if (!data.messages || data.messages.length === 0) {
      addMessage("assistant", GREETING);
      return;
    }

    history = data.messages.map((m) => ({ role: m.role, content: m.content }));
    for (const m of data.messages) addMessage(m.role, m.content);
  } catch {
    addMessage("assistant", GREETING);
  }
}

async function send() {
  const text = inputEl.value.trim();
  if (!text || sending) return;

  sending = true;
  sendBtn.disabled = true;
  inputEl.value = "";
  addMessage("user", text);

  const thinking = createThinkingCard();
  let assistantText = "";
  let assistantBubbleShown = false;

  try {
    const res = await fetch("/api/admin/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history }),
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
            history.push({ role: "user", content: text }, { role: "assistant", content: assistantText });
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
  addMessage("assistant", GREETING);
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

guardAdminAuth().then((ok) => {
  if (ok) loadHistory();
});
inputEl.focus();
