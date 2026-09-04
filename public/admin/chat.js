const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input-box");
const sendBtn = document.getElementById("send-btn");

let history = []; // { role: "user"|"assistant", content: string }[]
let sending = false;

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function addToolIndicator(label) {
  const el = document.createElement("div");
  el.className = "tool-indicator";
  el.innerHTML = `<span class="spin"></span><span>${label}</span>`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

async function send() {
  const text = inputEl.value.trim();
  if (!text || sending) return;

  sending = true;
  sendBtn.disabled = true;
  inputEl.value = "";
  addMessage("user", text);

  let assistantEl = null;
  let assistantText = "";
  let toolIndicatorEl = null;

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

        if (event.type === "text") {
          if (toolIndicatorEl) {
            toolIndicatorEl.remove();
            toolIndicatorEl = null;
          }
          if (!assistantEl) assistantEl = addMessage("assistant", "");
          assistantText += event.text;
          assistantEl.textContent = assistantText;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        } else if (event.type === "tool_call") {
          toolIndicatorEl = addToolIndicator(event.label ?? event.tool);
        } else if (event.type === "tool_result") {
          if (toolIndicatorEl) {
            toolIndicatorEl.remove();
            toolIndicatorEl = null;
          }
        } else if (event.type === "error") {
          if (toolIndicatorEl) toolIndicatorEl.remove();
          const friendly = /api ?key|authentication/i.test(event.message)
            ? "รอเชื่อมต่อ Claude — ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY"
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
    if (toolIndicatorEl) toolIndicatorEl.remove();
    addMessage("assistant", "⚠️ เกิดข้อผิดพลาด ลองส่งใหม่อีกครั้ง");
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

// --- Usage panel ---
const usageToggle = document.getElementById("usage-toggle");
const usagePanel = document.getElementById("usage-panel");

async function loadUsage() {
  try {
    const res = await fetch("/api/admin/chat/usage");
    const data = await res.json();
    document.getElementById("usage-today-cost").textContent = `$${data.today.estimatedCostUsd.toFixed(4)}`;
    document.getElementById("usage-today-count").textContent = data.today.messageCount;
    document.getElementById("usage-today-input").textContent = data.today.inputTokens.toLocaleString();
    document.getElementById("usage-today-output").textContent = data.today.outputTokens.toLocaleString();
    document.getElementById("usage-all-cost").textContent = `$${data.allTime.estimatedCostUsd.toFixed(4)}`;
    document.getElementById("usage-all-count").textContent = data.allTime.messageCount;
  } catch {
    // Silently ignore — usage panel is a nice-to-have, not core chat function.
  }
}

usageToggle.addEventListener("click", () => {
  usagePanel.classList.toggle("open");
  if (usagePanel.classList.contains("open")) loadUsage();
});

guardAdminAuth();
inputEl.focus();
