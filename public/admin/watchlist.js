async function loadWatchlist() {
  const bodyEl = document.getElementById("watchlist-body");
  const res = await fetch("/api/admin/watchlist");

  if (res.status === 401) {
    window.location.href = "/admin/login";
    return;
  }

  const data = await res.json();

  if (!data.items || data.items.length === 0) {
    bodyEl.innerHTML = `<span class="pending-badge"><span class="dot"></span>${data.note ?? "ยังไม่มีข้อมูล"}</span>`;
    return;
  }

  // Once M6 picks a data source, render real rows here.
  bodyEl.textContent = JSON.stringify(data.items, null, 2);
}

guardAdminAuth().then((ok) => {
  if (ok) loadWatchlist();
});
