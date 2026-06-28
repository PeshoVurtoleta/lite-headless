# Browser test harness

Playwright tests for paths the node:test suite can't cover — anything that
needs real layout, real pointer geometry, or real focus events.

## What this covers

| Area | What the spec verifies |
| --- | --- |
| `menu.spec.js` | Safe-triangle keeps the submenu open during diagonal pointer crossing; sibling-enter closes the previous; ArrowRight opens the submenu and focuses its first child; ArrowLeft restores parent focus; outside click dismisses. |
| `slider.spec.js` | Track click jumps to clicked %; drag updates value continuously; `data-dragging` toggles correctly; `minStepsBetweenThumbs` actually prevents crossing during drag; keyboard ArrowRight increments. |
| `popover.spec.js` | Real-viewport flip when the placement would overflow; `boundary:"clipping"` walks the nearest overflow ancestor; Escape and outside click dismiss. |
| `datepicker.spec.js` | `data-today` on pinned today (2026-06-11); ArrowLeft past month boundary auto-switches view; PageDown strides a month; Enter picks; days→months→years drilldown via label clicks; prev/next strides by view unit. |

## What this does NOT cover

- Unit logic (state machines, value normalization, dismiss stack, ARIA
  attribute presence). `npm test` (node:test + happy-dom) owns those.
- Visual regression — no screenshots are taken (besides Playwright's
  on-failure trace).
- Cross-browser matrix beyond chromium. Uncomment the `firefox` /
  `webkit` projects in `playwright.config.js` for full coverage.

## Setup

```bash
npm install                       # installs @playwright/test
npx playwright install chromium   # one-time browser fetch (~150 MB)
# or:
npm run test:browser:setup
```

## Running

```bash
npm run test:browser              # full suite, headless
npm run test:browser:headed       # watch the browser
npm run test:browser:ui           # interactive picker UI
npm run test:browser -- menu      # only menu specs
npm run test:browser -- -g "safe-triangle"   # by test name
```

The fixture pages live under `fixtures/` and are loaded from a tiny
zero-dependency static server (`serve.mjs`) which Playwright's
`webServer` config starts automatically. The server serves the entire
repo so fixtures can import from `../../src/...`.

## Architecture

```
playwright.config.js     # chromium project + webServer pointing at serve.mjs
test-browser/
├── README.md             # this file
├── serve.mjs             # zero-dep static server (correct ESM MIME types)
├── fixtures/             # standalone HTML pages, one per primitive
│   ├── menu.html
│   ├── slider.html
│   ├── popover.html
│   └── datepicker.html
├── menu.spec.js
├── slider.spec.js
├── popover.spec.js
└── datepicker.spec.js
```

Each fixture imports its primitive from the source tree, builds the markup,
wires everything up, and exposes the resulting handle on `window.__menu` /
`window.__slider` / etc. — so specs can introspect state if needed via
`page.evaluate(() => window.__menu.root.value())`.

## When to write a browser test vs a unit test

- **Unit test (node:test)** is the default. Write it there if you can.
  Specifically: state-machine transitions, ARIA attribute presence,
  outside-click stack ordering, event listener cleanup, value
  normalization, focus restoration, anything not depending on layout.
- **Browser test** when the behavior under test reads real geometry
  (`getBoundingClientRect`), depends on real focus events crossing
  elements, or exercises pointer-move event sequences where the order
  and coordinates matter. The cost of a browser test is ~30× a unit
  test (real browser startup, real DOM construction), so be deliberate.
