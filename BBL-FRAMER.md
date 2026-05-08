# BBL Framer Site — Notes for Future Claude

Quick reference for the bodybylagree.studio Framer site. Skim before
making changes; deeper context in `framer-fixes.md` and
`framer-spa-fixes.md`.

## Stack

- **Production site:** https://www.bodybylagree.studio (Framer-hosted)
- **Embed script:** `bbl-embed.js` in this folder, served from Vercel
  at https://bodybylagree.vercel.app/bbl-embed.js, loaded as a body
  script on every page (configured in Framer's Site Settings → Custom
  Code → End of `<body>`)
- **Repo:** github.com/jasonjaclyn2017/bodybylagree (this folder is its
  working tree)
- **Hosting:** Vercel auto-deploys on `git push` (~10s). Commit + push
  is the entire deploy flow; no separate publish step needed
- **Booking iframe:** loads from bodybylagreesociety.onbookee.com
  (third-party, no source access)

## Where things live

- `bbl-embed.js` — main embed script (overlay, SPA intercept,
  hide-on-scroll, header dark/light, logo filter neutralizer,
  iframe lifecycle)
- `framer-fixes.md` — concise three-fix overview with portable code
  snippets
- `framer-spa-fixes.md` — long-form rationale for the SPA + overlay
  fixes
- **In Framer UI (not in this repo):** two Code Components called
  `Schedule.tsx` (mounted on /schedule) and `pricing_page.tsx`
  (mounted on /memberships). Both load and instantiate the
  `StudioYouEmbed` wrapper. User has Framer edit access; you don't —
  guide them via instructions

## Critical gotchas

1. **Framer auto-tags links to embed-bearing pages with hard-nav
   override.** Pages containing iframes (`/schedule`, `/memberships`,
   `/pricing`) get a compiled `override: X` HOC that calls
   `location.href = href` on click, bypassing SPA. We override this in
   `bbl-embed.js` via `navigation.addEventListener('navigate', ...)`
   intercepting and converting to same-document. Feature-gated to
   browsers with the Navigation API; Firefox falls through to
   hard-reload.

2. **Class declarations from non-module scripts bind to the global
   lexical environment, NOT `window`.** When checking if onbookee's
   `embed/index.js` has been loaded:
   ```js
   typeof StudioYouEmbed !== 'undefined'  // ✅ correct
   window.StudioYouEmbed                  // ❌ always undefined
   ```
   This bit us when fixing the Code Component lifecycle. Both Code
   Components use the bare reference now.

3. **Wrapper's `buildIframePath` ignores `initialRoute` if
   `window.location.hash` is non-empty.** The hash takes precedence:
   ```js
   if (initialRoute) {
     return hash.length === 0 ? initialRoute : hash.slice(2)
   }
   ```
   So if the parent URL has a hash from a previous page or stale
   state, the iframe ignores the page-specific initialRoute and uses
   the hash. Keep the two Code Components' `initialRoute` arguments
   distinct (`null` for /schedule, `'pricing/r/2094/loc/2344?group=0'`
   for /memberships).

4. **iOS WebKit doesn't cancel stacked `filter: invert(1)`** the way
   desktop browsers do. The site has a logo container with
   `filter: invert(1)` from Framer; on iOS, applying another `invert(1)`
   on a child element doesn't restore the original color. Worked
   around by `neutralizeLogoAncestorFilters()` in `bbl-embed.js` —
   forces ancestor filters to `none` and applies a single direct
   filter to the img.

5. **iframe internal tab clicks cause a full iframe reload**, not SPA.
   You'll see onbookee's Kenko loader flash briefly before our overlay
   catches up. Unfixable without onbookee cooperation; accepted as-is.

6. **Console and network logs clear on hard-nav** for browsers without
   Navigation API support. Use DevTools "Preserve log" when debugging
   navigation flow. Our embed has `?bbl-debug` URL gate to enable
   verbose console output (`[bbl +Xms]` lines).

## Common tasks

- **Edit embed behavior:** modify `bbl-embed.js`, commit, push. Live
  on Vercel in ~10s. Hard-reload browser to see changes.
- **Edit Code Component (booking embed wrapper):** can't be done from
  this repo. User opens Framer → Code (`</>` in left sidebar) → finds
  `Schedule.tsx` or `pricing_page.tsx`. Cleanup logic and
  `initialRoute` argument live there.
- **Diagnose navigation issues:** add `?bbl-debug` to URL, watch
  console for `[bbl +Xms]` traces. The intercept logs every navigate
  event.
- **Roll back:** revert the commit, push. Vercel redeploys
  immediately.

## Things we tried that didn't work (don't redo)

- **jsDelivr for the embed script:** branch-ref caching had ~12hr lag
  with multi-edge divergence. Vercel is strictly better for this use
  case.
- **raw.githubusercontent.com:** ORB blocked it
  (`Cache-Control: max-age=300`, MIME type `text/plain`).
- **Replacing the Code Component with a plain HTML iframe to
  unlock SPA:** Framer hard-navs based on the *destination* page's
  contents, not the wrapper's implementation. Static iframe didn't
  help. Also broke ReceiveMyHeight handshake (the wrapper does
  parent-side handshake setup, not just iframe instantiation).
- **Click-intercept on link elements as the SPA workaround:** the
  Navigation API approach catches all navigation regardless of source
  (clicks, scripted, programmatic) and is structurally airtight in a
  way the click intercept isn't.
