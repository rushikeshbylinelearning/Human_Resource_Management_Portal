# Localhost Lighthouse issues (11 Sep 2026)

Lighthouse on `npm run dev` cannot score well: Vite serves unminified MUI (~800KB) and react-router (~450KB). TBT and CLS are already 100. FCP/LCP stay red until those vendor files are production-minified.

| | 14:02 `:3000` | 14:24 `:3000` | 14:45 `:5173` | Production 12:06 |
|---|---|---|---|---|
| Performance | 55 | 58 | 56 | 61 |
| FCP / LCP | 7.0s / 14.2s | 3.0s / 6.8s | 4.0s / 8.8s | 3.3s / 3.9s |
| Payload | 17 MB | 6.9 MB | 8.1 MB | **1.0 MB** |
| Accessibility | 89 | 98 | 98 | 89 |

Production is the real user score. Localhost “Minify JavaScript” / unused MUI will keep failing until you run `npm run build && npm run preview` (or deploy).

Run Lighthouse in **Incognito**. Acrobat + NordVPN added ~400KB unused JS in every local run.

## Remaining audits and what to do

| Audit | Local | Production | Ideal solution |
|---|---|---|---|
| Minify JS / unused MUI+router | fail | pass (minify) | Measure production. Not fixable in Vite-dev |
| Unused JS pdfjs + jspdf on dashboard | n/a | **197KB + 111KB** | Do not modulepreload export/PDF chunks from the entry graph |
| Date pickers on dashboard | date-fns via HR chat | 72KB | Chat click-to-open; exclude datepickers from entry preload |
| SkeletonLoaders 94KB on every page | yes | in index | Tiny `PageFallbackSkeleton` in ProtectedRoute/App |
| MP3 sounds on dashboard | yes | yes | Create `Audio` on first play, not on import |
| Google Fonts round trip | yes | render-blocking | System font stack (already in theme) |
| Heading order | timer/name/clock as headings | h6 Your Week | `component="p"` / `h2` sections |
| robots.txt / bfcache | fail | fail | Intentional (private app + WebSocket) |
| HTTP/2 “Modern HTTP” | n/a | 1.2s savings | Enable HTTP/2 on the host (Apache/nginx), not app JS |
| Cache lifetimes | n/a | 99KB | Long-cache hashed `/assets/` in `.htaccess` |

## Code changes

- Vite never prebundles the 6.4MB MUI / Lucide icon barrels.
- Entry `modulePreload` no longer fetches pdfjs, jspdf, xlsx, date-pickers, or unused route chunks.
- Auth/route fallbacks use a small CSS skeleton instead of the 90KB `SkeletonLoaders` module.
- HR chat, profile skeleton, notification prompt, and sounds stay off first paint.
- Google Fonts stylesheet removed from `index.html`.
- Route prefetch starts on idle, not during first paint.
