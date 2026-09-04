const STATUS_ICON = { pass: "✓", fail: "✗", pending: "…" };

async function guardAuth() {
  const res = await fetch("/api/admin/me");
  const data = await res.json();
  if (!data.authenticated) {
    window.location.href = "/admin/login";
    return false;
  }
  return true;
}

async function loadZoneFinder() {
  const res = await fetch("/api/admin/zone-finder/gold");

  if (res.status === 401) {
    window.location.href = "/admin/login";
    return;
  }

  const data = await res.json();

  if (!res.ok) {
    document.getElementById("bias").textContent = "โหลดข้อมูลไม่สำเร็จ";
    document.getElementById("score").textContent = data.message ?? "";
    document.getElementById("checklist").textContent =
      "มักเกิดจากยังไม่ได้ตั้งค่า TWELVEDATA_API_KEY";
    return;
  }

  const biasEl = document.getElementById("bias");
  biasEl.textContent = { bullish: "Bullish", bearish: "Bearish", neutral: "Neutral" }[data.bias];
  biasEl.className = `bias-badge ${data.bias}`;
  document.getElementById("score").textContent =
    `คะแนน ${data.biasScore}/100 · ราคาปัจจุบัน ${data.currentPrice.toFixed(2)}`;

  document.getElementById("checklist").innerHTML = data.checklist
    .map(
      (item) => `
      <div class="checklist-item status-${item.status}">
        <span class="status-icon">${STATUS_ICON[item.status]}</span>
        <div>
          <div>${item.label}</div>
          <div class="muted">${item.detail}</div>
        </div>
      </div>`
    )
    .join("");

  document.getElementById("zones").innerHTML = `
    <div class="zone-tile"><div class="zone-label">โซนเข้าซื้อ</div>
      <div class="zone-value">${data.entryZone ? `${data.entryZone.from.toFixed(2)} – ${data.entryZone.to.toFixed(2)}` : "—"}</div></div>
    <div class="zone-tile"><div class="zone-label">โซนตัดขาดทุน</div>
      <div class="zone-value">${data.stopZone ? `< ${data.stopZone.toFixed(2)}` : "—"}</div></div>
    <div class="zone-tile"><div class="zone-label">โซนเป้าหมาย</div>
      <div class="zone-value">${data.targetZone ? data.targetZone.toFixed(2) : "—"}</div></div>
  `;
}

document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  window.location.href = "/admin/login";
});

guardAuth().then((ok) => {
  if (ok) loadZoneFinder();
});
