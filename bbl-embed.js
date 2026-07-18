(function () {
  // Bump this on every change so we can confirm in the browser console which
  // version Vercel is serving. Check with `bblVersion` in any tab's console.
  var VERSION = '2026-05-21.10';
  window.bblVersion = VERSION;
  console.log('[bbl-embed] version ' + VERSION);

  // Debug logging — enable with ?bbl-debug in the URL
  var DEBUG = /[?&]bbl-debug\b/.test(location.search);
  var __t0 = performance.now();
  function dbg(label, info) {
    if (!DEBUG) return;
    if (arguments.length < 2) console.log('[bbl +' + Math.round(performance.now() - __t0) + 'ms]', label);
    else console.log('[bbl +' + Math.round(performance.now() - __t0) + 'ms]', label, info);
  }
  dbg('script init', { pathname: location.pathname, hash: location.hash, readyState: document.readyState });

  // --- Force SPA navigation for embed-bearing pages ---
  // Framer's compiler wraps links pointing to pages that contain iframe embeds
  // with an override that forces a full document reload (location.href = ...).
  // We intercept the resulting navigate event and convert it back to a same-
  // document navigation. Framer's own router listens for navigate events and
  // re-renders the destination page in place. End result: SPA navigation for
  // /schedule, /memberships, /pricing — same as About/Method get for free.
  //
  // Feature-gated to the Navigation API (Chrome/Edge 102+, Safari 17.4+).
  // Browsers without it fall through to the existing hard-reload behavior;
  // the overlay's path-based fast-path keeps that experience tolerable.
  var SPA_PATHS = ['/schedule', '/memberships', '/pricing'];

  // Sync the iframe to the destination of a same-page navigation. The wrapper
  // only propagates iframe → parent hash; parent hash changes never make it
  // back into the iframe. Without this, two classes of same-page clicks
  // silently do nothing:
  //   (a) header reset clicks — e.g. Schedule from /schedule#/pricing
  //   (b) intra-page deep links — e.g. Claim Intro Offer
  //       (/memberships#/pricing/.../?group=13008) when already on /memberships
  // In both cases Framer's router no-ops (same path) and the iframe stays put.
  // We bridge the gap by pointing iframe.src at the destination route
  // (or the page's canonical default when the destination has no hash).
  var IFRAME_ORIGIN = 'https://bodybylagreesociety.onbookee.com';
  // iframePath: where to point iframe.src for a no-hash reset (initial src
  // before onbookee's internal redirects). canonicalHash: the resting-state
  // hash the iframe settles on after boot — used to suppress no-op resets
  // when the user clicks a header link while already at default state.
  var PAGE_DEFAULTS = {
    '/schedule':    { iframePath: '/class-schedule',                  canonicalHash: '#/class-schedule/r/2094' },
    '/memberships': { iframePath: '/pricing/r/2094/loc/2344?group=0', canonicalHash: '#/pricing/r/2094/loc/2344?group=0' }
  };
  // Updated by the postMessage handler below on every iframe RouteChanged.
  // Used to distinguish wrapper-driven hash updates (which we must NOT
  // re-sync, since the iframe is already where the hash says) from
  // user-driven parent navigations like the Claim Intro Offer button
  // (which we DO need to sync, because the wrapper only propagates
  // iframe→parent and never parent→iframe).
  var lastIframeRoute = null;
  // --- Click intercepts over onbookee's persistent nav ---
  // Each entry creates a transparent <a> positioned over a region of the
  // iframe. Clicking it navigates parent-side (same-page hash update + our
  // syncIframeOnSamePageNav handler updating iframe.src) instead of letting
  // the click reach onbookee — avoiding the ~1s gap before onbookee sends
  // ShowOrigin/RouteChanged. Position values are CSS strings applied as
  // inline styles to the intercept element (which lives inside a wrapper
  // that mirrors the iframe's rect). Use any CSS units: px, %, calc().
  //   pages:        optional array of parent pathnames; defaults to all SPA_PATHS.
  //   onbookeePath: target onbookee route (no origin). buildIntercepts wires
  //                 href = location.pathname + '#' + onbookeePath so each
  //                 click is a SAME-PAGE hash nav on the current Framer
  //                 page (URL desync is acceptable — /schedule#/pricing/...
  //                 and /memberships#/pricing/... both resolve to the same
  //                 iframe state on refresh). Avoids cross-page navs which
  //                 our navigate handler intercepts but Framer's router
  //                 doesn't always re-render from.
  //   style:        position/size relative to iframe (top/bottom/left/right + width/height).
  //
  // Debug helpers (paste in console):
  //   bblIntercepts(true)               // paint intercepts visible (red boxes)
  //   bblIntercepts(false)              // hide debug visuals
  //   bblInterceptPos('classes', {...}) // live-tweak one intercept's style
  //   bblInterceptList()                // log current configs
  // Once positions look right, copy the final styles back into this config.
  // Desktop nav layout in onbookee (≥844px viewport): iframe is full-width
  // with 80px top margin in parent, body 24px L/R padding, header bar 1120px
  // centered, 59px tall, flush to iframe top (intercept top:0).
  // Left cluster (cumulative left offset from header left, w/ 24px gaps):
  //   Classes               x=0   w=51
  //   Sauna Booking         x=75  w=107
  //   Certifications        x=206 w=93
  //   BBL Society Essentials x=323 w=165
  //   Membership            x=512 w=90
  // Right cluster (cumulative offset from header right, w/ 0 gap):
  //   Login/Signup          right=0   w=95
  //   Cart                  right=95  w=40  h=58
  // calc(50% - 560px + X) positions an element X pixels right of the
  // centered 1120px header's left edge; mirrored for right offsets.
  // Below 844px the layout wraps and these values are wrong — minWidth
  // gates them out at narrower viewports.
  var NAV_INTERCEPTS = {
    classes: {
      onbookeePath: '/class-schedule/r/2094',
      minWidth: 844,
      style: { top: '0', left: 'calc(50% - 560px)', width: '51px', height: '59px' }
    },
    sauna: {
      onbookeePath: '/appointment/r/2094',
      minWidth: 844,
      style: { top: '0', left: 'calc(50% - 485px)', width: '107px', height: '59px' }
    },
    certifications: {
      onbookeePath: '/courses/r/2094',
      minWidth: 844,
      style: { top: '0', left: 'calc(50% - 354px)', width: '93px', height: '59px' }
    },
    essentials: {
      onbookeePath: '/products/r/2094',
      minWidth: 844,
      style: { top: '0', left: 'calc(50% - 237px)', width: '155px', height: '59px' }
    },
    membership: {
      onbookeePath: '/pricing/r/2094/loc/2344?group=0',
      minWidth: 844,
      style: { top: '0', left: 'calc(50% - 59px)', width: '90px', height: '59px' }
    }
    // Login and Cart intentionally omitted: onbookee collapses the
    // Login/Signup link (95px) to an icon (40px) when the user is logged
    // in, which also shifts the Cart's right offset by 55px. We have no
    // parent-side signal for auth state, so any fixed-position intercept
    // would be wrong in one of the two states. Falls back to onbookee's
    // own click handling for these two (1s spinner cost is acceptable
    // for login flow and rare cart visits). Revisit if onbookee adds an
    // auth-state postMessage.
  };
  var interceptEls = {};
  var interceptWrapper = null;

  // Ring buffer of recent iframe routes with timestamps. The wrapper
  // propagates iframe → parent hash with lag (~tens of ms), and on rapid
  // redirect chains (e.g. clicking Membership in the iframe:
  // /pricing/r/2094 → /loc/2344 → ?group=0) the wrapper sometimes pushes
  // an *intermediate* route to the parent URL after the iframe has moved
  // on. Comparing only against lastIframeRoute misses those — they look
  // like user-driven navs, causing redundant iframe reloads.
  //
  // We use a TTL on history entries: within IFRAME_ROUTE_HISTORY_TTL_MS
  // of emission, treat the hash as wrapper-driven (skip the iframe.src
  // update). After the TTL, a parent nav to that same hash is treated as
  // a fresh user click — important because our NAV_INTERCEPT anchors
  // target the same hashes the iframe has visited in the past.
  var iframeRouteHistory = [];
  var IFRAME_ROUTE_HISTORY_MAX = 20;
  var IFRAME_ROUTE_HISTORY_TTL_MS = 2000;
  function recordIframeRoute(route) {
    iframeRouteHistory.push({ route: route, ts: performance.now() });
    if (iframeRouteHistory.length > IFRAME_ROUTE_HISTORY_MAX) iframeRouteHistory.shift();
  }
  function isRecentlyEmittedRoute(hash) {
    var now = performance.now();
    for (var i = iframeRouteHistory.length - 1; i >= 0; i--) {
      var entry = iframeRouteHistory[i];
      if (entry.route === hash) return (now - entry.ts) < IFRAME_ROUTE_HISTORY_TTL_MS;
    }
    return false;
  }

  function syncIframeOnSamePageNav(destUrl) {
    if (destUrl.pathname !== location.pathname) return;      // different page — Framer router + wrapper hash-precedence handle it
    var iframe = document.querySelector('iframe[name="studioyou-iframe"]');
    if (!iframe) return;
    var targetPath;
    if (destUrl.hash) {
      // Intra-page deep link (case b). Already at target hash? Nothing to do.
      if (destUrl.hash === location.hash) return;
      // Suppress wrapper-driven hash updates: if the iframe emitted this
      // route within the last IFRAME_ROUTE_HISTORY_TTL_MS, the parent
      // hash change is the wrapper catching up and we shouldn't reload
      // the iframe back to where it already is. Older history entries
      // do NOT block — they're stale destinations the user is free to
      // re-navigate to (e.g. via our NAV_INTERCEPT anchors).
      if (isRecentlyEmittedRoute(destUrl.hash)) return;
      targetPath = destUrl.hash.slice(1);                    // strip leading '#'
    } else {
      // Header reset click (case a). Skip if already at canonical default.
      if (!location.hash) return;
      var entry = PAGE_DEFAULTS[destUrl.pathname];
      if (!entry) return;
      if (location.hash === entry.canonicalHash) return;
      targetPath = entry.iframePath;
    }
    var target = IFRAME_ORIGIN + targetPath;
    dbg('sync iframe on same-page nav', { pathname: destUrl.pathname, target: target });
    showOverlay('sync-iframe');
    iframe.src = target;
  }

  if (typeof navigation !== 'undefined' && navigation && typeof navigation.addEventListener === 'function') {
    navigation.addEventListener('navigate', function (e) {
      if (!e.canIntercept) return;
      var url;
      try { url = new URL(e.destination.url); } catch (_) { return; }
      if (url.origin !== location.origin) return;
      if (SPA_PATHS.indexOf(url.pathname) === -1) return;
      dbg('intercept navigate', { pathname: url.pathname, type: e.navigationType });
      e.intercept({ handler: function () { return Promise.resolve(); } });
      syncIframeOnSamePageNav(url);
    });
  }

  // Guard against double initialization
  var oldOverlay = document.getElementById('bbl-overlay');
  var oldWasVisible = oldOverlay && oldOverlay.classList.contains('visible');
  if (oldOverlay) oldOverlay.remove();

  // StudioYouEmbed calls scrollIntoView('#studioyou-embed') on every RouteChanged
  var embedEl = document.querySelector('#studioyou-embed');
  if (embedEl) embedEl.scrollIntoView = function () {};

  // --- Overlay styles ---
  var s = document.createElement('style');
  // Asymmetric transition: fast 50ms fade-in (so intercept clicks cover
  // onbookee's loader before its spinner can flash through), slower 200ms
  // fade-out (gentler exit when iframe content is ready). The transition
  // rule that applies is the one on the element's STATE AT THE TIME OF
  // CHANGE — so .visible's 50ms rule governs adding the class (fade-in),
  // and the default 200ms rule governs removing it (fade-out).
  s.textContent = '#bbl-overlay{position:fixed;left:0;right:0;bottom:0;top:0;background:rgb(209,203,193);z-index:9;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s ease}#bbl-overlay.visible{opacity:1;pointer-events:auto;transition:opacity .1s ease}';
  document.head.appendChild(s);

  // --- Overlay DOM — SVG Megaformer Loading Animation ---
  var overlay = document.createElement('div');
  overlay.id = 'bbl-overlay';
  overlay.innerHTML = '<svg style="width:800px;max-width:75vw" viewBox="0 0 375 110" xmlns="http://www.w3.org/2000/svg">'
    + '<defs>'
    + '<linearGradient x1="1%" y1="44%" x2="100%" y2="44%" id="gr1"><stop stop-color="#333" offset="0%"/><stop stop-color="#666" offset="52%"/><stop stop-color="#333" offset="100%"/></linearGradient>'
    + '<linearGradient x1="1%" y1="44%" x2="100%" y2="44%" id="gr2"><stop stop-color="#333" offset="0%"/><stop stop-color="#666" offset="52%"/><stop stop-color="#333" offset="100%"/></linearGradient>'
    + '</defs>'
    + '<g stroke="none" fill="none" fill-rule="evenodd">'
    + '<g transform="translate(38,31)">'
    + '<rect fill="#2B3036" width="29" height="47" rx="3"/>'
    + '<rect fill="#FFF" x="14" y="2" width="1" height="19"/>'
    + '<rect fill="#FFF" x="14" y="26" width="1" height="19"/>'
    + '<rect fill="#FFF" x="17" y="22.95" width="8" height="1"/>'
    + '<rect fill="#FFF" x="3" y="22.95" width="8" height="1"/>'
    + '</g>'
    + '<g transform="translate(14,10.138)">'
    + '<polygon stroke="#222" stroke-width="0.6" fill="#000" stroke-linejoin="round" points="275.453 9.973 274 14.862 271.137 14.862 273.656 6.707"/>'
    + '<polygon stroke="#222" stroke-width="0.6" fill="#000" stroke-linejoin="round" transform="translate(57.812,10.784) scale(-1,1) translate(-57.812,-10.784)" points="60.453 6.707 58.035 14.862 55.172 14.862 57.691 6.707"/>'
    + '<polygon stroke="#222" stroke-width="0.6" fill="#000" stroke-linejoin="round" transform="translate(57.812,76.784) scale(-1,-1) translate(-57.812,-76.784)" points="60.453 72.707 58.035 80.862 55.172 80.862 57.691 72.707"/>'
    + '<polygon stroke="#222" stroke-width="0.6" fill="#000" stroke-linejoin="round" transform="translate(273.473,74.784) scale(1,-1) translate(-273.473,-74.784)" points="275.809 73.172 274 78.862 271.137 78.862 273.656 70.707"/>'
    + '<path stroke="#222" stroke-width="0.5" fill="#000" stroke-linejoin="round" d="M300.769,66.707L297.932,67.912L305.405,80.862L282.119,81.14C285.058,72.449,286.67,67.683,286.954,66.842L286.989,66.74C286.996,66.718,287,66.707,287,66.707H300.769ZM296.003,69.973H288.489L287.742,71.859H297L296.003,69.973Z" transform="translate(293.762,73.923) scale(1,-1) translate(-293.762,-73.923)"/>'
    + '<path stroke="#222" stroke-width="0.5" fill="#000" stroke-linejoin="round" d="M45.769,66.707L42.932,67.912L50.405,80.862L27.119,81.14C30.058,72.449,31.67,67.683,31.954,66.842L31.989,66.74C31.996,66.718,32,66.707,32,66.707H45.769ZM41.003,69.973H33.489L32.742,71.859H42L41.003,69.973Z" transform="translate(38.762,73.923) scale(-1,-1) translate(-38.762,-73.923)"/>'
    + '<path stroke="#222" stroke-width="0.5" fill="#000" stroke-linejoin="round" d="M300.769,6.707L297.932,7.912L305.405,20.862L282.119,21.14C285.058,12.449,286.67,7.683,286.954,6.842L286.989,6.74C286.996,6.718,287,6.707,287,6.707H300.769ZM296.003,9.973H288.489L287.742,11.859H297L296.003,9.973Z"/>'
    + '<path stroke="#222" stroke-width="0.5" fill="#000" stroke-linejoin="round" d="M45.769,6.707L42.932,7.912L50.405,20.862L27.119,21.14C30.058,12.449,31.67,7.683,31.954,6.842L31.989,6.74C31.996,6.718,32,6.707,32,6.707H45.769ZM41.003,9.973H33.489L32.742,11.859H42L41.003,9.973Z" transform="translate(38.762,13.923) scale(-1,1) translate(-38.762,-13.923)"/>'
    + '<rect fill="#000" x="46" y="7.862" width="241" height="1.6"/>'
    + '<rect fill="#000" x="41" y="78.862" width="235" height="1.6"/>'
    + '<rect fill="#000" x="48" y="14.862" width="238" height="6" rx="2"/>'
    + '<rect fill="#000" x="48" y="65.862" width="239" height="6" rx="2"/>'
    + '<path stroke="#2B3036" fill="#3B3D40" d="M49.062,13.883V16.825L24.733,17.096C23.745,17.402,22.861,17.918,22.082,18.645C21.319,19.357,20.62,20.308,19.99,21.503V66.375C20.486,67.585,21.18,68.632,22.071,69.516C22.975,70.412,23.964,71.025,25.035,71.362H49.414V74.57H25.164C22.844,74.086,21.075,73.248,19.874,72.03C18.082,70.211,16.944,67.776,16.944,66.275V21.628C16.944,20.155,17.475,18.78,19.025,17.071C20.589,15.346,23.402,13.883,24.813,13.883H49.062Z"/>'
    + '<path stroke="#2B3036" fill="#3B3D40" d="M316.062,13.883V16.825L291.733,17.096C290.745,17.402,289.861,17.918,289.082,18.645C288.319,19.357,287.62,20.308,286.99,21.503V66.375C287.486,67.585,288.18,68.632,289.071,69.516C289.975,70.412,290.964,71.025,292.035,71.362H316.414V74.57H292.164C289.844,74.086,288.075,73.248,286.874,72.03C285.082,70.211,283.944,67.776,283.944,66.275V21.628C283.944,20.155,284.475,18.78,286.025,17.071C287.589,15.346,290.402,13.883,291.813,13.883H316.062Z" transform="translate(300.179,44.226) rotate(180) translate(-300.179,-44.226)"/>'
    + '<path stroke="#222" fill="#3B3D40" stroke-linejoin="round" d="M274,6.362L288.049,1.97L329.35,1.432L344.987,0C345.65,0.556,345.982,1.519,345.982,2.888C345.982,4.257,345.702,5.102,345.141,5.422L329.492,6.362H288.312L274,10.362V6.362Z"/>'
    + '<path stroke="#222" fill="#3B3D40" stroke-linejoin="round" d="M0,6.362L14.049,1.97L55.35,1.432L70.987,0C71.65,0.556,71.982,1.519,71.982,2.888C71.982,4.257,71.702,5.102,71.141,5.422L55.492,6.362H14.312L0,10.362V6.362Z" transform="translate(35.991,5.181) scale(-1,1) translate(-35.991,-5.181)"/>'
    + '<path stroke="#222" fill="#3B3D40" stroke-linejoin="round" d="M274,85.478L291.576,79.506H328.421L345.704,76C346.367,76.556,346.698,77.519,346.698,78.888C346.698,80.257,346.418,81.102,345.858,81.422L328.421,84.539L291.576,84.297L274,89.478V85.478Z" transform="translate(310.349,82.739) scale(1,-1) translate(-310.349,-82.739)"/>'
    + '<path stroke="#222" fill="#3B3D40" stroke-linejoin="round" d="M0,85.478L17.576,79.506H54.421L71.704,76C72.367,76.556,72.698,77.519,72.698,78.888C72.698,80.257,72.418,81.102,71.858,81.422L54.421,84.539L17.576,84.297L0,89.478V85.478Z" transform="translate(36.349,82.739) scale(-1,-1) translate(-36.349,-82.739)"/>'
    + '<rect fill="url(#gr1)" x="57" y="13.862" width="4" height="59"/>'
    + '<rect fill="url(#gr1)" x="272" y="13.862" width="4" height="59"/>'
    + '</g>'
    + '<g transform="translate(294,31)">'
    + '<rect fill="#2B3036" width="29" height="47" rx="3"/>'
    + '<rect fill="#FFF" x="14" y="2" width="1" height="19"/>'
    + '<rect fill="#FFF" x="14" y="26" width="1" height="19"/>'
    + '<rect fill="#FFF" x="17" y="22.95" width="8" height="1"/>'
    + '<rect fill="#FFF" x="3" y="22.95" width="8" height="1"/>'
    + '</g>'
    + '<g transform="translate(79,16.5)">'
    + '<animateTransform attributeName="transform" type="translate" values="79,16.5;184,16.5;79,16.5" keyTimes="0;0.5;1" dur="3s" repeatCount="indefinite"/>'
    + '<g>'
    + '<rect fill="#818181" x="99" y="0.5" width="12" height="12" rx="3"/>'
    + '<rect fill="#000" x="1" y="0.5" width="12" height="12" rx="3"/>'
    + '<rect fill="#818181" x="99" y="63.5" width="12" height="12" rx="3"/>'
    + '<rect fill="#000" x="1" y="63.5" width="12" height="12" rx="3"/>'
    + '<rect fill="url(#gr1)" x="0" y="7.5" width="4" height="59"/>'
    + '<rect fill="url(#gr1)" x="106" y="7.5" width="4" height="59"/>'
    + '<rect fill="url(#gr2)" x="52" y="-45.5" width="4" height="95" transform="translate(54,2) rotate(-270) translate(-54,-2)"/>'
    + '<rect fill="url(#gr2)" x="52" y="25.5" width="4" height="95" transform="translate(54,73) rotate(-270) translate(-54,-73)"/>'
    + '<rect fill="#222" x="13" y="4" width="5" height="4"/>'
    + '<rect fill="#222" x="94" y="4" width="5" height="4"/>'
    + '<rect fill="#222" x="94" y="65" width="5" height="6"/>'
    + '<rect fill="#222" x="13" y="65" width="5" height="6"/>'
    + '</g>'
    + '<g transform="translate(8,7.5)"><rect fill="#2B3036" width="28" height="59" rx="3"/><rect fill="#FFF" x="13.4" y="2" width="1" height="24"/><rect fill="#FFF" x="13.4" y="33" width="1" height="24"/><rect fill="#FFF" x="16.5" y="29.1" width="8" height="1"/><rect fill="#FFF" x="3" y="29.1" width="8" height="1"/></g>'
    + '<g transform="translate(40,7.5)"><rect fill="#2B3036" width="28" height="59" rx="3"/><rect fill="#FFF" x="13.4" y="2" width="1" height="24"/><rect fill="#FFF" x="13.4" y="33" width="1" height="24"/><rect fill="#FFF" x="16.5" y="29.1" width="8" height="1"/><rect fill="#FFF" x="3" y="29.1" width="8" height="1"/></g>'
    + '<g transform="translate(72,7.5)"><rect fill="#2B3036" width="28" height="59" rx="3"/><rect fill="#FFF" x="13.4" y="2" width="1" height="24"/><rect fill="#FFF" x="13.4" y="33" width="1" height="24"/><rect fill="#FFF" x="16.5" y="29.1" width="8" height="1"/><rect fill="#FFF" x="3" y="29.1" width="8" height="1"/></g>'
    + '</g>'
    + '</g>'
    + '</svg>';
  document.body.appendChild(overlay);

  // Debug hook — call bblOverlayAlpha(0.2) in console to see onbookee through
  // the overlay (0=invisible, 1=opaque). bblOverlayAlpha() resets to default.
  // Uses CSS custom property + override of .visible's opacity rule so the
  // class-based show/hide still works while transparent.
  window.bblOverlayAlpha = function (a) {
    var existing = document.getElementById('bbl-overlay-alpha-override');
    if (existing) existing.remove();
    if (a == null) return;
    var styleEl = document.createElement('style');
    styleEl.id = 'bbl-overlay-alpha-override';
    // Also force iframe visibility — watchIframe's load handler sets
    // iframe.style.visibility='hidden' to prevent flash, which would
    // otherwise mean there's nothing behind the translucent overlay to see.
    // CSS !important beats non-important inline style.
    styleEl.textContent = '#bbl-overlay.visible{opacity:' + a + '!important}'
      + 'iframe[name="studioyou-iframe"]{visibility:visible!important}';
    document.head.appendChild(styleEl);
    console.log('[bbl-embed] overlay alpha set to', a);
  };

  // Immediate show on iframe pages (fast path) — classList.add is idempotent, no flicker
  if (oldWasVisible || location.pathname.includes('/schedule') || location.pathname.includes('/pricing')) {
    dbg('init fast-path: showing overlay', { oldWasVisible: oldWasVisible });
    overlay.classList.add('visible');
  }

  // --- Overlay logic ---
  var heightDebounce = null;
  var overlayFailsafe = null;

  // If the overlay is shown but the iframe goes completely silent, give
  // up after this long and hide it anyway so the user isn't stranded.
  // Dropped to 4s — most observed slow paths are now handled by the
  // RouteChanged 500ms backup hide and the per-height failsafe reset
  // (any height = proof of life). 4s should only trigger on genuinely
  // stuck iframes.
  var OVERLAY_FAILSAFE_MS = 4000;

  function showOverlay(reason) {
    // Only reset the SMIL clock when transitioning hidden → visible. Each
    // nav triggers showOverlay() twice (once from watchIframe init, again
    // from the iframe's load event); calling setCurrentTime(0) on the
    // second one resets the animation just as the user starts to see it,
    // which manifests as a freeze (cached iframe → near-simultaneous calls)
    // on desktop or a 100–200ms restart (cellular iframe load) on mobile.
    var wasVisible = overlay.classList.contains('visible');
    dbg('showOverlay', { reason: reason, wasVisible: wasVisible });
    overlay.classList.add('visible');
    if (!wasVisible) {
      var svg = overlay.firstChild;
      if (svg && svg.setCurrentTime) svg.setCurrentTime(0);
    }
    // Cancel any pending ReceiveMyHeight debounce — without this, re-showing
    // during the 300ms debounce window gets undone by the already-scheduled
    // hide. Matters when onbookee fires a second ShowOrigin / RouteChanged
    // shortly after a prior load settled (e.g. /pricing's double-mount).
    // Note: targeted re-schedule lives in the RouteChanged handler below —
    // see comment there.
    clearTimeout(heightDebounce);
    clearTimeout(overlayFailsafe);
    overlayFailsafe = setTimeout(function () { hideOverlay('failsafe'); }, OVERLAY_FAILSAFE_MS);
  }

  function hideOverlay(reason) {
    dbg('hideOverlay', reason);
    clearTimeout(overlayFailsafe);
    var iframe = document.querySelector('iframe[name="studioyou-iframe"]');
    if (iframe) iframe.style.visibility = 'visible';
    requestAnimationFrame(function () {
      overlay.classList.remove('visible');
    });
  }

  function watchIframe(iframe) {
    dbg('watchIframe', { src: iframe.src });
    showOverlay('watchIframe-init');
    // Build intercepts once the iframe is on the page.
    buildIntercepts();
    iframe.addEventListener('load', function () {
      // iframe.load fires when the iframe document AND all subresources
      // (scripts, images, etc.) finish loading. In practice this is LATER
      // than onbookee's app boot + ShowOrigin/RouteChanged/ReceiveMyHeight
      // sequence (which run on DOMContentLoaded inside the iframe). So by
      // the time this fires the load is effectively done; calling
      // showOverlay here would cancel the pending heightDebounce hide
      // (since showOverlay clears it) and strand the overlay until the
      // 10s failsafe. Setting iframe.style.visibility='hidden' would also
      // be wrong — the content is ready, hiding it would blank the page.
      // postMessage handlers manage the overlay lifecycle.
      dbg('iframe load event', { src: iframe.src });
    });
  }

  var existing = document.querySelector('iframe[name="studioyou-iframe"]');
  if (existing) {
    dbg('existing iframe at script init', { src: existing.src });
    watchIframe(existing);
  }

  new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      for (var j = 0; j < mutations[i].addedNodes.length; j++) {
        var node = mutations[i].addedNodes[j];
        if (node.nodeType !== 1) continue;
        var iframe = node.name === 'studioyou-iframe' ? node
          : node.querySelector && node.querySelector('iframe[name="studioyou-iframe"]');
        if (iframe) {
          dbg('MutationObserver: iframe added');
          watchIframe(iframe);
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  window.addEventListener('message', function (e) {
    // Filter to messages from the specific studioyou booking iframe. An
    // origin-only filter is not enough — the home page contains another
    // onbookee-origin iframe (Kenko Chatbox widget) that also fires
    // ShowOrigin on load, which previously triggered our overlay even
    // though that iframe isn't the booking one we cover. Match by
    // e.source === iframe.contentWindow to be precise.
    var studioyouIframe = document.querySelector('iframe[name="studioyou-iframe"]');
    if (!studioyouIframe || e.source !== studioyouIframe.contentWindow) return;
    var data;
    try {
      data = typeof e.data === 'object' ? e.data : JSON.parse(e.data);
    } catch (_) {
      dbg('postMessage (non-JSON)', { origin: e.origin, raw: String(e.data).slice(0, 200) });
      return;
    }
    dbg('postMessage', { origin: e.origin, type: data && data.type, keys: data && typeof data === 'object' ? Object.keys(data) : null });
    // Cover onbookee's loading state. Three triggers — overlap is intentional:
    //   ShowOrigin     → fires on every onbookee mount (incl. their /pricing
    //                    double-mount). Earliest signal on iframe-remount flows.
    //   RouteChanged   → fires on every URL transition, including pure-SPA navs
    //                    where no remount happens. Slightly later than 331.
    //   height === 331 → onbookee's loading-skeleton height. Confirmed stable
    //                    across viewports (wide vw=2210, narrow vw=848, both
    //                    report 331 — skeleton doesn't scale). Fires earliest
    //                    on some SPA navs that don't trigger ShowOrigin. Real
    //                    content heights observed: 241, 249, 328, 346, 463+ —
    //                    no collisions at exactly 331. Magic number tied to
    //                    onbookee's current loader UI; update if they change it.
    if (data && data.type === 'ShowOrigin') {
      showOverlay('show-origin');
    }
    if (data && data.type === 'RouteChanged') {
      showOverlay('route-changed');
      // showOverlay just cleared heightDebounce. If onbookee follows up with
      // heights they'll reschedule it to 300ms. But when the new route's
      // layout height matches the previous (no visible change — observed on
      // /appointment/...?facility=&id= sub-routes), onbookee sends no height
      // and the overlay would hang until the 10s failsafe. Schedule a 500ms
      // backup hide; any incoming height resets it. Scoped to RouteChanged
      // because other triggers (iframe-load, ShowOrigin, loading-height)
      // are reliably followed by heights and would regress on slow boots.
      heightDebounce = setTimeout(function () { hideOverlay('route-no-height'); }, 500);
    }
    if (data && data.type === 'ReceiveMyHeight' && data.message && data.message.height === 331) {
      showOverlay('loading-height');
    }
    if (data && data.type === 'ReceiveMyHeight') {
      dbg('ReceiveMyHeight: scheduling hideOverlay in 300ms');
      clearTimeout(heightDebounce);
      heightDebounce = setTimeout(function () { hideOverlay('receivemyheight'); }, 300);
      // Push failsafe back — any height message is proof the iframe is alive.
      // Without this, a slow nav (RouteChanged then long pause before next
      // height) trips the failsafe and hides the overlay mid-load. Only
      // complete silence from onbookee should fire the failsafe.
      if (overlay.classList.contains('visible')) {
        clearTimeout(overlayFailsafe);
        overlayFailsafe = setTimeout(function () { hideOverlay('failsafe'); }, OVERLAY_FAILSAFE_MS);
      }
      // Iframe size likely changed — realign the intercept wrapper.
      repositionInterceptWrapper();
    }
    if (data && data.type === 'RouteChanged' && data.message && typeof data.message.path === 'string') {
      lastIframeRoute = '#' + data.message.path;
      recordIframeRoute(lastIframeRoute);
      dbg('iframe RouteChanged', { route: lastIframeRoute });
    }
    if (data && data.type === 'ReceiveClientRect') {
      // Onbookee polls for this when its modals (e.g. date picker) need to
      // anchor against the parent page. Cross-origin iframes can't measure
      // their own parent-page position, so they ask us. If we don't reply
      // they retry ~2x/sec indefinitely. Reply with the iframe's bounding
      // rect plus viewport scroll/size so modals can position correctly.
      // Response shape is a best guess matching their naming convention —
      // adjust if the date picker still mispositions.
      var rectIframe = getStudioyouIframe();
      if (rectIframe && e.source && e.origin) {
        var r = rectIframe.getBoundingClientRect();
        try {
          e.source.postMessage(JSON.stringify({
            type: 'ReceiveClientRect',
            message: {
              x: r.x, y: r.y,
              width: r.width, height: r.height,
              top: r.top, left: r.left, right: r.right, bottom: r.bottom,
              scrollX: window.scrollX, scrollY: window.scrollY,
              innerWidth: window.innerWidth, innerHeight: window.innerHeight
            }
          }), e.origin);
        } catch (_) {}
      }
    }
  });

  // Also instrument the global URL state — helpful for understanding the
  // /schedule → /schedule#/class-schedule/r/X transition we're seeing.
  window.addEventListener('popstate', function () { dbg('popstate', { pathname: location.pathname, hash: location.hash }); });
  window.addEventListener('hashchange', function () { dbg('hashchange', { hash: location.hash }); });

  // --- Click intercept framework (see NAV_INTERCEPTS config above) ---
  function setupInterceptStyles() {
    if (document.getElementById('bbl-intercept-styles')) return;
    var s = document.createElement('style');
    s.id = 'bbl-intercept-styles';
    s.textContent =
      '#bbl-intercept-wrapper{position:fixed;pointer-events:none;z-index:8}'
      + '.bbl-intercept{position:absolute;pointer-events:auto;cursor:pointer;text-decoration:none}'
      + '.bbl-intercept-debug .bbl-intercept{background:rgba(255,0,0,0.3);outline:1px dashed red}'
      + '.bbl-intercept-debug .bbl-intercept::after{content:attr(data-bbl-intercept);color:#fff;font:11px monospace;padding:2px 4px;background:rgba(0,0,0,0.7);position:absolute;top:0;left:0}';
    document.head.appendChild(s);
  }

  function getStudioyouIframe() {
    return document.querySelector('iframe[name="studioyou-iframe"]');
  }

  function repositionInterceptWrapper() {
    if (!interceptWrapper) return;
    var iframe = getStudioyouIframe();
    if (!iframe) return;
    var rect = iframe.getBoundingClientRect();
    interceptWrapper.style.left = rect.left + 'px';
    interceptWrapper.style.top = rect.top + 'px';
    interceptWrapper.style.width = rect.width + 'px';
    interceptWrapper.style.height = rect.height + 'px';
  }

  function buildIntercepts() {
    setupInterceptStyles();
    // Tear down any previous wrapper (e.g. on parent SPA nav between pages).
    if (interceptWrapper) {
      interceptWrapper.remove();
      interceptWrapper = null;
      interceptEls = {};
    }
    var iframe = getStudioyouIframe();
    if (!iframe) return;
    interceptWrapper = document.createElement('div');
    interceptWrapper.id = 'bbl-intercept-wrapper';
    document.body.appendChild(interceptWrapper);
    Object.keys(NAV_INTERCEPTS).forEach(function (name) {
      var def = NAV_INTERCEPTS[name];
      if (def.pages && def.pages.indexOf(location.pathname) === -1) return;
      if (def.minWidth && window.innerWidth < def.minWidth) return;
      var a = document.createElement('a');
      // Same-page hash nav on whatever Framer page we're currently on.
      // syncIframeOnSamePageNav handles this by updating iframe.src.
      a.href = location.pathname + '#' + def.onbookeePath;
      a.className = 'bbl-intercept';
      a.dataset.bblIntercept = name;
      Object.keys(def.style || {}).forEach(function (prop) { a.style[prop] = def.style[prop]; });
      interceptWrapper.appendChild(a);
      interceptEls[name] = a;
    });
    repositionInterceptWrapper();
  }

  window.addEventListener('scroll', repositionInterceptWrapper, { passive: true });
  // Rebuild on resize — covers minWidth threshold crossings and any future
  // viewport-dependent positioning. Debounced via RAF.
  var resizeRaf = 0;
  window.addEventListener('resize', function () {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(function () { resizeRaf = 0; buildIntercepts(); });
  });
  // Re-build on parent SPA nav (the iframe element may be replaced).
  window.addEventListener('bbl-nav', buildIntercepts);

  // Debug helpers
  window.bblIntercepts = function (visible) {
    if (!interceptWrapper) return console.log('[bbl-embed] no intercept wrapper yet');
    interceptWrapper.classList.toggle('bbl-intercept-debug', visible !== false);
    console.log('[bbl-embed] intercepts', visible !== false ? 'visible' : 'hidden');
  };
  window.bblInterceptPos = function (name, styles) {
    var el = interceptEls[name];
    if (!el) return console.log('[bbl-embed] no intercept named', name, '— have:', Object.keys(interceptEls));
    Object.keys(styles).forEach(function (prop) { el.style[prop] = styles[prop]; });
    console.log('[bbl-embed] updated', name, '→', styles);
  };
  window.bblInterceptList = function () {
    var summary = {};
    Object.keys(interceptEls).forEach(function (name) {
      var el = interceptEls[name];
      summary[name] = { href: el.getAttribute('href'), top: el.style.top, bottom: el.style.bottom, left: el.style.left, right: el.style.right, width: el.style.width, height: el.style.height };
    });
    console.table(summary);
  };

  // --- Dark header on home page at scroll top ---
  // On Framer's mobile breakpoint, the header's *default* styling is already
  // transparent bg + white text (designed to overlay hero video). Removing
  // .bbl-dark-header alone leaves it dark, so we also force a light state via
  // .bbl-light-header that mirrors the desktop cream/black defaults.
  var darkHeaderCSS = document.createElement('style');
  darkHeaderCSS.textContent =
    '.bbl-dark-header{background-color:rgba(0,0,0,0.6)!important}'
    + '.bbl-dark-header p,.bbl-dark-header a{color:#fff!important}'
    // Logo filters: at viewport <1200, Framer applies filter:invert(1) to a
    // logo-container ancestor (renders the source-black logo as white over
    // dark backdrops). At ≥1200 that filter is dropped. We need to compose
    // against parent state: at desktop the img must do its own inversion;
    // at tablet/mobile it must leave (or counter) the parent's invert.
    // Logo filters: at viewport <1200 Framer applies filter:invert(1) to a
    // logo-container ancestor. On desktop browsers the parent and a counter
    // child filter compose cleanly (double-invert cancels). On iOS WebKit
    // they don't — both Safari and Chrome on iOS flatten compositing such
    // that double-invert still reads as a single inversion (source-black
    // logo renders white). Rather than try to compose against the parent,
    // we neutralize the parent's filter at runtime (see below) and then
    // apply a single direct filter on the img.
    + '.bbl-dark-header [data-framer-name="Logo"] img{filter:brightness(0) invert(1)!important}'
    + '.bbl-light-header [data-framer-name="Logo"] img{filter:none!important}'
    + '.bbl-dark-header [data-border]{background-color:transparent!important;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,0.6)!important}'
    + '.bbl-dark-header [data-framer-name="Wave"]{background-color:rgba(255,255,255,0.15)!important}'
    + '.bbl-dark-header [data-framer-name="Hamburger"] div:not(:has(*)){background-color:#fff!important}'
    + '.bbl-light-header{background-color:rgb(210,205,194)!important}'
    + '.bbl-light-header p,.bbl-light-header a{color:rgb(26,26,26)!important}'
    + '.bbl-light-header [data-framer-name="Hamburger"] div:not(:has(*)){background-color:rgb(26,26,26)!important}'
    // Animate every property we toggle between dark/light. Applied in either
    // state so transitions run in both directions. Header itself transitions
    // background-color via inline style (set in initHideOnScrollDown alongside
    // transform) — inline wins over class rules so we set both there.
    + '.bbl-dark-header p,.bbl-dark-header a,.bbl-light-header p,.bbl-light-header a{transition:color .5s ease}'
    + '.bbl-dark-header [data-framer-name="Logo"] img,.bbl-light-header [data-framer-name="Logo"] img{transition:filter .5s ease}'
    + '.bbl-dark-header [data-border],.bbl-light-header [data-border]{transition:background-color .5s ease,box-shadow .5s ease}'
    + '.bbl-dark-header [data-framer-name="Wave"],.bbl-light-header [data-framer-name="Wave"]{transition:background-color .5s ease}'
    + '.bbl-dark-header [data-framer-name="Hamburger"] div:not(:has(*)),.bbl-light-header [data-framer-name="Hamburger"] div:not(:has(*)){transition:background-color .5s ease}'
    // Hide-on-scroll-down — replaces Framer's "On Scroll Down" header animation
    // (which has no offset/velocity controls and triggered on iOS rubber-band
    // bounce near scrollY=0). See initHideOnScrollDown for the show/hide rules.
    + '.bbl-header-hidden{transform:translateY(-100%)!important}';
  document.head.appendChild(darkHeaderCSS);

  // Walk every Logo's ancestor chain and force any element with a non-empty
  // filter to filter:none (inline !important so Framer's stylesheet can't win
  // back). Lets the img's own filter render the logo color directly without
  // depending on filter composition — which doesn't work the same on iOS
  // WebKit as it does on desktop browsers.
  function neutralizeLogoAncestorFilters() {
    var logos = document.querySelectorAll('[data-framer-name="Logo"]');
    for (var i = 0; i < logos.length; i++) {
      var p = logos[i].parentElement;
      while (p && p !== document.body) {
        var f = getComputedStyle(p).filter;
        if (f && f !== 'none') {
          p.style.setProperty('filter', 'none', 'important');
        }
        p = p.parentElement;
      }
    }
  }
  // Framer re-renders ancestors on route changes and re-applies its inline
  // filter:invert(1), so re-run on every nav with a few delayed retries to
  // catch async hydration. Same retry pattern used for the initial run.
  function scheduleNeutralizeLogoAncestorFilters() {
    neutralizeLogoAncestorFilters();
    setTimeout(neutralizeLogoAncestorFilters, 100);
    setTimeout(neutralizeLogoAncestorFilters, 500);
    setTimeout(neutralizeLogoAncestorFilters, 1500);
  }
  scheduleNeutralizeLogoAncestorFilters();
  window.addEventListener('resize', neutralizeLogoAncestorFilters);
  window.addEventListener('bbl-nav', scheduleNeutralizeLogoAncestorFilters);
  window.addEventListener('popstate', scheduleNeutralizeLogoAncestorFilters);

  function findHeader() {
    var divs = document.querySelectorAll('div');
    for (var i = 0; i < divs.length; i++) {
      var s = getComputedStyle(divs[i]);
      if (s.position === 'fixed' && parseInt(s.zIndex) >= 10) {
        var rect = divs[i].getBoundingClientRect();
        if (rect.top <= 10 && rect.height < 200 && rect.width > window.innerWidth * 0.5) return divs[i];
      }
    }
    return null;
  }

  var _pushState = history.pushState;
  history.pushState = function () {
    _pushState.apply(this, arguments);
    dbg('pushState', { pathname: location.pathname, hash: location.hash });
    window.dispatchEvent(new Event('bbl-nav'));
  };
  var _replaceState = history.replaceState;
  history.replaceState = function () {
    _replaceState.apply(this, arguments);
    dbg('replaceState', { pathname: location.pathname, hash: location.hash });
    window.dispatchEvent(new Event('bbl-nav'));
  };

  // Pages that stay dark for their whole length, rather than only near the top
  // as on Home — their background owns the viewport all the way down, so a cream
  // header reads as a light band across a dark page.
  //
  // This must be decided from the path. Probing the DOM for the page's own
  // content ('.cine-root') can't work: bbl-nav fires on pushState, which happens
  // *before* Framer mounts the new route, so the probe answers for the page we
  // just left. Landing on a dark page from Home-at-top that flashed the header
  // cream for a beat (new path, old DOM) before correcting itself to dark.
  // Trade-off: rename a page here and its header silently reverts to cream.
  var DARK_PATHS = ['/method', '/sauna', '/certification'];

  function initDarkHeader(header) {
    function currentPath() {
      var p = location.pathname.replace(/\/+$/, '');
      return p === '' ? '/' : p;
    }
    function updateHeader() {
      var path = currentPath();
      var dark = DARK_PATHS.indexOf(path) !== -1
        || (path === '/' && window.scrollY <= 400);
      header.classList.toggle('bbl-dark-header', dark);
      header.classList.toggle('bbl-light-header', !dark);
    }
    window.addEventListener('scroll', updateHeader, { passive: true });
    window.addEventListener('popstate', updateHeader);
    window.addEventListener('bbl-nav', updateHeader);
    updateHeader();
  }

  // Hide header when scrolling down past a cushion, show when scrolling up.
  // Cushion (SHOW_THRESHOLD) ensures iOS rubber-band bounce near scrollY=0
  // never triggers a hide. Delta threshold prevents micro-jitter from flapping
  // the state. Transition is short (120ms) so the header doesn't linger when
  // the user is actively scrolling.
  function initHideOnScrollDown(header) {
    // Inline transition wins over the dark/light class rules — include
    // background-color here so toggling .bbl-dark-header / .bbl-light-header
    // animates instead of snapping.
    header.style.transition = 'transform 0.2s ease, background-color 0.5s ease';
    var lastY = window.scrollY;
    var SHOW_THRESHOLD = 100; // always show within this many px of the top
    var DELTA_THRESHOLD = 5;  // ignore scrolls smaller than this
    function update() {
      var y = window.scrollY;
      var dy = y - lastY;
      if (y <= SHOW_THRESHOLD) {
        header.classList.remove('bbl-header-hidden');
      } else if (dy > DELTA_THRESHOLD) {
        header.classList.add('bbl-header-hidden');
      } else if (dy < -DELTA_THRESHOLD) {
        header.classList.remove('bbl-header-hidden');
      }
      lastY = y;
    }
    window.addEventListener('scroll', update, { passive: true });
  }

  // Framer renders the header client-side, so it does not exist when this script
  // runs and we have to wait for it. That wait is why a dark page used to flash:
  // links baked into a code component are raw <a href> that Framer's router does
  // not own, so /method -> /sauna is a FULL page load. The new page painted the
  // header in Framer's cream default, and only once we noticed it did it go dark
  // — read as dark -> light -> dark across the navigation.
  //
  // A MutationObserver closes that window where a poll cannot: its callback runs
  // as a microtask at the end of the task that inserted the header, which is
  // before the browser paints. The old 200ms setInterval could not win — it was
  // up to a full frame late by construction, and the flash was exactly that gap.
  var headerInit = null;
  function adoptHeader() {
    var el = findHeader();
    if (!el || el === headerInit) return !!headerInit;
    headerInit = el;
    initDarkHeader(el);
    // Then FLUSH before installing the transition, and do not remove this line.
    // Calling initDarkHeader first is not on its own enough: style recalc is
    // batched to the end of the task, so without a forced read the browser would
    // see the new class and `transition: background-color .5s` in the same recalc
    // and animate the first cream->dark correction — a 500ms fade that IS the
    // flash we are here to kill. Reading offsetWidth commits the dark state while
    // no transition exists yet, so it snaps; later Home-scroll toggles still
    // animate normally. (Framer's own header rule is `transition: all` at
    // duration 0s, so it never animates and is not a factor.)
    void el.offsetWidth;
    initHideOnScrollDown(el);
    return true;
  }
  if (!adoptHeader()) {
    var headerWatch = new MutationObserver(function () {
      if (adoptHeader()) headerWatch.disconnect();
    });
    headerWatch.observe(document.documentElement, { childList: true, subtree: true });
    // Backstop: if the header never shows up, stop watching every mutation on the
    // page forever.
    setTimeout(function () { headerWatch.disconnect(); }, 10000);
  }

})();
