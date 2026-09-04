async function loadNews() {
  const listEl = document.getElementById("news-list");
  try {
    const res = await fetch("/api/news?limit=20");
    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      listEl.innerHTML = `<span class="pending-badge"><span class="dot"></span>ยังไม่มีข่าว — cron จะดึงข่าวรอบถัดไปภายใน 5 นาที</span>`;
      return;
    }

    listEl.innerHTML = data.items
      .map((item) => {
        const time = new Date(item.published_at * 1000).toLocaleString("th-TH", {
          dateStyle: "short",
          timeStyle: "short",
        });
        return `
          <div class="news-item">
            <div class="muted" style="display:flex; align-items:center; gap:8px;">
              ${sentimentDot(item.sentiment)}
              ${item.source} · ${time}
              ${impactTag(item.impact)}
            </div>
            <div class="news-title"><a href="${item.url}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></div>
            ${item.summary ? `<div class="news-summary">${escapeHtml(item.summary)}</div>` : ""}
          </div>`;
      })
      .join("");
  } catch {
    listEl.innerHTML = `<span class="pending-badge"><span class="dot"></span>โหลดข่าวไม่สำเร็จ ลองรีเฟรชอีกครั้ง</span>`;
  }
}

const SENTIMENT_COLOR = {
  positive: "oklch(0.72 0.15 150)",
  negative: "oklch(0.65 0.18 25)",
  neutral: "oklch(0.55 0.01 250)",
};

function sentimentDot(sentiment) {
  if (!sentiment) return `<span style="width:6px;height:6px;border-radius:50%;background:oklch(0.29 0.008 250);display:inline-block;" title="ยังไม่ได้วิเคราะห์"></span>`;
  const color = SENTIMENT_COLOR[sentiment] ?? SENTIMENT_COLOR.neutral;
  return `<span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block;" title="${sentiment}"></span>`;
}

const IMPACT_LABEL = { high: "Impact สูง", medium: "Impact กลาง", low: "Impact ต่ำ" };
const IMPACT_COLOR = {
  high: "oklch(0.65 0.18 25)",
  medium: "oklch(0.78 0.15 70)",
  low: "oklch(0.55 0.01 250)",
};

function impactTag(impact) {
  if (!impact) return "";
  const color = IMPACT_COLOR[impact] ?? IMPACT_COLOR.low;
  return `<span style="font-size:10.5px; font-weight:700; color:${color}; background:${color.replace(")", " / 0.14)")}; padding:2px 8px; border-radius:4px; margin-left:auto;">${IMPACT_LABEL[impact]}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

loadNews();
