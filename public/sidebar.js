const ICONS = {
  chart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 V10 M10 20 V4 M16 20 V14 M22 20 H2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  news: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M7.5 9H16.5 M7.5 12.5H16.5 M7.5 16H13"/></svg>',
  calc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6H16"/><circle cx="8.5" cy="11" r="0.9" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r="0.9" fill="currentColor" stroke="none"/><circle cx="15.5" cy="11" r="0.9" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15" r="0.9" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="0.9" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15" r="0.9" fill="currentColor" stroke="none"/></svg>',
  filter: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4H20L14 12V19L10 21V12L4 4Z" stroke-linejoin="round"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8 V13 M12 16h.01" stroke-linecap="round"/></svg>',
  bookmark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  bolt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" stroke-linejoin="round"/></svg>',
  lock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11 V7a4 4 0 0 1 8 0v4"/></svg>',
};

const GOLD_NAV = [
  { id: "gold-dashboard", href: "/", label: "Dashboard", icon: "chart" },
  { id: "gold-news", href: "/news", label: "ข่าว", icon: "news" },
  { id: "gold-risk", href: "/risk-calculator", label: "คำนวณความเสี่ยง", icon: "calc" },
];

const STOCK_NAV = [
  { id: "stock-dashboard", href: "/stock-dashboard", label: "Dashboard", icon: "chart" },
  { id: "stock-screener", href: "/screener", label: "Screener", icon: "filter" },
];

const ADMIN_NAV = [
  { id: "admin-zone-finder", href: "/admin/zone-finder", label: "Zone Finder (ทอง)", icon: "info" },
  { id: "admin-watchlist", href: "/admin/watchlist", label: "Watchlist หุ้นไทย", icon: "bookmark" },
  { id: "admin-auto-trade", href: "/admin/auto-trade", label: "Auto Trade", icon: "bolt" },
];

function navItem(item, activeId) {
  const active = item.id === activeId ? " active" : "";
  return `<a class="nav-item${active}" href="${item.href}">${ICONS[item.icon]}${item.label}</a>`;
}

function renderSidebar() {
  const mount = document.getElementById("sidebar-mount");
  if (!mount) return;
  const activeId = document.body.dataset.active || "";

  mount.innerHTML = `
    <div class="sidebar">
      <div class="brand-row">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="oklch(0.75 0.14 85)" stroke-width="1.8"><path d="M4 18 L9 10 L13 14 L20 5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 5 H20 V11" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>AUREUM</span>
      </div>

      <div class="nav-section">ทอง</div>
      ${GOLD_NAV.map((i) => navItem(i, activeId)).join("")}

      <div class="nav-section">หุ้นไทย</div>
      ${STOCK_NAV.map((i) => navItem(i, activeId)).join("")}

      <div class="nav-divider"></div>

      <div class="admin-label">${ICONS.lock}<span class="nav-section" style="padding:0; color:oklch(0.75 0.14 85);">Admin</span></div>
      ${ADMIN_NAV.map((i) => navItem(i, activeId)).join("")}
    </div>`;
}

renderSidebar();
