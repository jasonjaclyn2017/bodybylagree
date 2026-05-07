# Framer SPA Navigation Fixes

This document explains two non-obvious behaviors implemented in `bbl-embed.js`:
why the script intercepts navigation events for certain pages, and why it
shows a custom loading overlay over the booking iframe.

Both exist to work around platform constraints — Framer's defensive routing
heuristics on one side, the third-party iframe's load behavior on the other.
Each is small in isolation; together they're what makes the site feel like
a single coherent app instead of a stack of full-page reloads.

---

## 1. Overriding Framer's hard-navigation for embed-bearing pages

### The problem

Framer's compiler treats pages differently based on what's inside them.
Pages built from native Framer components (text, images, sections — e.g.
`/about`, `/method`) get soft, in-place SPA navigation when linked to from
elsewhere on the site. Pages that contain HTML/iframe embeds (`/schedule`,
`/memberships`, `/pricing`) get full document reloads instead.

This isn't a per-link setting visible in the Framer UI. The compiler emits
two flavors of link wrapper:

```js
// Default link — does SPA navigation
R(L, { nodeId: '...', scopeId: '...' })

// Override applied to links pointing to embed pages — does hard navigation
R(L, { nodeId: '...', override: X, scopeId: '...' })

// where X is:
function X(e) {
  return memo((props, ref) => createElement(e, {
    ref,
    onClick: e => {
      e.preventDefault();
      const href = e.target.closest('a').href;
      location.href = href;   // ← forces a full document load
    },
    ...props
  }))
}
```

We confirmed this by inspecting the compiled bundle (`script_main.*.mjs`)
and enumerating all link registrations: every link to `/schedule`,
`/memberships`, `/pricing` had `override: X`; no link to `/about` or
`/method` did.

### Why Framer does it

Framer's compiler can't analyze what's inside an arbitrary HTML embed.
Some embeds register globals, attach window-level listeners that don't get
cleaned up on unmount, or mutate `document.head`. Forcing a full reload on
entry guarantees a fresh document state, which is the safe default for
unknown embed contents.

It's a defensible call — over-pessimistic but always correct. For our
specific embeds (a single iframe loading the onbookee booking app, plus a
small wrapper that handles a postMessage handshake), fresh document state
isn't actually required, and the wrapper has been hardened with explicit
unmount cleanup so it tolerates SPA remounts.

### Cost of accepting the default

Hard-nav between `/` and `/schedule` means:

