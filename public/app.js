const priceEl = document.getElementById("price");
const updatedEl = document.getElementById("updated");
const srListEl = document.getElementById("sr-list");
const tfButtons = document.querySelectorAll("#tf-tabs button");

let currentTf = "H4";

async function loadPrice() {
  try {
    const res = await fetch("/api/price/gold");
    const data = await res.json();
    priceEl.textContent = data.price.toFixed(2);
    updatedEl.textContent = `อัปเดตล่าสุด ${new Date(data.ts * 1000).toLocaleTimeString("th-TH")}`;
  } catch (err) {
    updatedEl.textContent = "โหลดราคาไม่สำเร็จ — เช็คว่าตั้งค่า TWELVEDATA_API_KEY แล้วหรือยัง";
  }
}

async function loadSR(tf) {
  srListEl.textContent = "กำลังโหลด…";
  try {
    const res = await fetch(`/api/sr/gold?tf=${tf}`);
    const data = await res.json();

    if (!data.levels || data.levels.length === 0) {
      srListEl.textContent = "ยังไม่พบแนวรับ-แนวต้าน (ข้อมูลย้อนหลังอาจยังน้อยเกินไป)";
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
  } catch (err) {
    srListEl.textContent = "โหลดแนวรับ-แนวต้านไม่สำเร็จ";
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
