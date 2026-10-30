# QAZFUEL V3 — QA evidence

Date: 30 October 2026. Scope: the isolated `v3/` application on branch `qazfuel-v3`; no production site or bot configuration changes.

## Result before preview publication

**Ready with known limitations for a local demonstration.** WebKit mobile regression: **16/16 user-journey cases passed, 206 assertions, zero uncaught application JavaScript errors**. The successful run completed at 2026-10-30T06:58:37Z. Functional assertions run against an in-process HTTP server serving the same `v3/` files. Screenshots and machine-readable results are temporary test output, not application assets.

## Observed defects fixed during development

- Original V3 did not include an interactive map; its Yandex URLs showed a pin rather than a driving route.
- Original delivery phone validation accepted arbitrary nonempty input; booking lacked details, repeat, saved truck, expiry transitions, and duplicate-submit protection.
- In the redesigned version, an entrance animation retained a CSS transform on the view. This made the supposedly fixed delivery slider scroll with its ancestor in WebKit. The view animation is now opacity-only; viewport assertions pass both initially and after scrolling.
- Leaflet marker focusability alone did not activate custom selection with Enter. Explicit Enter/Space handlers now select the point and zoom to it.
- Confirmed demo orders must transition to expired even while their details remain open. This boundary is covered by a live countdown test.

## Automated browser coverage

| Case | Evidence |
| --- | --- |
| Navigation and keyboard | Four primary screens, one visible view, active menu state, keyboard activation, heading focus |
| Nine map points | Nine markers/cards, all supplied exact coordinates, every point-to-booking selection, marker keyboard activation |
| Routes | All nine links use Yandex driving-route `rtext=~latitude,longitude` destinations; external route calculation itself is not mocked as verified |
| Truck booking | Required fields, diesel only, quick volumes and slider keyboard, review before save, double-click guard, saved truck |
| Order lifecycle | Pending status, persistence after reload, detail card, simulated confirmation, repeat without automatic save |
| Reservation lifetime | Exactly creation + 24 hours; confirmation preserves creation/expiry; expired requests cannot be confirmed |
| Live expiry | Confirmed request changes to expired with zero countdown while details remain open |
| Delivery | All fuel tabs, address/phone validation and phone normalization, optional comment, no plate requirement |
| Full tank | Toggle both directions, slider exits full-tank mode, unknown actual liters remain null, draft survives reload |
| Responsive UI | No horizontal overflow at 320/390/430/768 px; fixed volume panel remains on-screen after scroll; initial and scrolled 320×568 checks |
| Prices | Explicit unavailable state; source and region validation; manual example with default −2 ₽/l; result does not set order prices |
| Storage failures | Corrupt durable data preserved with saving blocked; quota/write failure keeps the form and permits retry |
| Map dependency failure | Blocking Leaflet produces a clear fallback; all nine points and selection still work |
| Geolocation | Synthetic permission denial, successful coordinates, removal; coordinates do not bypass required address |
| Telegram | Mocked SDK ready/expand, navigation BackButton, theme/viewport handlers, safe-area propagation |
| Local controls | Cancellation, confirmed clear-data dialog/cancel, empty history after clearing |
| Filters and accessibility | Truck/delivery filters, four accessible navigation names, reduced-motion behavior |

## Reproduction

```sh
cd tests
npm install
npx playwright install --with-deps webkit
cd ..
ENGINE=webkit node tests/e2e.cjs
# After preview publication:
BASE_URL=https://qazfuel-v3-preview.onrender.com ENGINE=webkit node tests/e2e.cjs
```

The script hosts `v3/` locally when `BASE_URL` is unset. `QA_OUTPUT` optionally sets an output directory; the default is the operating system temporary directory. Every test uses a fresh browser context. All test orders and status changes remain browser-local. The real Telegram SDK request is blocked only in deterministic tests; the Telegram integration case injects a mock. Browser flow tests can run with `ENGINE=chromium` or `ENGINE=firefox` when those engines are installed.

## Limits and required release checks

- WebKit is a Safari-like engine with mobile/touch viewport emulation. It is **not a physical iPhone/Safari or a live Telegram iOS WebView**. Native keyboard opening, actual Telegram permissions, device-specific safe areas, and OS-specific app handoffs still need physical-device validation.
- Chromium binaries could not be downloaded in this environment (official download returned invalid/truncated archives). WebKit downloaded via the official Microsoft fallback and ran successfully with its required OS libraries.
- The local suite captures uncaught application errors. Third-party resource/network errors and cloud-browser extension logs must be interpreted separately during live smoke testing.
- External OpenStreetMap tiles and Yandex route pages depend on network/provider availability. Local marker selection, exact coordinates, link destinations, and the fallback are verified; no routing-provider availability guarantee is implied.
- Market fuel API research is documented separately. No unverified market numbers or final prices are represented as current.
- There is no real order API, manager authorization, payment processing, or server-side Telegram `initData` validation in this static demonstration. Simulated confirmation never creates an actual reservation.
- A successful local run is not proof of Render deployment. Verify the preview service's branch, publish directory, commit, `Live` deploy status, HTTPS response, and post-publication browser flows before declaring the preview published.

## Post-publication verification and small fixes

First Render deploy fd1ba39d070f540d305b86ce17636a461122def0 reached Live (dep-dbi413942hec73f7dca0). Cloud Chromium opened the published UI and loaded six OpenStreetMap tile images. A representative Yandex route was actually calculated from Orenburg to the supplied Martuk coordinate; all nine URL destinations are separately covered by automation.

Live inspection found Telegram's standalone-browser SDK version 6.0 warns when BackButton is used. BackButton hooks are now gated to SDK >=6.1; modern Telegram functionality is retained. Zoom controls moved to the bottom-left so the northwestern markers are not hidden under them. Full local WebKit regression after these changes: 16/16 cases, 206 assertions passed at 2026-10-30T07:04:09Z.

Initial remote WebKit requests exceeded the old 8-second navigation timeout while curl and cloud Chromium loaded successfully. Test navigation budget is now 45 seconds (actions remain 8 seconds); this changes the test harness only. Final remote results are recorded in the completion report after the last deploy; no remote pass is inferred from a local pass.
