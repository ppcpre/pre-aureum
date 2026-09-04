const STATUS_ICON = { pass: "✓", fail: "✗", pending: "…" };

async function loadZoneFinder() {
  const res = await fetch("/api/admin/zone-finder/gold");

  if (res.status === 401) {
    window.location.href = "/admin/login";
    return;
  }

  const data = await res.json();

  if (!res.ok) {
    const biasEl = document.getElementById("bias");
    biasEl.textContent = "รอข้อมูล";
    biasEl.className = "bias-badge neutral";
    document.getElementById("score").innerHTML =
      `<span class="pending-badge"><span class="dot"></span>รอเชื่อมต่อข้อมูลราคา (Twelve Data API key)</span>`;
    document.getElementById("checklist").innerHTML =
      `<span class="pending-badge"><span class="dot"></span>เช็คลิสต์จะคำนวณได้เมื่อมีข้อมูลราคาแล้ว</span>`;
    document.getElementById("zones").innerHTML = `
      <div class="zone-tile"><div class="zone-label">โซนเข้าซื้อ</div><div class="zone-value muted">—</div></div>
      <div class="zone-tile"><div class="zone-label">โซนตัดขาดทุน</div><div class="zone-value muted">—</div></div>
      <div class="zone-tile"><div class="zone-label">โซนเป้าหมาย</div><div class="zone-value muted">—</div></div>
    `;
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

guardAdminAuth().then((ok) => {
  if (ok) loadZoneFinder();
});
