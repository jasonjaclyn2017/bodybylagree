# Framer Fixes

Three workarounds for Framer platform behaviors that produce a worse
experience than the rest of the site warrants. Each is implemented in
`bbl-embed.js` (loaded as a body script on every page) plus, where noted,
companion changes inside Framer.

---

## 1. Hide-on-scroll header replaces Framer's "On Scroll Down"

Framer's built-in **On Scroll Down** animation hides the header any time
the page scrolls down by any amount, with no offset or velocity controls.
On mobile, the iOS rubber-band bounce at the top of the page
counts as a downward scroll, so the header would flicker out and back in
every time a user finished scrolling up.

**Fix:** disable Framer's animation; reimplement in a body script with
sane thresholds. Hide only when `scrollY > 100` *and* the user moved
down more than 5px since the last sample. Always show within 100px of
the top, which makes bounce-induced micro-scrolls a no-op. Transitions
at 200ms — fast enough not to linger, slow enough to read as
intentional.

```js
(function () {
  // Adjust selector to match your site's header element
  var header = document.querySelector('[data-framer-name="Header"]');
  if (!header) return;

  var SHOW_THRESHOLD = 100;  // always-show zone near the top
  var DELTA = 5;             // ignore micro-scrolls

  var style = document.createElement('style');
  style.textContent = '.hdr-hidden{transform:translateY(-100%)!important}';
  document.head.appendChild(style);

  header.style.transition = 'transform 0.2s ease';
  var lastY = window.scrollY;
  window.addEventListener('scroll', function () {
    var y = window.scrollY, dy = y - lastY;
    if (y <= SHOW_THRESHOLD) header.classList.remove('hdr-hidden');
    else if (dy > DELTA) header.classList.add('hdr-hidden');
    else if (dy < -DELTA) header.classList.remove('hdr-hidden');
    lastY = y;
  }, { passive: true });
})();
```

---

## 2. Intercept Framer's hard-nav for embed pages

Framer's compiler tags links to pages containing iframe embeds
(`/schedule`, `/memberships`) with an override that forces a
full document reload (`location.href = href`) instead of SPA navigation.
The defensive default avoids potential issues with arbitrary embed
side-effects, but the cost is a visible reload, scripts re-executing,
dozens of extra network requests, and broken visual continuity.

**Fix:** the Navigation API's `navigate` event fires *before* a
cross-document navigation begins. Calling `e.intercept()` synchronously
in the listener converts it into a same-document navigation. Framer's
own router still listens for the same event and re-renders the
destination page in place. Net result: those pages now SPA-nav
identically to `/about` and `/method`.

Companion change: Code Component lifecycle (`EmbedTest.tsx`) — clean up
listeners and iframe on unmount, skip duplicate script load via
`typeof StudioYouEmbed !== "undefined"`. Without this, repeated SPA
mounts leak listeners and throw redeclaration errors.

Feature-gated to browsers with the Navigation API
(Chrome/Edge 102+, Safari 17.4+). Older browsers fall through to
hard-reload, masked by fix #3.

```js
(function () {
  if (!window.navigation || typeof navigation.addEventListener !== 'function') return;

  // Pages that Framer hard-navs into — typically those with iframe embeds
  var SPA_PATHS = ['/page-with-embed', '/another-embed-page'];

  navigation.addEventListener('navigate', function (e) {
    if (!e.canIntercept) return;
    try {
      var url = new URL(e.destination.url);
      if (url.origin !== location.origin) return;
      if (SPA_PATHS.indexOf(url.pathname) === -1) return;
      e.intercept({ handler: function () { return Promise.resolve(); } });
    } catch (_) {}
  });
})();
```

---

## 3. Brand overlay covers iframe loading

The booking iframe loads from `bodybylagreesociety.onbookee.com`. From
DOM insertion to first paint there's typically 0.5-1.5s during which
the user sees blank space, onbookee's main loading indicator, then additional
loading indicators for schedule, etc.  Off-brand and visually noisy.

**Fix:** a fixed-position overlay (`#bbl-overlay`) with a Megaformer
SVG (carriage bouncing left↔right at 3s cycle) covers the iframe area
in the site's neutral color. Shown when (a) `MutationObserver` detects
the iframe being added, (b) the iframe fires `load`, or (c) on direct
URL landing into `/schedule` or `/pricing` — the path-based fast-path
that runs before the iframe even exists in the DOM. Hidden 300ms after
the first `ReceiveMyHeight` postMessage from the wrapper (signals
content has measured); failsafe at 5s in case the message never
arrives.

```js
(function () {
  // Configure for your iframe + the postMessage type that signals "ready"
  var IFRAME_SELECTOR = 'iframe[name="my-embed"]';
  var READY_TYPE = 'ContentReady';                    // postMessage type from iframe
  var FAST_PATHS = ['/page-with-embed'];              // immediate-show on direct load
  var FAILSAFE_MS = 5000;

  var style = document.createElement('style');
  style.textContent = '#brand-overlay{position:fixed;inset:0;background:#fff;'
    + 'display:flex;align-items:center;justify-content:center;z-index:9;'
    + 'opacity:0;pointer-events:none;transition:opacity .2s}'
    + '#brand-overlay.visible{opacity:1;pointer-events:auto}';
  document.head.appendChild(style);

  var overlay = document.createElement('div');
  overlay.id = 'brand-overlay';
  overlay.innerHTML = '<div>Loading…</div>';          // replace with branded markup
  document.body.appendChild(overlay);

  var failsafe;
  function show() {
    overlay.classList.add('visible');
    clearTimeout(failsafe);
    failsafe = setTimeout(hide, FAILSAFE_MS);
  }
  function hide() { clearTimeout(failsafe); overlay.classList.remove('visible'); }

  if (FAST_PATHS.indexOf(location.pathname) !== -1) show();

  function watch(iframe) { show(); iframe.addEventListener('load', show); }
  var existing = document.querySelector(IFRAME_SELECTOR);
  if (existing) watch(existing);
  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++)
      for (var j = 0; j < muts[i].addedNodes.length; j++) {
        var n = muts[i].addedNodes[j];
        if (n.nodeType !== 1) continue;
        var iframe = (n.matches && n.matches(IFRAME_SELECTOR)) ? n
          : (n.querySelector && n.querySelector(IFRAME_SELECTOR));
        if (iframe) watch(iframe);
      }
  }).observe(document.body, { childList: true, subtree: true });

  window.addEventListener('message', function (e) {
    var data;
    try { data = typeof e.data === 'object' ? e.data : JSON.parse(e.data); }
    catch (_) { return; }
    if (data && data.type === READY_TYPE) setTimeout(hide, 300);
  });
})();
```
