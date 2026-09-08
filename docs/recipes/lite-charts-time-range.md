# Recipe: a date-range control and a theme toggle for a chart -- setView + refreshTheme

Cross-package: [`@zakkster/lite-charts`](https://www.npmjs.com/package/@zakkster/lite-charts)
(`setView` / `view` / `resetView`, time scale, `refreshTheme`) +
`@zakkster/lite-headless/datepicker` (range) + your app's theme toggle.

Two dashboard staples that lite-charts leaves to the consumer: a global date-range
control that drives the visible window, and re-coloring the chart when the app
switches light/dark. Both are one call each. The chart's `view` is a lite-signal you
write with `setView({ xMin, xMax })`; its colors are CSS variables re-resolved by
`refreshTheme()`.

Verified against `@zakkster/lite-charts` v1.19.0. The theme wiring mirrors the
light/dark toggle used in `demo/index.html`; the range wiring is exercised in
`demo/charts-integration.html`.

## Install

    npm i @zakkster/lite-charts @zakkster/lite-headless @zakkster/lite-signal

## 1. Date range -> setView

Enable `pan` or `zoom` at construction -- `setView` / `resetView` THROW otherwise
(fail-closed: no view facade exists unless you opted in). Use a time x-scale so the
domain is milliseconds.

    import { createLineChart } from "@zakkster/lite-charts";

    const chart = createLineChart({
        series: [{ name: "requests/s", color: "--series-1", data: () => rows() }],
        xScale: { type: "time" },
        zoom: true,                 // enables chart.view / setView / resetView
        pan: true,
    });
    chart.mount(document.getElementById("chart-host"));

A range datepicker picks `[start, end]`; convert to ms and set the window. `null` on
an axis follows the data domain, so leave y open:

    // datepicker range -> chart window
    function applyRange(startDate, endDate) {
        chart.setView({
            xMin: startDate.getTime(),
            xMax: endDate.getTime(),
            yMin: null, yMax: null,
        });
    }

    // preset buttons ("last 24h / 7d / 30d")
    const DAY = 86_400_000;
    function lastDays(n) {
        const now = Date.now();
        chart.setView({ xMin: now - n * DAY, xMax: now, yMin: null, yMax: null });
    }

    // "reset" -> back to the full data domain
    resetBtn.addEventListener("click", () => chart.resetView());

Wire the datepicker with the existing preset pattern -- see
`docs/recipes/date-range-presets.md` for the range + presets composition; this recipe
just adds the `setView` sink.

### Reflect pan/zoom gestures back into the control

If the user also pans/zooms with the mouse, `chart.view` updates. Subscribe to keep
the datepicker label in sync, so the control never lies about the window:

    const offView = chart.view.subscribe((v) => {
        if (!v || v.xMin == null) { rangeLabel.textContent = "All time"; return; }
        rangeLabel.textContent = fmtDate(v.xMin) + " -> " + fmtDate(v.xMax);
    });

## 2. Theme toggle -> refreshTheme

lite-charts resolves every color that is a CSS variable (`color: "--series-1"`,
axis/label colors) against the mounted container's computed style, and caches the
resolved value. When your app flips light/dark (e.g. toggling `data-theme` on
`<html>`, as `demo/index.html` does), the variables change but the chart is still
holding the old resolved colors -- call `refreshTheme()` to re-resolve and redraw.

    function applyTheme(mode) {
        document.documentElement.setAttribute("data-theme", mode); // your app's flip
        chart.refreshTheme();   // <- re-resolve --series-*, axis, label colors + redraw
    }

Define the series tokens in both palettes so they read well on each ground, exactly
like the demo's `:root` / `:root[data-theme="light"]` blocks:

    :root                      { --series-1: #7dd3fc; --series-2: #f5b942; }
    :root[data-theme="light"]  { --series-1: #0369a1; --series-2: #b45309; }

DOM companions built from lite-headless (the tooltip card, the checkbox-group legend,
the data table) are plain DOM and flip on their own; `refreshTheme()` is only for the
canvas.

> [!WARNING]
> **`setView` / `resetView` throw unless `pan` or `zoom` is set.** The view facade
> does not exist on a chart constructed without either -- that is deliberate (no
> signal, no listeners, zero cost when unused). Enable one at construction, or guard
> your calls.

> [!NOTE]
> **Programmatic `setView` does not recompute a brush.** If you also use brush
> selection, setting the view will not repopulate `brush.ids`; re-run your selection
> logic against the new window if you depend on it.

## See also

- `docs/recipes/date-range-presets.md` -- the datepicker range + preset buttons this
  recipe feeds into `setView`.
- `docs/recipes/lite-charts-tooltip.md` and `lite-charts-legend.md` -- the DOM
  companions that flip with the theme automatically.
- lite-charts `llms.txt` -- `view` / `setView` / `resetView`, `refreshTheme`, the
  time scale and shading engine.
