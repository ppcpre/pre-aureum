/**
 * Pull-to-refresh (touch only) — mobile browsers' native pull-to-refresh
 * (a full page reload) stops working once the app runs in `display:
 * standalone` (see manifest.json, added for the PWA support) since there's
 * no browser chrome left to trigger it. This reimplements the gesture by
 * hand so installed-app users don't lose it.
 *
 * Self-initializing on every page (loaded everywhere, like chat-fab.js /
 * market-hours.js). Default action is a full page reload; a page with its
 * own AJAX refresh logic calls `setPullToRefreshHandler(fn)` to swap in a
 * smoother in-place refresh instead of reloading the whole document (see
 * app.js, stock-dashboard.js, trend-analysis.js).
 */
(function () {
  let refreshHandler = () => {
    window.location.reload();
    return Promise.resolve();
  };
  window.setPullToRefreshHandler = (fn) => {
    refreshHandler = fn;
  };

  const THRESHOLD = 70; // px pulled down before release triggers a refresh
  const MAX_PULL = 110;
  const HIDDEN_Y = -48;

  let startY = 0;
  let pulling = false;
  let refreshing = false;

  const indicator = document.createElement("div");
  indicator.id = "ptr-indicator";
  indicator.setAttribute("aria-hidden", "true");
  indicator.innerHTML =
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11A8 8 0 1 0 18.6 16 M20 5v6h-6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  Object.assign(indicator.style, {
    position: "fixed",
    top: "calc(env(safe-area-inset-top, 0px) + 10px)",
    left: "50%",
    transform: `translate(-50%, ${HIDDEN_Y}px)`,
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    background: "oklch(0.20 0.007 250)",
    border: "1px solid oklch(0.29 0.008 250)",
    color: "oklch(0.75 0.14 85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "9999",
    opacity: "0",
    pointerEvents: "none",
    boxShadow: "0 4px 14px oklch(0 0 0 / 35%)",
  });

  const styleTag = document.createElement("style");
  styleTag.textContent = "@keyframes ptr-spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(styleTag);

  function mount() {
    document.body.appendChild(indicator);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  function setIndicator(pullDistance, spinning) {
    const clamped = Math.max(0, Math.min(pullDistance, MAX_PULL));
    const svg = indicator.querySelector("svg");
    indicator.style.opacity = String(Math.min(1, clamped / THRESHOLD));
    if (spinning) {
      indicator.style.transform = `translate(-50%, 0px)`;
      svg.style.animation = "ptr-spin 0.8s linear infinite";
    } else {
      indicator.style.transform = `translate(-50%, ${HIDDEN_Y + clamped}px) rotate(${clamped * 2.5}deg)`;
      svg.style.animation = "";
    }
  }

  // A touch that starts inside a chart (Lightweight Charts canvas — gold/
  // stock/trend-analysis pages) must be left alone for the chart's own
  // pan/pinch-zoom handling; grabbing it here would fight that gesture.
  function startedInChart(target) {
    return !!target.closest?.(".chart-card, .trend-chart-card, #chart-container");
  }

  // The chat page (admin/chat.html) fixes body/html at 100vh and scrolls
  // only its own #messages list — window.scrollY there is permanently 0, so
  // checking only that would make this gesture eligible on every touch,
  // including scrolling UP through chat history. Walk up from the touch
  // target to whichever ancestor actually scrolls and check THAT element's
  // scrollTop instead, which is correct for both the normal page-body case
  // and any element with its own internal scroll region.
  function findScrollableAncestor(el) {
    // Defensive: a touch target is normally an Element, but guard against
    // anything else (e.g. an event dispatched straight on window/document)
    // reaching getComputedStyle(), which throws on a non-Element.
    let node = el && el.nodeType === 1 ? el : null;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  let activeScrollable = null;

  window.addEventListener(
    "touchstart",
    (e) => {
      if (refreshing || startedInChart(e.target)) {
        pulling = false;
        return;
      }
      activeScrollable = findScrollableAncestor(e.target);
      if (activeScrollable.scrollTop > 0) {
        pulling = false;
        return;
      }
      startY = e.touches[0].clientY;
      pulling = true;
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    (e) => {
      if (!pulling || refreshing) return;
      if (activeScrollable && activeScrollable.scrollTop > 0) {
        pulling = false;
        setIndicator(0, false);
        return;
      }
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        setIndicator(0, false);
        return;
      }
      // Only take over the gesture once it's unambiguously a downward pull
      // from the very top — prevents the page's normal scroll from feeling stuck.
      if (e.cancelable) e.preventDefault();
      setIndicator(dy, false);
    },
    { passive: false }
  );

  window.addEventListener("touchend", async (e) => {
    if (!pulling || refreshing) {
      pulling = false;
      return;
    }
    pulling = false;
    const dy = (e.changedTouches[0]?.clientY ?? startY) - startY;
    if (dy >= THRESHOLD) {
      refreshing = true;
      setIndicator(THRESHOLD, true);
      try {
        await refreshHandler();
      } catch (err) {
        console.error("[pull-to-refresh] handler failed:", err);
      } finally {
        refreshing = false;
        setIndicator(0, false);
      }
    } else {
      setIndicator(0, false);
    }
  });

  window.addEventListener("touchcancel", () => {
    pulling = false;
    if (!refreshing) setIndicator(0, false);
  });
})();
