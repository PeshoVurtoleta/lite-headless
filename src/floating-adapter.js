// @zakkster/lite-headless / floating-adapter.js
//
// createFloatingPositioner(adapterOptions?) -> positioner factory
//
// Opt-in bridge that lets tooltip / popover / combobox / menu delegate their
// placement to @zakkster/lite-floating instead of the built-in _overlay/position
// engine. Pass the returned factory as the `positioner` option:
//
//   import { createFloatingPositioner } from "@zakkster/lite-headless/floating-adapter";
//   createTooltip({ positioner: createFloatingPositioner() });
//
// The factory speaks the exact positioner spec the built-in engine speaks:
//
//   (spec) -> { update, autoUpdate, destroy }
//
// where spec = { anchor, content, arrow, placement, offset, flip, shift, boundary }.
//
// Placement vocabulary is identical to the built-in engine: the 12 Floating-UI
// placements (top / right / bottom / left x {"", -start, -end}). data-placement,
// data-side and data-align are painted on the content; data-side only on the
// arrow (this adapter does not pixel-position an arrow -- it only hints its
// side, matching the identity vocabulary contract).
//
// Zero-GC posture:
//   - Middleware (offset / flip / shift) is built ONCE, when the factory is
//     invoked to open a float -- never per update tick.
//   - createFloating owns its own auto-update internally (ResizeObserver on
//     both refs, capturing window scroll, window resize, layout-shift IO).
//     Re-wiring the same listeners from here would double every one of them,
//     so the returned `autoUpdate()` is a no-op that hands back a shared
//     module-level no-op stop fn -- calling it allocates nothing.
//   - `update()` forwards to the floating handle's frame-coalesced update();
//     it is a named function created once per handle, so no closure is built
//     per tick.
//   - Placement paint is diffed against the last string written; an unchanged
//     placement writes nothing and allocates nothing.
//
// Fail closed: an element `boundary` is unsupported here. lite-floating clamps
// to the viewport and exposes no element-boundary injection surface, so the
// positioner throws when it runs at open -- each open re-invokes it, so the
// throw re-fires -- rather than silently coerce the request to something
// it is not. String boundaries ("clipping" / "viewport") are accepted; both
// resolve to lite-floating's viewport clamp.

import {
    createFloating,
    bindTransform,
    offset as offsetMw,
    flip as flipMw,
    shift as shiftMw,
} from "@zakkster/lite-floating";
import { effect } from "@zakkster/lite-signal";
import { setAttr } from "./_overlay/aria.js";

function noop() {}

export function createFloatingPositioner(adapterOptions) {
    const ao = adapterOptions || {};
    const strategy = ao.strategy;
    // Passthrough to createFloating: `false` disables lite-floating's own
    // auto-update; an options object tunes which listeners it wires.
    const autoUpdateOpts = ao.autoUpdate;

    return function floatingPositioner(spec) {
        const s = spec || {};
        const anchor = s.anchor || null;
        const content = s.content || null;
        const arrow = s.arrow || null;
        const placement = s.placement || "bottom";
        const offsetVal = s.offset != null ? s.offset : 8;
        const useFlip = s.flip !== false;
        const useShift = s.shift !== false;
        const boundary = s.boundary;

        if (boundary != null && typeof boundary === "object" && boundary.nodeType === 1) {
            throw new TypeError(
                "createFloatingPositioner: element boundary is unsupported; lite-floating clamps to the viewport. Use the built-in positioner for element boundaries.",
            );
        }

        // Middleware -- built ONCE here (per open), never per update tick.
        const mw = [offsetMw(offsetVal)];
        if (useFlip) mw.push(flipMw());
        if (useShift) mw.push(shiftMw());

        const floating = createFloating(
            () => anchor,
            () => content,
            {
                placement: placement,
                strategy: strategy,
                middleware: mw,
                autoUpdate: autoUpdateOpts,
            },
        );

        const bindOff = content ? bindTransform(content, floating.x, floating.y) : noop;

        // Diffed placement paint -- instance-scope last-written value. The
        // effect re-runs only when the placement signal actually changes;
        // an unchanged string returns before any parse or DOM write.
        let lastPl = null;
        const paintOff = effect(function () {
            const pl = floating.placement();
            if (pl === lastPl) return;
            lastPl = pl;
            const dash = pl.indexOf("-");
            const side = dash === -1 ? pl : pl.slice(0, dash);
            const align = dash === -1 ? "center" : pl.slice(dash + 1);
            if (content) {
                setAttr(content, "data-placement", pl);
                setAttr(content, "data-side", side);
                setAttr(content, "data-align", align);
            }
            if (arrow) setAttr(arrow, "data-side", side);
        });

        function update() {
            floating.update();
        }

        // No-op: lite-floating already owns auto-update for this pair (see the
        // header note). Returning the shared no-op avoids per-open allocation.
        function autoUpdate() {
            return noop;
        }

        function destroy() {
            paintOff();
            bindOff();
            floating.dispose();
        }

        return { update: update, autoUpdate: autoUpdate, destroy: destroy };
    };
}
