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

**Fix:** disable Framer's animation; reimplement in `bbl-embed.js` with
sane thresholds. Hide only when `scrollY > 100` *and* the user moved
down more than 5px since the last sample. Always show within 100px of
the top, which makes bounce-induced micro-scrolls a no-op. Transitions
at 200ms — fast enough not to linger, slow enough to read as
intentional.

---

## 2. Intercept Framer's hard-nav for embed pages

Framer's compiler tags links to pages containing iframe embeds
(`/schedule`, `/memberships`, `/pricing`) with an override that forces a
full document reload (`location.href = href`) instead of SPA navigation.
The defensive default avoids potential issues with arbitrary embed
side-effects, but the cost is a visible reload, scripts re-executing,
and broken visual continuity.

**Fix:** the Navigation API's `navigate` event fires *before* a
cross-document navigation begins. Calling `e.intercept()` synchronously
in the listener converts it into a same-document navigation. Framer's
own router still listens for the same event and re-renders the
destination page in place. Net result: those three pages now SPA-nav
identically to `/about` and `/method`.

Companion change: Code Component lifecycle (`EmbedTest.tsx`) — clean up
listeners and iframe on unmount, skip duplicate script load via
`typeof StudioYouEmbed !== "undefined"`. Without this, repeated SPA
mounts leak listeners and throw redeclaration errors.

Feature-gated to browsers with the Navigation API
(Chrome/Edge 102+, Safari 17.4+). Older browsers fall through to
hard-reload, masked by fix #3.

---

## 3. Brand overlay covers iframe loading

The booking iframe loads from `bodybylagreesociety.onbookee.com`. From
DOM insertion to first paint there's typically 0.5-1.5s during which
the user sees blank space, then a flash of unstyled content, then
onbookee's own loading indicator, then the rendered schedule.
Off-brand and visually noisy.

**Fix:** a fixed-position overlay (`#bbl-overlay`) with a Megaformer
SVG (carriage bouncing left↔right at 3s cycle) covers the iframe area
in the site's neutral color. Shown when (a) `MutationObserver` detects
the iframe being added, (b) the iframe fires `load`, or (c) on direct
URL landing into `/schedule` or `/pricing` — the path-based fast-path
that runs before the iframe even exists in the DOM. Hidden 300ms after
the first `ReceiveMyHeight` postMessage from the wrapper (signals
content has measured); failsafe at 5s in case the message never
arrives.