- The current document is torn down. All scripts re-execute on the new
  page (Kenko Chatbox, Framer's runtime, our `bbl-embed.js`).
- A few hundred milliseconds of blank time during the transition.
- Console and network logs are cleared (frustrating during development).
- Any in-progress overlays or transitions on the old page are interrupted
  visibly.

By contrast, intra-Framer SPA nav (e.g. clicking About from home) is
visually instantaneous and preserves all script state.

### The fix

The Navigation API gives us a hook that fires *before* a navigation
actually begins, with the option to convert a cross-document navigation
into a same-document one:

```js
navigation.addEventListener('navigate', e => {
  if (!e.canIntercept) return;
  const url = new URL(e.destination.url);
  if (url.origin !== location.origin) return;
  if (!['/schedule', '/memberships', '/pricing'].includes(url.pathname)) return;
  e.intercept({ handler: () => Promise.resolve() });
});
```

When `X`'s `location.href = href` runs, the browser begins a cross-document
navigation. The `navigate` event fires. We call `e.intercept()` synchronously
in the handler, which:

1. Cancels the cross-document navigation (the document doesn't tear down).
2. Pushes the new URL to history.
3. Runs our handler (a no-op).
4. Fires a `navigate` event that Framer's *own* runtime listens for —
   which causes Framer's router to render the destination page in place.

The result is identical to what `/about` and `/method` get for free:
soft, in-place navigation with no flash, no script re-init, no Kenko
reload.

### Why this works structurally

`X`'s `e.preventDefault()` only stops the default `<a>` click behavior.
It doesn't stop the explicit `location.href = href` it issues afterward,
which is a fresh navigation owned by the navigation pipeline. There's no
way for `X` to opt out of `navigate` event interception from outside that
pipeline. Once we attach our listener, we can convert any matching
navigation regardless of how it was triggered (link click, scripted
location assignment, programmatic history call).

### Browser support

The Navigation API is available in:

- Chrome / Edge 102+ (mid-2022)
- Safari 17.4+ (early 2024) — including iOS
- Firefox: not yet (behind a flag in nightly)

For browsers without it, the listener is feature-gated and silently does
nothing. Those users get the existing hard-reload behavior, which is
functionally correct (just less smooth). The overlay's path-based
fast-path (see §2) keeps the experience tolerable in that fallback case.

### Companion change: Code Component lifecycle

Once SPA nav is enabled, the same Code Component (`EmbedTest`) gets
mounted and unmounted as users navigate between embed pages. The original
implementation didn't clean up after itself:

- `new StudioYouEmbed(...)` attached `message`, `pageshow`, `hashchange`,
  `scroll` listeners to `window`. None were removed on unmount.
- The script tag was appended on every mount, redeclaring the
  `StudioYouEmbed` class (which throws a `SyntaxError` on second load).
- Each instance held a reference to its iframe, which gets re-mounted
  inside `#studioyou-embed` on each entry.

The fixed component (in Framer's Code editor) does three things:

1. Detects whether `StudioYouEmbed` is already in the global lexical
   environment via `typeof StudioYouEmbed !== "undefined"` and skips the
   script load if so. (Note: class declarations from non-module scripts
   bind to the *global lexical environment*, not `window`, so
   `window.StudioYouEmbed` is always `undefined`. Bare reference works.)
2. Captures the instance reference at construction time.
3. On unmount, removes all four window-level listeners the wrapper
   attached and detaches the iframe from the DOM.

Without this, repeated SPA navigation would accumulate stale listeners
and leak instances. With it, the listener count and DOM iframe count
stay flat across arbitrary navigation cycles.

---

## 2. Custom overlay covering the iframe load

### The problem

The booking iframe loads from `bodybylagreesociety.onbookee.com`. From
the moment it's appended to the DOM until it's fully rendered (a window
of typically 0.5-1.5 seconds, longer on slow connections), the user sees:

- Initial blank/white iframe area
- A flash of unstyled or default-styled content as onbookee's framework boots
- Often a brief "loading" indicator that's onbookee-branded, not BBL-branded
- The final rendered content snapping into place

That sequence is jarring on a polished marketing site. It's especially
bad on first visit when the embed script hasn't been cached, but even
on warm caches the iframe contents take time to render.

### The fix

A full-screen overlay (`#bbl-overlay`) sits in front of the iframe with:

- A solid background in the site's neutral color
- A centered SVG of a Megaformer (the Lagree fitness equipment) with the
  carriage animating left-to-right and back, mirroring the actual machine
  motion that defines the workout — on-brand, calm, in-context
- `z-index: 9` to cover the iframe but stay below the site's fixed
  header (which has `z-index: 10+`)

It's shown when:

- The iframe element is detected being added to the DOM (`MutationObserver`
  catches it as Framer renders the page) — `watchIframe` fires `showOverlay`
- The iframe fires its `load` event — second `showOverlay` (gated to skip
  the SVG clock reset if already visible, see below)
- On script init, if `location.pathname` matches `/schedule` or
  `/pricing`, the overlay is shown immediately as a "fast path" — even
  before the iframe element exists in the DOM. This handles direct
  navigation (typed URL, bookmark) and the legacy hard-reload fallback.

It's hidden when:

- The iframe sends `ReceiveMyHeight` via `postMessage` (signals the
  content has rendered and the wrapper has measured it). Hide is debounced
  300ms after the message because multiple `ReceiveMyHeight` messages
  often fire in quick succession; the debounce ensures we hide once,
  after the burst settles.
- Failsafe timeout: 5 seconds after `showOverlay` is called, if no
  `ReceiveMyHeight` arrived. Without this, a stalled iframe could leave
  the overlay covering the screen permanently with no way for the user to
  recover.

### SVG animation timing

The carriage uses SMIL `animateTransform`. SMIL clocks start at page
load and run continuously, which means by the time we show the overlay,
the animation may be mid-cycle. To make the animation look intentional
("starts when the overlay appears"), we call `svg.setCurrentTime(0)` to
reset the clock — but only on a hidden→visible transition, not on every
`showOverlay` call. Each navigation triggers `showOverlay` twice (once
from `MutationObserver`, once from iframe `load`); resetting the clock
on the second one would visibly jolt the user mid-animation.

The bounce animation itself is symmetric with no holds — pure
left-right-left motion at 3-second cycle:

```svg
values="79,16.5;184,16.5;79,16.5"
keyTimes="0;0.5;1"
dur="3s"
```

Earlier iterations had a 0.8-second hold at the right end, which created
a "stuck" feeling whenever the overlay was shown during that window.

### Path-based fast-path nuance

The fast-path-on-init check is gated by pathname (`/schedule`, `/pricing`).
This is intentional even though we also have SPA navigation now: the
fast-path covers the case where a user lands directly on those pages
(typed URL, bookmark, Google search result, share link). The SPA
intercept doesn't apply to those cases because there's no prior page to
intercept *from* — the initial document load IS the navigation.

Direct landings show the overlay before the iframe paints; SPA navs show
the overlay when `MutationObserver` detects the iframe being mounted.
Together they cover every entry path into the embed pages.

---

## Summary

| Concern | Without the fixes | With the fixes |
|---|---|---|
| Click Schedule from home | Full document reload (~500ms blank, scripts re-run, console clears) | Soft SPA nav (instant URL change, in-place render, scripts continue) |
| Initial iframe paint | User sees onbookee's loading flash | Brand overlay with carriage animation |
| Direct URL load | User sees brief blank before iframe → onbookee flash → content | Brand overlay covers the entire iframe boot sequence |
| Stalled iframe | User stuck on loading indefinitely | 5s failsafe hides overlay so the page stays usable |
| Repeated navigation | Listeners accumulate, multiple iframes inside container, stale message handlers throw errors | Component cleanup keeps state flat |

Both fixes are layered: they degrade gracefully where the platform
support isn't there, and they reinforce each other (the overlay covers
the gap on hard-nav fallback; the lifecycle cleanup makes SPA remounts
safe). Removing either alone leaves the user with a visibly worse
experience; together they make the embed pages feel like first-class
parts of the site rather than third-party drop-ins.
