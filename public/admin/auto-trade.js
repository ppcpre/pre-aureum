async function loadAutoTradeStatus() {
  const bodyEl = document.getElementById("auto-trade-body");
  const res = await fetch("/api/admin/auto-trade/status");

  if (res.status === 401) {
    window.location.href = "/admin/login";
    return;
  }

  const data = await res.json();

  if (!data.implemented) {
    bodyEl.innerHTML = `<span class="pending-badge"><span class="dot"></span>${data.note ?? "ยังไม่เปิดใช้งาน"}</span>`;
    return;
  }

  bodyEl.textContent = JSON.stringify(data, null, 2);
}

guardAdminAuth().then((ok) => {
  if (ok) loadAutoTradeStatus();
});
