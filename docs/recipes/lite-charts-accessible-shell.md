# Recipe: an accessible shell around a canvas chart -- label, keyboard, live region, data table

Cross-package: [`@zakkster/lite-charts`](https://www.npmjs.com/package/@zakkster/lite-charts)
(`crosshair`, `moveCrosshair`, `xScale`) + `@zakkster/lite-headless` primitives and
[`@zakkster/lite-table`](https://www.npmjs.com/package/@zakkster/lite-table) for the
text alternative.

A `<canvas>` is a black box to assistive tech: lite-charts paints ARIA onto its DOM
legend, but the plot itself has no role, no label, no keyboard, and no text
alternative. That is fine -- a chart library should stay presentation-only -- but a
back-office dashboard has to be operable and perceivable. This recipe builds the
accessibility layer AROUND the canvas from consumer-owned DOM, driven by the same
lite-signal facades everything else uses. Nothing here needs a change to lite-charts;
it is exactly the "a11y beyond the legend" its own roadmap defers, supplied from the
outside.

Four parts: (1) a labelled, focusable chart region; (2) keyboard exploration that
drives the crosshair; (3) an `aria-live` region announcing the focused point; (4) a
data-table alternative that IS the real accessible content.

Verified against `@zakkster/lite-charts` v1.19.0. The keyboard + live-region wiring
is exercised in `demo/charts-integration.html`.

## Install

    npm i @zakkster/lite-charts @zakkster/lite-headless @zakkster/lite-signal
    # optional, for the sortable/virtualized data table:
    npm i @zakkster/lite-table

## 1. A labelled, focusable region

Wrap the canvas host. Give it a role and a one-line summary, and make it a keyboard
stop. Use `role="application"` when you wire the arrow keys below (you are taking
over arrow semantics); use `role="img"` with a static `aria-label` if the chart is
NOT interactive.

    <figure class="chart" role="group" aria-labelledby="chart-title chart-desc">
      <figcaption id="chart-title">Requests and latency, last 24h</figcaption>
      <p id="chart-desc" class="visually-hidden">
        Interactive line chart. Use left and right arrows to move between points,
        Home and End to jump to the first or last, Escape to dismiss.
      </p>

      <!-- focusable interaction surface; arrow keys drive the crosshair -->
      <div id="chart-host" role="application"
           aria-label="Requests and latency time series" tabindex="0"></div>

      <!-- the live announcer (part 3) and the data table (part 4) go here -->
    </figure>

`.visually-hidden` is the standard clip pattern (a screen-reader-only class): 1px
clipped box, not `display:none` (which would hide it from AT too).

## 2. Keyboard exploration -> moveCrosshair

lite-charts has no "snap to index i" call, but `moveCrosshair(canvasX, canvasY)`
snaps to the nearest sample, and `xScale.map(value)` gives the canvas-local pixel of
a domain value. Compose them: keep a current index, and on each arrow move the
crosshair to that sample's pixel. The chart then updates the `crosshair` signal,
which feeds the announcer and (if present) the DOM tooltip -- one code path for mouse
and keyboard.

    const host = document.getElementById("chart-host");
    const rows = () => reqRows();            // primary series, sorted by x
    let idx = 0;

    function focusSample(i) {
        const r = rows();
        idx = i < 0 ? 0 : i >= r.length ? r.length - 1 : i;
        const px = chart.xScale.map(r[idx].x);       // canvas-local CSS pixel
        const midY = chart.canvas.clientHeight / 2;  // any y inside the plot
        chart.moveCrosshair(px, midY);               // -> fires crosshair signal
    }

    host.addEventListener("keydown", (e) => {
        switch (e.key) {
            case "ArrowRight": focusSample(idx + 1); break;
            case "ArrowLeft":  focusSample(idx - 1); break;
            case "Home":       focusSample(0); break;
            case "End":        focusSample(rows().length - 1); break;
            case "Escape":     chart.hideCrosshair(); return;
            default: return;             // let every other key through
        }
        e.preventDefault();              // only for keys we handled
    });
    host.addEventListener("blur", () => chart.hideCrosshair());

## 3. An aria-live announcer off the crosshair signal

One polite live region, updated from the crosshair. Because mouse hover and keyboard
both flow through `moveCrosshair` -> `crosshair`, this announces for both. Throttle
to the snapped INDEX so a mouse drag across one sample does not re-announce every
pixel.

    import { effect } from "@zakkster/lite-signal";   // if sharing one signal runtime
    // ...or chart.crosshair.subscribe((s) => {...}) -- both work; subscribe is
    // safest across package bundles.

    const live = document.getElementById("chart-live"); // <div aria-live="polite" class="visually-hidden">
    let lastIdx = -1;
    const offLive = chart.crosshair.subscribe((s) => {
        if (!s.visible) { lastIdx = -1; return; }
        if (s.snapIdx === lastIdx) return;              // announce once per sample
        lastIdx = s.snapIdx;
        live.textContent =
            fmtX(s.snapDomainX) + ": " +
            "requests " + reqRows()[s.snapIdx].y + " per second, " +
            "latency "  + latRows()[s.snapIdx].y + " ms";
    });

## 4. The data-table alternative (the real accessible content)

The canvas can never be fully conveyed as pixels; the accessible source of truth is a
table of the same rows. Keep it in the DOM (visually hidden, or revealed by a
"View as table" toggle -- sighted keyboard users benefit too). For a handful of
series a plain `<table>` with a `<caption>` and `<th scope>` is enough:

    <table class="visually-hidden">
      <caption>Requests and latency, last 24h</caption>
      <thead><tr><th scope="col">Time</th><th scope="col">Requests/s</th><th scope="col">Latency p95 (ms)</th></tr></thead>
      <tbody><!-- one <tr> per sample, generated from the same rows the chart reads --></tbody>
    </table>

For hundreds of rows or when you want sort/virtualization, render it with
`@zakkster/lite-table` instead -- it is the suite's data grid (lite-headless is
table-less on purpose), and its rows are already ARIA-correct. A "View as table"
`switch` (`@zakkster/lite-headless/switch`) that toggles `[hidden]` on the table lets
one component serve both the a11y fallback and a real feature.

## How the pieces share state

Everything reads or writes the SAME facades the rest of your dashboard uses:

- keyboard -> `moveCrosshair` -> `crosshair` signal -> announcer + DOM tooltip
- the data table + announcer read the same series rows the chart reads
- series show/hide (see the legend recipe) hides table columns too, if you bind both
  to `chart.seriesVisibility[i]`

> [!NOTE]
> **Pick the role deliberately.** `role="img" + aria-label` (a written summary) is
> correct for a static, non-interactive chart and needs no keyboard. The moment you
> add arrow-key exploration, the region is interactive -- use `role="application"`
> (or a focusable `role="group"`) so the arrow keys are yours, and ALWAYS pair it
> with the data table so a table-navigation user is not forced through the widget.

> [!WARNING]
> **`preventDefault` only on keys you handle.** Calling it unconditionally in the
> `keydown` traps Tab and breaks focus escape. Return early for unhandled keys (as
> above) so Tab, Shift+Tab, and screen-reader passthrough keys still work.

## See also

- `docs/recipes/lite-charts-tooltip.md` -- the DOM tooltip that shares this
  crosshair path (mouse + keyboard both drive it).
- `docs/recipes/lite-charts-legend.md` -- series visibility via checkbox-group;
  bind the same signal to hide table columns.
- lite-charts `llms.txt` -- `moveCrosshair`, `hideCrosshair`, `xScale.map`,
  the `crosshair` signal shape.
