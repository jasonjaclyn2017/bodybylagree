(function () {
  // Bump this on every change so we can confirm in the browser console which
  // version Vercel is serving. Check with `bblVersion` in any tab's console.
  var VERSION = '2026-08-17.1';
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

  // --- Microsoft Clarity (added 2026-08-15) ---
  // Heatmaps / scroll maps / session recordings, site-wide. Official async
  // loader; fails silently and must never break the site. GA4 is loaded by
  // Framer directly (site settings), not here.
  (function clarityInit() {
    try {
      (function (c, l, a, r, i, t, y) {
        c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
        y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
      })(window, document, 'clarity', 'script', 'y2wdq6ov9p');
    } catch (_) {}
  })();

  // --- GA4 custom events (added 2026-08-15) ---
  // gtag.js itself is loaded by Framer (site settings, G-T486J7W5WJ); we only
  // fire events. If gtag isn't up yet, arguments-objects pushed to dataLayer
  // are replayed by gtag.js when it loads, so nothing is lost. Fails silently.
  (function ga4Events() {
    function ev(name, params) {
      try {
        window.dataLayer = window.dataLayer || [];
        (window.gtag || function () { dataLayer.push(arguments); })('event', name, params || {});
        dbg('ga4 event', [name, params]);
      } catch (_) {}
    }

    // buy_click — SITE-WIDE: any link into Kenko's buy flow, labeled by plan
    var PLANS = { '33024': 'tease', '34596': 'routine' };
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (a && a.href.indexOf('/pricing/buy/') !== -1) {
        var m = a.href.match(/[?&]id=(\d+)/);
        ev('buy_click', { plan: (m && (PLANS[m[1]] || m[1])) || 'unknown', page: location.pathname });
      }
    }, true);

    // /intro and /intro-2 share the .iv-* markup; the variant is stamped on
    // every event as `page` so GA can compare the two landing pages directly.
    var introPath = location.pathname.replace(/\/$/, '');
    if (introPath !== '/intro' && introPath !== '/intro-2') return;
    function iev(name, params) {
      params = params || {};
      params.page = introPath;
      ev(name, params);
    }

    // /intro element events — delegated on document so they survive React
    // re-renders (never touch the iv-rev className, see BBLIntro notes).
    document.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      var el;
      if (t.closest('.iv-play')) iev('intro_video_play', { video: 'hero' });
      else if (t.closest('.iv-car')) iev('intro_video_play', { video: 'megaformer' });
      else if ((el = t.closest('.iv-q-btn'))) {
        // fires on every toggle (open and close); GA-side, read unique users
        var s = el.querySelector('span');
        iev('intro_faq_toggle', { question: s ? s.textContent.slice(0, 60) : '' });
      }
      else if (t.closest('a.iv-hero-get')) iev('intro_hero_cta', { cta: 'get_started' });
      else if (t.closest('a.iv-hero-alt')) iev('intro_hero_cta', { cta: 'free_first_look' });
      else if ((el = t.closest('a.iv-btn-bar'))) iev('intro_bar_cta', { cta: /iv-look/.test(el.href) ? 'free_first_look' : 'claim_offer' });
    }, true);

    // intro_section_view — once per section per pageview, at 30% visibility.
    // Answers "how far down the pitch do people get" as a GA funnel.
    function watchSections() {
      var seen = {};
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && !seen[en.target.id]) {
            seen[en.target.id] = 1;
            iev('intro_section_view', { section: en.target.id.replace('iv-', '') });
          }
        });
      }, { threshold: 0.3 });
      ['iv-what', 'iv-offers', 'iv-look'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) io.observe(el);
      });
    }
    // Component mounts after Framer hydration — poll briefly for the sections
    var tries = 0;
    (function arm() {
      if (document.getElementById('iv-offers')) return watchSections();
      if (++tries < 60) setTimeout(arm, 500);
    })();
  })();

  // --- UTM harvesting (added 2026-08-11) ---
  // Captures utm_* / fbclid from ad and boosted-post links, persists the
  // attribution for 30 days, and beacons two event types to the bbl-utm
  // Cloudflare Worker (D1-backed):
  //   landing       → once per landing that carries utm_* or fbclid
  //   booking_route → every Kenko iframe route an *attributed* visitor
  //                   reaches (deduped per route per session). Lets us see
  //                   how deep into the booking funnel each campaign gets;
  //                   once we learn Kenko's confirmation route name, the
  //                   report can call those conversions.
  // Report: https://bbl-utm.jasonjaclyn2017.workers.dev/report?token=...
  // Fails silently on storage/network errors — must never break the site.
  (function utmHarvest() {
    var ENDPOINT = 'https://bbl-utm.jasonjaclyn2017.workers.dev/hit';
    var ATTR_TTL_MS = 30 * 864e5;
    function store(area, key, val) { try { if (val === undefined) return area.getItem(key); area.setItem(key, val); } catch (_) { return null; } }
    function randId() {
      try { var a = new Uint32Array(2); crypto.getRandomValues(a); return a[0].toString(36) + a[1].toString(36); }
      catch (_) { return String(Date.now() % 1e9); }
    }
    var visitor = store(localStorage, 'bblVisitor');
    if (!visitor) { visitor = randId(); store(localStorage, 'bblVisitor', visitor); }
    var session = store(sessionStorage, 'bblSession');
    if (!session) { session = randId(); store(sessionStorage, 'bblSession', session); }

    var qs = new URLSearchParams(location.search);
    var incoming = null;
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
      var v = qs.get(k);
      if (v) { incoming = incoming || {}; incoming[k] = v; }
    });
    var fbclid = !!qs.get('fbclid');
    // fbclid with no utm_* still means "arrived from a Meta ad/boost click"
    if (!incoming && fbclid) incoming = { utm_source: 'facebook', utm_medium: 'fbclid' };

    var attr = null;
    try { attr = JSON.parse(store(localStorage, 'bblUTM') || 'null'); } catch (_) {}
    if (attr && (!attr.ts || Date.now() - attr.ts > ATTR_TTL_MS)) attr = null;
    if (incoming) {
      attr = { params: incoming, fbclid: fbclid, ts: Date.now(), landing: location.pathname };
      store(localStorage, 'bblUTM', JSON.stringify(attr));
    }
    window.bblUTM = attr;

    function send(payload) {
      try {
        payload.visitor = visitor;
        payload.session = session;
        if (attr) {
          var p = attr.params || {};
          payload.utm_source = p.utm_source; payload.utm_medium = p.utm_medium;
          payload.utm_campaign = p.utm_campaign; payload.utm_content = p.utm_content;
          payload.utm_term = p.utm_term; payload.fbclid = attr.fbclid;
        }
        var body = JSON.stringify(payload);
        dbg('utm send', payload);
        if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
        fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
      } catch (_) {}
    }

    if (incoming) send({ event: 'landing', page: location.pathname, referrer: document.referrer });

    // Funnel tracking: watch the Kenko booking iframe's RouteChanged
    // messages (own listener — independent of the overlay handler below).
    // Attributed visitors only, one beacon per route per session.
    if (attr) {
      window.addEventListener('message', function (e) {
        try {
          var iframe = document.querySelector('iframe[name="studioyou-iframe"]');
          if (!iframe || e.source !== iframe.contentWindow) return;
          var data = typeof e.data === 'object' ? e.data : JSON.parse(e.data);
          if (!data || data.type !== 'RouteChanged' || !data.message || typeof data.message.path !== 'string') return;
          var route = data.message.path.split('?')[0];
          var seenKey = 'bblUTMRoutes';
          var seen = (store(sessionStorage, seenKey) || '').split('|');
          if (seen.indexOf(route) !== -1) return;
          seen.push(route);
          store(sessionStorage, seenKey, seen.join('|'));
          send({ event: 'booking_route', page: location.pathname, route: route });
        } catch (_) {}
      });
    }
  })();

  // The header is dark on every page EXCEPT the two light-background pages.
  // Defined up here because the pre-paint background below needs it too.
  // Trade-off: rename Schedule/Memberships and their header silently goes dark.
  var LIGHT_PATHS = ['/schedule', '/memberships'];
  // Ad landing pages that hide the site nav entirely (no exits above the fold).
  var HIDE_HEADER_PATHS = ['/intro', '/intro-2'];
  function normalizedPath() {
    var p = location.pathname.replace(/\/+$/, '');
    return p === '' ? '/' : p;
  }

  // --- Pre-paint document background ---
  // Header links carry the HeaderLinkNav override (location.href = ...), so
  // header navigation is a full document load. A new document's first paint
  // starts from the browser's white default, which reads as a white blink
  // when the destination page is near-black (/calendar et al). Setting the
  // root element's background at script init runs before first paint, so the
  // blink is dark-to-dark (or cream-to-cream for the light pages) instead.
  //
  // NOTE: this replaces the old SPA_PATHS navigate-intercept, which was
  // REMOVED in 2026-08-09.5. The Framer runtime shipped with the 2026-08-09
  // publish no longer re-renders after a foreign e.intercept() — verified on
  // both staging and production: URL updated, old page stayed rendered.
  // Full reloads are back to being the honest behavior; this pre-paint plus
  // the overlay fast-path keep them visually quiet.
  function updateDocBg() {
    document.documentElement.style.backgroundColor =
      LIGHT_PATHS.indexOf(normalizedPath()) === -1 ? '#0D0C0B' : 'rgb(210,205,194)';
    document.documentElement.classList.toggle(
      'bbl-hide-header', HIDE_HEADER_PATHS.indexOf(normalizedPath()) !== -1);
  }
  updateDocBg();
  window.addEventListener('bbl-nav', updateDocBg);
  window.addEventListener('popstate', updateDocBg);

  // The wrapper only propagates iframe → parent hash; parent hash changes
  // never make it back into the iframe. The hashchange listener below bridges
  // that gap for same-document fragment navs (our NAV_INTERCEPTS anchors,
  // intra-page deep links like Claim Intro Offer) by pointing iframe.src at
  // the new route directly.
  var IFRAME_ORIGIN = 'https://bodybylagreesociety.onbookee.com';
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
  // the hashchange listener updating iframe.src) instead of letting
  // the click reach onbookee — avoiding the ~1s gap before onbookee sends
  // ShowOrigin/RouteChanged. Position values are CSS strings applied as
  // inline styles to the intercept element (which lives inside a wrapper
  // that mirrors the iframe's rect). Use any CSS units: px, %, calc().
  //   pages:        optional array of parent pathnames; omitted = all pages.
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
  // (re-measured 2026-08-10 — onbookee's label widths drifted)
  //   Classes               x=0   w=56
  //   Sauna Booking         x=75  w=112
  //   Certifications        x=206 w=98
  //   BBL Society Essentials x=323 w=75
  //   Membership            x=415 w=100
  // Right cluster (cumulative offset from header right, w/ 0 gap):
  //   Login/Signup          right=0   w=95
  //   Cart                  right=95  w=40  h=58
  // calc(50% - 560px + X) positions an element X pixels right of the
  // centered 1120px header's left edge; mirrored for right offsets.
  // Below 844px the layout wraps and these values are wrong — minWidth
  // gates them out at narrower viewports.
  // Pages that legitimately host the full-page booking embed. Intercepts
  // are scoped here because Framer does NOT unmount the old page's embed
  // on SPA nav (ghost iframe persists in the DOM), so iframe presence
  // alone can't tell us we've left an embed page — observed 2026-08-10:
  // wrapper survived a /schedule -> /calendar nav and ate the calendar's
  // month-arrow clicks.
  var EMBED_PAGES = ['/schedule', '/memberships'];
  var NAV_INTERCEPTS = {
    classes: {
      onbookeePath: '/class-schedule/r/2094',
      pages: EMBED_PAGES,
      minWidth: 844,
      style: { top: '0', left: 'calc(50% - 560px)', width: '56px', height: '59px' }
    },
    sauna: {
      onbookeePath: '/appointment/r/2094',
      pages: EMBED_PAGES,
      minWidth: 844,
      style: { top: '0', left: 'calc(50% - 485px)', width: '112px', height: '59px' }
    },
    certifications: {
      onbookeePath: '/courses/r/2094',
      pages: EMBED_PAGES,
      minWidth: 844,
      style: { top: '0', left: 'calc(50% - 354px)', width: '98px', height: '59px' }
    },
    essentials: {
      onbookeePath: '/products/r/2094',
      pages: EMBED_PAGES,
      minWidth: 844,
      style: { top: '0', left: 'calc(50% - 237px)', width: '75px', height: '59px' }
    },
    membership: {
      onbookeePath: '/pricing/r/2094/loc/2344?group=0',
      pages: EMBED_PAGES,
      minWidth: 844,
      style: { top: '0', left: 'calc(50% - 145px)', width: '100px', height: '59px' }
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

  // Fragment-only navigations (our NAV_INTERCEPTS anchors, intra-page deep
  // links) are same-document natively — no reload to fight. All we need to
  // do is point the iframe at the new route. hashchange fires AFTER the URL
  // has updated, so location.hash IS the destination. The TTL guard filters
  // out wrapper-driven hash echoes: if the iframe emitted this route within
  // the last IFRAME_ROUTE_HISTORY_TTL_MS, the parent hash change is the
  // wrapper catching up and the iframe is already there. Older history
  // entries do NOT block — they're stale destinations the user is free to
  // re-navigate to (e.g. via our NAV_INTERCEPT anchors).
  //
  // NOTE 2026-08-09.5: this replaces the navigate-event intercept (see the
  // pre-paint background comment near the top). Cross-page navs and no-hash
  // header reset clicks are plain full reloads again — the iframe boots to
  // the destination via the wrapper's own hash-precedence handling.
  // NOTE 2026-08-10.7: the wrapper ALSO watches the parent hash and
  // SPA-navigates the iframe there itself — observed RouteChanged carrying
  // the destination route 24ms after an intercept click. Forcing iframe.src
  // here therefore reloaded a page the iframe had already reached, causing
  // the flash-then-overlay dance. New approach: give the wrapper
  // HASH_SYNC_GRACE_MS to report the target route via RouteChanged; only if
  // it doesn't arrive do we force the reload (with overlay). Fast SPA navs
  // get no overlay at all — the height===331 trigger still covers slow ones.
  var HASH_SYNC_GRACE_MS = 400;
  var pendingHashSync = null; // { hash, timer }
  function cancelPendingHashSync(why) {
    if (!pendingHashSync) return;
    dbg('hash sync handled by wrapper', { hash: pendingHashSync.hash, why: why });
    clearTimeout(pendingHashSync.timer);
    pendingHashSync = null;
  }
  window.addEventListener('hashchange', function () {
    var iframe = document.querySelector('iframe[name="studioyou-iframe"]');
    if (!iframe) return;
    if (!location.hash || location.hash.indexOf('#/') !== 0) return;
    if (isRecentlyEmittedRoute(location.hash)) return;
    var hash = location.hash;
    var target = IFRAME_ORIGIN + hash.slice(1);
    if (pendingHashSync) clearTimeout(pendingHashSync.timer);
    pendingHashSync = {
      hash: hash,
      timer: setTimeout(function () {
        pendingHashSync = null;
        dbg('sync iframe on hashchange (wrapper did not)', { target: target });
        // The outgoing onbookee document stays alive for a beat after src
        // is set and keeps sending ReceiveMyHeight — e.source ===
        // contentWindow matches both documents, so those stale heights
        // would schedule a hide that fires before the new document boots,
        // exposing onbookee's loader. reloadInFlight suppresses hide
        // scheduling until the iframe's load event.
        reloadInFlight = true;
        showOverlay('sync-iframe');
        iframe.src = target;
      }, HASH_SYNC_GRACE_MS)
    };
    dbg('hashchange: waiting for wrapper to sync', { hash: hash });
  });

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
  s.textContent = '#bbl-overlay{position:fixed;left:0;right:0;bottom:0;top:0;background:rgb(209,203,193);z-index:9;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s ease}#bbl-overlay.visible{opacity:1;pointer-events:auto;transition:opacity .1s ease}'
    // Contained mode: when the booking iframe lives inside an element marked
    // data-bbl-overlay-scope (e.g. the /calendar page's embed wrapper), the
    // overlay is re-parented into that element and covers only it instead of
    // the whole viewport. border-radius:inherit keeps the wrapper's rounded
    // corners; the svg cap stops the 800px megaformer from overflowing
    // narrow wrappers.
    + '#bbl-overlay.bbl-overlay-contained{position:absolute;border-radius:inherit}'
    + '#bbl-overlay.bbl-overlay-contained svg{max-width:70%}';
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

  // True while a hashchange-driven iframe.src reload is in flight. Set in
  // the hashchange handler, cleared on the iframe's load event (the old
  // document is gone by then, so later messages are the new document's).
  // While set, hide *scheduling* is suppressed — the outgoing document's
  // stale ReceiveMyHeight messages would otherwise hide the overlay in the
  // gap before the new document's first ShowOrigin (~166ms observed).
  // The OVERLAY_FAILSAFE_MS timer still hides directly and clears the flag,
  // so a navigation that never fires load can't strand the overlay.
  var reloadInFlight = false;

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
    reloadInFlight = false;
    clearTimeout(overlayFailsafe);
    var iframe = document.querySelector('iframe[name="studioyou-iframe"]');
    if (iframe) iframe.style.visibility = 'visible';
    requestAnimationFrame(function () {
      overlay.classList.remove('visible');
    });
  }

  // Re-parent the overlay depending on where the iframe lives. Inside a
  // data-bbl-overlay-scope container (lazy-mounted embeds like /calendar's
  // booking section) → overlay absolute inside that container. Anywhere else
  // (full-page embeds: /schedule, /memberships) → overlay fixed on <body>.
  // The re-append is also self-healing: if React unmounted a scoped wrapper
  // and took the overlay node with it, the next watchIframe puts it back.
  function updateOverlayScope(iframe) {
    var scope = iframe && iframe.closest ? iframe.closest('[data-bbl-overlay-scope]') : null;
    if (scope) {
      if (getComputedStyle(scope).position === 'static') scope.style.position = 'relative';
      if (overlay.parentNode !== scope) scope.appendChild(overlay);
      overlay.classList.add('bbl-overlay-contained');
    } else {
      if (overlay.parentNode !== document.body) document.body.appendChild(overlay);
      overlay.classList.remove('bbl-overlay-contained');
    }
  }

  function watchIframe(iframe) {
    dbg('watchIframe', { src: iframe.src });
    updateOverlayScope(iframe);
    // Lazy-mounted embeds create #studioyou-embed after script init, so the
    // scrollIntoView neutralization at the top of this file missed them.
    // Re-apply here: StudioYouEmbed calls scrollIntoView on every
    // RouteChanged, which would otherwise yank the page down to the booking
    // section whenever the iframe navigates internally.
    var embedHost = document.querySelector('#studioyou-embed');
    if (embedHost) embedHost.scrollIntoView = function () {};
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
      // Old document is gone — messages from here on are the new one's.
      reloadInFlight = false;
    });
  }

  var existing = document.querySelector('iframe[name="studioyou-iframe"]');
  if (existing) {
    dbg('existing iframe at script init', { src: existing.src });
    watchIframe(existing);
  }

  new MutationObserver(function (mutations) {
    var sawRemoval = false;
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
      if (mutations[i].removedNodes.length) sawRemoval = true;
    }
    // Tear down the intercept wrapper when the iframe leaves the page —
    // bbl-nav fires before React unmounts the old page, so without this a
    // fixed-position wrapper survives SPA navs away from embed pages and
    // eats clicks on the destination (observed: /calendar's month arrows).
    // buildIntercepts() self-tears-down when no iframe is present.
    if (sawRemoval && interceptWrapper && !getStudioyouIframe()) {
      dbg('MutationObserver: iframe gone — removing intercept wrapper');
      buildIntercepts();
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
    // Cover onbookee's document boots only (since 2026-08-10.8). Show trigger
    // here is ShowOrigin — fires on every onbookee mount (incl. their
    // /pricing double-mount), never on pure-SPA navs. SPA navs are fast and
    // deliberately uncovered. Historical notes on the retired triggers:
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
    // NOTE 2026-08-10.8: RouteChanged and height===331 no longer trigger
    // showOverlay. Those fire on SPA navs (intercept clicks, onbookee's own
    // tab links), which are fast now that hashchange no longer forces a src
    // reload — verified with bblOverlayAlpha(0): worst artifact is a
    // sub-frame grey skeleton flash below onbookee's header. The overlay is
    // now purely a document-boot mask: ShowOrigin (document mount),
    // watchIframe-init (iframe added), and the sync-iframe reload fallback.
    if (data && data.type === 'RouteChanged') {
      // Backup hide for boot-time overlays when the new route's layout
      // height matches the previous (no visible change — observed on
      // /appointment/...?facility=&id= sub-routes): onbookee sends no
      // height and the overlay would hang until the failsafe. Any incoming
      // height resets this. Skipped while a src reload is in flight (the
      // outgoing document's RouteChanged must not hide the boot overlay).
      if (!reloadInFlight && overlay.classList.contains('visible')) {
        clearTimeout(heightDebounce);
        heightDebounce = setTimeout(function () { hideOverlay('route-no-height'); }, 500);
      }
    }
    if (data && data.type === 'ReceiveMyHeight') {
      if (reloadInFlight) {
        dbg('ReceiveMyHeight: ignored (reload in flight — stale old-document height)');
      } else {
        dbg('ReceiveMyHeight: scheduling hideOverlay in 300ms');
        clearTimeout(heightDebounce);
        heightDebounce = setTimeout(function () { hideOverlay('receivemyheight'); }, 300);
      }
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
      // Wrapper SPA-navigated the iframe to the hash we were about to force
      // — call off the pending src reload. Exact match only: a redirect
      // chain that lands elsewhere falls through to the forced reload.
      if (pendingHashSync && lastIframeRoute === pendingHashSync.hash) {
        cancelPendingHashSync('route-changed match');
      }
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
      if (def.pages && def.pages.indexOf(normalizedPath()) === -1) return;
      if (def.minWidth && window.innerWidth < def.minWidth) return;
      var a = document.createElement('a');
      // Same-page hash nav on whatever Framer page we're currently on.
      // The hashchange listener handles this by updating iframe.src.
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

  // The /calendar page used to hand off the chosen date here and we drew a
  // "Select date here" note + arrow pointing at Bookee's date picker. Retired
  // 2026-08-09: the picker moves with Bookee's own responsive reflows (it even
  // ends up beside the weekday strip on phones), so no fixed overlay stayed
  // aligned. The calendar now just links to /schedule with no date attached.

  // --- Dark header on home page at scroll top ---
  // On Framer's mobile breakpoint, the header's *default* styling is already
  // transparent bg + white text (designed to overlay hero video). Removing
  // .bbl-dark-header alone leaves it dark, so we also force a light state via
  // .bbl-light-header that mirrors the desktop cream/black defaults.
  var darkHeaderCSS = document.createElement('style');
  darkHeaderCSS.textContent =
    'html.bbl-hide-header .bbl-dark-header,html.bbl-hide-header .bbl-light-header{display:none!important}'
    +     '.bbl-dark-header{background-color:rgba(0,0,0,0.6)!important}'
    // At the very top of /calendar the header's 60%-black wash clipped the
    // calendar band's radial gradient at a hard horizontal line. Going fully
    // transparent there lets the gradient run under it; safe because that
    // page is dark all the way up, so the white header text stays legible.
    // Two classes deep so it outranks .bbl-dark-header's !important.
    + '.bbl-dark-header.bbl-clear-header{background-color:transparent!important}'
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
    // Footer logo. The footer sits on #1a1a1a and the logo artwork is near-black
    // on transparent, so unmodified it reads as a dark smudge. This CANNOT be
    // fixed from Framer's Effects panel: Framer applies the effect to the logo's
    // instance-container, which is an ancestor of [data-framer-name="Logo"], and
    // neutralizeLogoAncestorFilters() below force-clears filters on exactly those
    // ancestors (inline, !important, re-run on nav/resize). So the invert slider
    // is a no-op by construction — it was set and silently stripped, which is
    // what sent us hunting. Setting the filter on the img itself is immune: the
    // neutralizer only walks ancestors, never the img. That same fact means this
    // can't double-invert against a leftover Framer effect either.
    // Scoped by the "Action" wrapper, which is unique to the footer's logo
    // instance — the nav logo sits under "Logo and Hamburger" and keeps its
    // dark/light behaviour above. Verified to match exactly one img on both a
    // dark page (/sauna) and the light-header home page.
    + '[data-framer-name="Action"] [data-framer-name="Logo"] img{filter:brightness(0) invert(1)!important}'
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

  // Disable the browser's native image drag site-wide so it can't hijack
  // click-drag interactions (e.g. the Meet the Team drag-to-scroll). The CSS
  // covers WebKit/Blink; the dragstart guard covers Firefox and the rest.
  var noDragCSS = document.createElement('style');
  noDragCSS.textContent = 'img{-webkit-user-drag:none;}';
  document.head.appendChild(noDragCSS);
  document.addEventListener('dragstart', function (e) {
    if (e.target && e.target.tagName === 'IMG') e.preventDefault();
  });

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
      // Skip Framer's own editor chrome. On *.framer.app staging the editor
      // bar (#__framer-editorbar-container, z-index 2147483647) briefly
      // renders full-width at the top and used to win this scan, leaving the
      // real header unstyled — so the dark/light header never applied on
      // staging even though it worked in production.
      if ((divs[i].id || '').indexOf('__framer-') === 0) continue;
      var s = getComputedStyle(divs[i]);
      if (parseInt(s.zIndex) > 1000) continue;
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

  // The header is dark on every page EXCEPT the two light-background pages
  // (Schedule, Memberships) — LIGHT_PATHS, defined at the top of this file.
  // No page toggles between dark and cream on scroll — Home stays dark its
  // whole length too. Decided purely from the path: probing the DOM for the
  // page's own background can't work, because bbl-nav fires on pushState,
  // which happens *before* Framer mounts the new route, so the probe answers
  // for the page we just left. (/calendar is intentionally absent: dark is
  // the default, so the calendar page gets the dark header for free.)
  // /calendar additionally drops the header's background entirely while the
  // page is scrolled to the top, so the calendar band's gradient reads as one
  // continuous surface. Past the threshold the usual dark wash fades back in
  // (the header sits over calendar cells there and needs the separation).
  var CLEAR_HEADER_PATHS = ['/calendar'];
  var CLEAR_HEADER_MAX_Y = 20;

  function initDarkHeader(header) {
    function updateHeader() {
      var dark = LIGHT_PATHS.indexOf(normalizedPath()) === -1;
      header.classList.toggle('bbl-dark-header', dark);
      header.classList.toggle('bbl-light-header', !dark);
      header.classList.toggle(
        'bbl-clear-header',
        dark &&
          CLEAR_HEADER_PATHS.indexOf(normalizedPath()) !== -1 &&
          window.scrollY < CLEAR_HEADER_MAX_Y
      );
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
