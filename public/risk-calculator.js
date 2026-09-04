const inputs = ["balance", "riskPct", "entry", "stop", "target"].map((id) => document.getElementById(id));
const resultsEl = document.getElementById("results");

function calculate() {
  const [balance, riskPct, entry, stop, target] = inputs.map((el) => Number(el.value));

  if (![balance, riskPct, entry, stop, target].every(Number.isFinite) || entry === stop) {
    resultsEl.innerHTML = `<span class="pending-badge"><span class="dot"></span>กรอกตัวเลขให้ครบ (Entry ต้องไม่เท่ากับ Stop Loss)</span>`;
    return;
  }

  const riskAmount = balance * (riskPct / 100);
  const distToStop = Math.abs(entry - stop);
  const distToTarget = Math.abs(target - entry);

  const positionOz = riskAmount / distToStop;
  const positionLots = positionOz / 100; // 1 standard XAU/USD lot ≈ 100 oz
  const rewardAmount = positionOz * distToTarget;
  const rr = distToTarget / distToStop;

  resultsEl.innerHTML = `
    <div class="result-row"><span class="muted">ขนาดโพซิชันที่แนะนำ</span><span class="result-value">${positionLots.toFixed(2)} lot (≈ ${positionOz.toFixed(1)} oz)</span></div>
    <div class="result-row"><span class="muted">Risk : Reward</span><span class="result-value" style="color:oklch(0.75 0.14 85);">1 : ${rr.toFixed(2)}</span></div>
    <div class="result-row"><span class="muted">จำนวนเงินที่เสี่ยง</span><span class="result-value" style="color:oklch(0.65 0.18 25);">-$${riskAmount.toFixed(2)}</span></div>
    <div class="result-row"><span class="muted">กำไรที่เป็นไปได้</span><span class="result-value" style="color:oklch(0.72 0.15 150);">+$${rewardAmount.toFixed(2)}</span></div>
  `;
}

inputs.forEach((el) => el.addEventListener("input", calculate));
calculate();
