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
            <div class="muted">${item.source} · ${time}</div>
            <div class="news-title"><a href="${item.url}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></div>
            ${item.summary ? `<div class="news-summary">${escapeHtml(item.summary)}</div>` : ""}
          </div>`;
      })
      .join("");
  } catch {
    listEl.innerHTML = `<span class="pending-badge"><span class="dot"></span>โหลดข่าวไม่สำเร็จ ลองรีเฟรชอีกครั้ง</span>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

loadNews();
