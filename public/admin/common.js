async function guardAdminAuth() {
  const res = await fetch("/api/admin/me");
  const data = await res.json();
  if (!data.authenticated) {
    window.location.href = "/admin/login";
    return false;
  }
  return true;
}

function wireLogout() {
  const btn = document.getElementById("logout");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  });
}

wireLogout();
