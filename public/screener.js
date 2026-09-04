const SIGNAL_LABEL = {
  gainer: "พุ่งขึ้นแรง",
  loser: "ร่วงแรง",
  near_support: "ใกล้แนวรับ",
  breakout_resistance: "ทะลุแนวต้าน",
  normal: "ปกติ",
};

let rows = [];
let activeFilter = "all";

function render() {
  const filtered = activeFilter === "all" ? rows : rows.filter((r) => r.signal === activeFilter);
  const tbody = document.getElementById("rows");

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><span class="pending-badge"><span class="dot"></span>ไม่มีหุ้นที่เข้าเงื่อนไขนี้ตอนนี้</span></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (r) => `
      <tr>
        <td><b>${r.symbol}</b> <span class="muted">${r.name}</span></td>
        <td class="mono">${r.price.toFixed(2)}</td>
        <td class="mono" style="color:${r.changePct >= 0 ? "oklch(0.72 0.15 150)" : "oklch(0.65 0.18 25)"}; font-weight:700;">
          ${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%
        </td>
        <td class="mono muted">${r.nearestSupport?.toFixed(2) ?? "—"}</td>
        <td class="mono muted">${r.nearestResistance?.toFixed(2) ?? "—"}</td>
        <td><span class="signal-tag signal-${r.signal}">${SIGNAL_LABEL[r.signal]}</span></td>
      </tr>`
    )
    .join("");
}

document.getElementById("filters").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  activeFilter = btn.dataset.filter;
  render();
});

async function init() {
  try {
    const res = await fetch("/api/screener/stock");
    const data = await res.json();
    rows = data.items ?? [];
    render();
  } catch {
    document.getElementById("rows").innerHTML =
      `<tr><td colspan="6"><span class="pending-badge"><span class="dot"></span>โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง</span></td></tr>`;
  }
}

init();
