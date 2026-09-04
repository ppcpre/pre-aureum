const priceEl = document.getElementById("price");
const updatedEl = document.getElementById("updated");
const srListEl = document.getElementById("sr-list");
const tfButtons = document.querySelectorAll("#tf-tabs button");

let currentTf = "H4";

function pendingBadge(message) {
  return `<span class="pending-badge"><span class="dot"></span>${message}</span>`;
}

async function loadPrice() {
  try {
    const res = await fetch("/api/price/gold");
    if (!res.ok) throw new Error("not configured");
    const data = await res.json();
    priceEl.textContent = data.price.toFixed(2);
    updatedEl.textContent = `อัปเดตล่าสุด ${new Date(data.ts * 1000).toLocaleTimeString("th-TH")}`;
  } catch {
    priceEl.textContent = "—";
    updatedEl.innerHTML = pendingBadge("รอเชื่อมต่อข้อมูลราคา (Twelve Data API key)");
  }
}

async function loadSR(tf) {
  srListEl.textContent = "กำลังโหลด…";
  try {
    const res = await fetch(`/api/sr/gold?tf=${tf}`);
    if (!res.ok) throw new Error("not configured");
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
    srListEl.innerHTML = pendingBadge("รอเชื่อมต่อข้อมูลราคา (Twelve Data API key)");
  }
}

tfButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tfButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTf = btn.dataset.tf;
    loadSR(currentTf);
  });
});

loadPrice();
loadSR(currentTf);
setInterval(loadPrice, 60_000);
