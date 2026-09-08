# Recipe: a DOM tooltip for a canvas chart -- hover-card anchored to a data point

Cross-package: [`@zakkster/lite-charts`](https://www.npmjs.com/package/@zakkster/lite-charts)
(the `crosshair` signal + `xScale`) + `@zakkster/lite-headless/hover-card` (the DOM
surface + ARIA) + [`@zakkster/lite-floating`](https://www.npmjs.com/package/@zakkster/lite-floating)
(`virtualRef` -- a zero-alloc anchor with no DOM node).

lite-charts paints its default tooltip ON THE CANVAS. That keeps the library
headless-testable, but a canvas tooltip cannot hold real HTML, cannot inherit your
theme's CSS variables, and does no collision-aware flipping near a viewport edge. A
back-office dashboard usually wants the opposite: a themed DOM card that flips and
shifts. This recipe turns off the canvas tooltip and drives a lite-headless
`hover-card` from the chart's `crosshair` signal, anchored to the exact data point
by a lite-floating `virtualRef`.

The hard part -- anchoring an overlay to a point that has NO DOM element -- is
already solved: `hover-card.attachAnchor(el)` stores whatever you give it and hands
it to lite-floating's `createFloating`, which accepts a virtual element
(`{ getBoundingClientRect }`). No lite-headless change is needed; this composes on
shipped APIs.

Verified against `@zakkster/lite-charts` v1.19.0, `@zakkster/lite-headless`
hover-card, and `@zakkster/lite-floating` ^1.1.0. Exercised live in
`demo/charts-integration.html`.

## Install

    npm i @zakkster/lite-charts @zakkster/lite-headless @zakkster/lite-floating @zakkster/lite-signal

## The seam: crosshair signal -> virtualRef.setPoint -> hover-card

Construct the chart with `tooltip: false`, keep `crosshair: true` (the vertical line
and the snap are still useful), and subscribe to the crosshair signal.

    import { createLineChart }  from "@zakkster/lite-charts";
    import { createHoverCard }  from "@zakkster/lite-headless/hover-card";
    import { virtualRef }       from "@zakkster/lite-floating";

    const chart = createLineChart({
        series: [
            { name: "requests/s", data: () => reqRows(),  color: "--series-1" },
            { name: "latency p95", data: () => latRows(), color: "--series-2" },
        ],
        tooltip: false,          // <- we render the DOM tooltip ourselves
        crosshair: true,         // keep the snap + vertical line
    });
    chart.mount(document.getElementById("chart-host"));

    // A zero-allocation virtual anchor. setPoint(clientX, clientY) mutates the
    // SAME rect object on every call -- no per-move garbage.
    const vref = virtualRef();

    // No trigger, no hover-to-open: the chart drives open/close and position.
    // openDelay/closeDelay 0 so the card tracks the cursor with no lag.
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0, placement: "top" });
    hc.attachRoot(document.getElementById("chart-host"));   // any stable ancestor
    hc.attachContent(tooltipEl);                            // your DOM card
    hc.attachAnchor(vref);                                  // <- the virtual point

    const off = chart.crosshair.subscribe((s) => {
        // GOTCHA: `s` is the SAME mutable object on every notify (lite-charts
        // eliminates the per-mousemove allocation). Read every field NOW; never
        // retain `s` and read it later.
        if (!s.visible) { hc.setOpen(false); return; }

        const rect = chart.canvas.getBoundingClientRect();
        // lite-charts' logical coords are CSS pixels, so snapPixelX / mousePixelY
        // add straight onto the canvas rect -- no devicePixelRatio math.
        vref.setPoint(rect.left + s.snapPixelX, rect.top + s.mousePixelY);
        paintTooltip(tooltipEl, s.snapIdx, s.snapDomainX);  // your DOM update
        hc.setOpen(true);   // lite-floating repositions off the fresh rect
    });

Because the anchor moves every frame, call `hc.setOpen(true)` on each visible tick:
hover-card re-reads the anchor rect on open, so the card follows the point. `flip`
and `shift` (both on by default) keep it inside the viewport near the edges -- the
behaviour the canvas tooltip never had.

## Painting the card

`snapIdx` indexes the primary series' samples; `snapDomainX` is the domain x (ms for
a time scale). Read your series data at that index; there is no allocation here if
you write into existing nodes.

    function paintTooltip(el, idx, domainX) {
        el.querySelector("[data-x]").textContent   = fmtX(domainX);
        el.querySelector("[data-v1]").textContent  = reqRows()[idx]?.y ?? "-";
        el.querySelector("[data-v2]").textContent  = latRows()[idx]?.y ?? "-";
    }

The card is plain DOM, so it inherits your admin theme's CSS variables. If your app
has a light/dark toggle, the tooltip flips with everything else for free -- and see
`docs/recipes/lite-charts-time-range.md` for wiring the same toggle to the chart's
own `refreshTheme()`.

## Why hover-card, not tooltip or popover

`hover-card` is the lite-headless overlay that is positioned by lite-floating
directly, so it takes a virtual anchor as-is. `tooltip` and `popover` default to the
built-in overlay positioner, which gates its anchor on `spec.nodeType === 1` (a real
DOM element) and would ignore a bare `virtualRef`. If you prefer `tooltip`/`popover`
here, construct them with the opt-in `@zakkster/lite-headless/floating-adapter`
positioner (also lite-floating-backed) -- then a `virtualRef` flows through the same
way.

> [!NOTE]
> **Read crosshair fields eagerly.** `chart.crosshair` returns the same mutable
> `CrosshairState` object on every read (an intentional zero-allocation choice for
> hardware-rate pointer polling). Pull `visible`, `snapIdx`, `snapDomainX`,
> `snapPixelX`, `mousePixelY` out inside the subscribe callback; do not stash the
> object and read it a frame later.

> [!WARNING]
> **Do not gate open on a second condition.** The `crosshair.visible` flag is the
> sole authority for whether the tooltip shows. Mirror it with `setOpen(visible)`;
> do not also add hover listeners to the canvas or a `data-trigger`, or you stack
> two open sources and get flicker.

## Teardown

    off();          // unsubscribe from crosshair
    hc.destroy();   // detaches content/anchor, disposes the lite-floating instance
    chart.destroy();

## See also

- `docs/recipes/lite-charts-accessible-shell.md` -- the a11y layer this tooltip
  does NOT provide (canvas role/label, keyboard, a live region off the same
  crosshair signal, a data-table fallback).
- `docs/recipes/lite-charts-legend.md` -- series show/hide via a checkbox-group.
- `docs/recipes/lite-charts-time-range.md` -- a datepicker driving `setView`, plus
  `refreshTheme()` on a theme toggle.
- lite-floating's `llms.txt` -- `virtualRef`, `createFloating`, virtual elements.
