// Floating "AI Chat" button — links to /admin/chat. Included on every page
// except /admin/chat itself (redundant there) and /admin/login (transient
// auth gate) as a persistent shortcut into the AI Chat, mirroring how the
// sidebar already links to /admin/* without hiding it from non-admin
// visitors (they just hit the login screen, same as clicking the sidebar's
// Admin section today).
(function () {
  const fab = document.createElement("a");
  fab.href = "/admin/chat";
  fab.className = "chat-fab";
  fab.setAttribute("aria-label", "เปิด AI Chat");
  fab.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  document.body.appendChild(fab);
})();
