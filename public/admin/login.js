document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("password").value;
  const errorEl = document.getElementById("error");
  errorEl.style.display = "none";

  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (res.ok) {
    window.location.href = "/admin/zone-finder";
  } else {
    errorEl.style.display = "block";
  }
});
