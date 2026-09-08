# Recipe: a custom chart legend -- checkbox-group bound to series visibility

Cross-package: [`@zakkster/lite-charts`](https://www.npmjs.com/package/@zakkster/lite-charts)
(`seriesVisibility`, `setSeriesVisible`) + `@zakkster/lite-headless/checkbox-group`
(ARIA-correct multi-select with a select-all master).

lite-charts ships a DOM legend with click-to-toggle and real ARIA (`role="button"`,
`aria-pressed`), and it can be relocated (`LegendConfig.container`) or windowed
(`LegendConfig.virtualize`). Reach for THIS recipe when you want the legend to be
part of your design system -- styled with your tokens, laid out anywhere, combined
with a "show all" control, and toggling table columns alongside the chart. You turn
the built-in legend off and drive `seriesVisibility` from a lite-headless
`checkbox-group`.

The binding is two lines: a member per series, and `setSeriesVisible(i, checked)` on
change. The checkbox-group's select-all master gives you "show every series" for
free, and disabled members are excluded from it (so a locked-on series does not get
swept).

Verified against `@zakkster/lite-charts` v1.19.0 and
`@zakkster/lite-headless/checkbox-group`. Exercised in
`demo/charts-integration.html`.

## Install

    npm i @zakkster/lite-charts @zakkster/lite-headless @zakkster/lite-signal

## Turn off the built-in legend, render your own

Give each series a color that is a CSS variable, so the legend swatch and the chart
line read from the same token and flip together under a theme toggle.

    import { createLineChart } from "@zakkster/lite-charts";

    const SERIES = [
        { name: "requests/s",  color: "--series-1" },
        { name: "latency p95", color: "--series-2" },
        { name: "error rate",  color: "--series-3" },
    ];

    const chart = createLineChart({
        series: SERIES.map((s, i) => ({ name: s.name, color: s.color, data: () => rows(i) })),
        legend: false,          // <- we render the legend
    });
    chart.mount(document.getElementById("chart-host"));

Markup -- a `checkbox-group` with the select-all master and one member per series.
The swatch is a `<span>` painted with the series' CSS var:

    <lite-checkbox-group id="legend" aria-label="Series">
      <label><span data-select-all></span> All series</label>
      <label><span data-checkbox value="0"></span> <i class="sw" style="--sw: var(--series-1)"></i> requests/s</label>
      <label><span data-checkbox value="1"></span> <i class="sw" style="--sw: var(--series-2)"></i> latency p95</label>
      <label><span data-checkbox value="2"></span> <i class="sw" style="--sw: var(--series-3)"></i> error rate</label>
    </lite-checkbox-group>

## Bind visibility

Seed the members from the chart's current visibility, then mirror every change onto
the chart. `valuechange` carries the checked member values.

    import "@zakkster/lite-headless/checkbox-group/element";  // registers <lite-checkbox-group>

    const legend = document.getElementById("legend");

    // seed: reflect the chart's initial seriesVisibility into the checkboxes
    SERIES.forEach((_, i) => {
        const box = legend.querySelector(`[data-checkbox][value="${i}"]`);
        if (chart.seriesVisibility[i].peek()) box.setAttribute("checked", "");
    });

    // drive: checkbox state -> chart
    legend.addEventListener("valuechange", (e) => {
        const on = new Set(e.detail.values);              // checked values
        SERIES.forEach((_, i) => chart.setSeriesVisible(i, on.has(String(i))));
    });

That is the whole binding. The master paints `mixed` when only some series are on,
`true` when all are, and toggling it calls through to every (enabled) member, which
fires one `valuechange` -- so "show all" / "hide all" just works.

## Keep a series always on

Mark its member `disabled`. A disabled member is excluded from the select-all sweep,
so "hide all" leaves it visible and the master correctly shows `mixed`:

    <label><span data-checkbox value="0" checked disabled></span> requests/s (always shown)</label>

## Same signal, other consumers

`chart.seriesVisibility[i]` is a plain lite-signal you can also READ elsewhere: hide
the matching column in the data-table fallback
(`docs/recipes/lite-charts-accessible-shell.md`), or gray out a KPI `stat` card, by
reacting to the same signal. One source of truth for "is this series shown."

> [!NOTE]
> **Swatch color = series color = one token.** Define `--series-1..n` in your theme
> and use them BOTH as the lite-charts `color` and as the legend swatch background.
> After a theme switch call `chart.refreshTheme()` (see the time-range recipe) and
> the lines re-resolve; the swatches, being CSS, already have.

## See also

- `docs/recipes/lite-charts-accessible-shell.md` -- reuse this signal to hide table
  columns; the built-in legend's ARIA vs. your own.
- `docs/recipes/lite-charts-time-range.md` -- `refreshTheme()` on a theme toggle.
- The `checkbox` / `checkbox-group` scenes in `demo/index.html` for the tri-state
  and select-all master contract in isolation.
