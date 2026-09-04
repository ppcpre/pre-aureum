const tabsEl = document.getElementById("symbol-tabs");
const symbolLabelEl = document.getElementById("symbol-label");
const priceEl = document.getElementById("price");
const updatedEl = document.getElementById("updated");
const srListEl = document.getElementById("sr-list");

let currentSymbol = null;

function pendingBadge(message) {
  return `<span class="pending-badge"><span class="dot"></span>${message}</span>`;
}

async function loadSymbol(symbol) {
  currentSymbol = symbol;
  priceEl.textContent = "–";
  updatedEl.textContent = "กำลังโหลด…";
  srListEl.textContent = "กำลังโหลด…";

  try {
    const res = await fetch(`/api/price/stock/${symbol}`);
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    priceEl.textContent = data.price.toFixed(2);
    updatedEl.textContent = `อัปเดตล่าสุด ${new Date(data.ts * 1000).toLocaleTimeString("th-TH")}`;
  } catch {
    updatedEl.innerHTML = pendingBadge("โหลดราคาไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
  }

  try {
    const res = await fetch(`/api/sr/stock/${symbol}?tf=D1`);
    if (!res.ok) throw new Error("failed");
    const data = await res.json();

    if (!data.levels || data.levels.length === 0) {
      srListEl.innerHTML = pendingBadge("ยังไม่มีแนวรับ-แนวต้าน (ข้อมูลย้อนหลังยังน้อยเกินไป)");
      return;
    }

    srListEl.innerHTML = data.levels
      .sort((a, b) => b.price - a.price)
      .map(
        (lvl) => `
        <div class="sr-row ${lvl.type}">
          <div>
            <div class="mono" style="font-weight:700;">${lvl.price.toFixed(2)}</div>
            <div class="muted">${lvl.methods.join(" + ")}</div>
          </div>
          <span class="tag ${lvl.type}">${lvl.type === "resistance" ? "แนวต้าน" : "แนวรับ"}</span>
        </div>`
      )
      .join("");
  } catch {
    srListEl.innerHTML = pendingBadge("โหลดแนวรับ-แนวต้านไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
  }
}

async function init() {
  const res = await fetch("/api/price/stock/");
  const data = await res.json();

  tabsEl.innerHTML = data.items
    .map((s, i) => `<button data-symbol="${s.symbol}" class="${i === 0 ? "active" : ""}">${s.symbol}</button>`)
    .join("");

  tabsEl.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabsEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const item = data.items.find((s) => s.symbol === btn.dataset.symbol);
      symbolLabelEl.textContent = `${item.symbol} · ${item.name}`;
      loadSymbol(item.symbol);
    });
  });

  if (data.items.length > 0) {
    symbolLabelEl.textContent = `${data.items[0].symbol} · ${data.items[0].name}`;
    loadSymbol(data.items[0].symbol);
  }
}

init();
