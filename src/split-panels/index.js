// @zakkster/lite-headless / split-panels / index.js
//
// Headless resizable split panels. N panels, N-1 handles between them.
// Sizes are percentages of the container's main axis (sum to 100).
//
//   const split = createSplitPanels({ orientation: "horizontal" });
//   split.attachContainer(rootEl);
//   split.attachPanel(panelA, 0, { minSize: 15, defaultSize: 30 });
//   split.attachPanel(panelB, 1, { minSize: 25, defaultSize: 70 });
//   split.attachHandle(handleEl, 0);   // between panel 0 and 1
//
// CSS CONTRACT
//
// The engine writes ONE numeric custom property per panel to the container:
//
//   --lh-panel-0-pct: 30
//   --lh-panel-1-pct: 70
//
// Consumers compose these into whatever layout they want. For a horizontal
// flexbox split:
//
//   .split { display: flex; }
//   .split-panel { flex-basis: calc(var(--lh-panel-0-pct) * 1%); }
//
// For grid:
//
//   .split[data-orientation="horizontal"] {
//     display: grid;
//     grid-template-columns:
//       calc(var(--lh-panel-0-pct) * 1%)
//       var(--lh-handle-size, 6px)
//       calc(var(--lh-panel-1-pct) * 1%);
//   }
//
// The engine does NOT write inline width/height styles. This is the central
// layout-thrashing-avoidance contract: writing custom properties does not
// trigger style recalc on every frame in the same way that writing inline
// `width` does on a flex-basis sibling.
//
// HOT PATH
//
// Dragging a handle fires `pointermove` at 60-120 Hz. The implementation
// caches `container.getBoundingClientRect()` ONCE on pointerdown along with
// the layout snapshot and pointer position. Every subsequent move during
// the drag does ZERO DOM reads -- only writes to the custom properties
// (which the browser batches into a single style invalidation per frame).
//
// CONSTRAINTS
//
// Each panel may declare `minSize` and `maxSize` (in percent of container).
// When a drag would push a panel below its min, the excess is held back at
// the cursor -- the handle stops, the cursor outpaces it. (Cascading
// propagation to further-away panels is deliberately NOT supported in v1;
// dragging handle[i] only affects panel[i] and panel[i+1]. Multi-handle
// rebalancing belongs to userspace.)
//
// COLLAPSIBLE
//
// `collapsible: true` enables snap-to-zero behavior. When a drag would put
// the panel below `minSize * snapThreshold` (default 0.5), the panel snaps
// to 0 and the neighbor absorbs the full remainder. Re-expansion: dragging
// from 0 past the same threshold restores the panel to minSize.
//
// KEYBOARD
//
// A focused handle responds to ArrowLeft/Right (horizontal) or ArrowUp/Down
// (vertical) -- each press moves the handle by `keyboardStep` percentage
// points (default 5). Home/End jump to the extremes (handle moved to push
// its left/upper neighbor to min, or to max, respectively).

import { signal as makeSignal, effect } from "@zakkster/lite-signal";

const noop = () => {};

export function createSplitPanels(options = {}) {
    const {
        orientation   = "horizontal",
        layout: layoutSignal,
        defaultLayout,
        snapThreshold = 0.5,
        keyboardStep  = 5,
        onLayoutChange,
    } = options;

    if (orientation !== "horizontal" && orientation !== "vertical") {
        throw new Error(`createSplitPanels: orientation must be "horizontal" or "vertical", got "${orientation}"`);
    }

    // ----- panel + handle registries ------------------------------------
    // _panels[i] = { el, minSize, maxSize, defaultSize, collapsible, collapsedSize, _lastCollapsedFrom }
    // Last entry tracks the most recent non-zero size so re-expanding restores it.
    const _panels  = [];
    const _handles = [];   // index i = handle BETWEEN panel[i] and panel[i+1]

    // The layout signal: array of percentages summing to ~100. New ref on
    // every change (signal semantics). External controlled-mode supported
    // via the `layout` option; uncontrolled mode falls back to
    // `defaultLayout`, then to even split when panels register.
    const _layout = layoutSignal || makeSignal(defaultLayout ? defaultLayout.slice() : []);
    let _container = null;
    let _destroyed = false;

    // Drag scratch (reused across pointer events). Hot path -- no allocations
    // per pointermove beyond the array passed to _layout.set().
    let _dragHandleIdx = -1;
    let _dragContainerSize = 0;         // pixels along main axis
    let _dragStartPointer  = 0;         // clientX or clientY at pointerdown
    const _dragStartSizes  = [];        // snapshot of layout() at pointerdown
    let _dragPointerId     = -1;
    let _dragActiveHandle  = null;

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    function isHorizontal() { return orientation === "horizontal"; }

    function clamp(v, lo, hi) {
        if (v < lo) return lo;
        if (v > hi) return hi;
        return v;
    }

    function getPanelMin(i)  { return _panels[i]?.minSize  ?? 0;   }
    function getPanelMax(i)  { return _panels[i]?.maxSize  ?? 100; }
    function isCollapsible(i){ return !!_panels[i]?.collapsible;   }

    // Normalize the layout array so it sums to 100 and respects per-panel
    // min/max. Used once on initial publish and after `setLayout` writes.
    // Mutates `out` in place.
    function normalizeInto(sizes, out) {
        const n = _panels.length;
        if (n === 0) { out.length = 0; return; }

        // First pass: copy in, default-fill if shorter than panel count,
        // clamp to [0..100].
        out.length = n;
        let sum = 0;
        for (let i = 0; i < n; i++) {
            let v = sizes[i];
            if (v == null || Number.isNaN(v)) {
                v = _panels[i].defaultSize != null ? _panels[i].defaultSize : (100 / n);
            }
            if (v < 0) v = 0;
            if (v > 100) v = 100;
            out[i] = v;
            sum += v;
        }
        // Scale to sum to exactly 100 if the input was off (within reason).
        if (sum > 0 && Math.abs(sum - 100) > 0.001) {
            const k = 100 / sum;
            for (let i = 0; i < n; i++) out[i] *= k;
        }
        // Min-clamp pass: if any panel is below its min, raise it and steal
        // from the largest sibling. Bounded by panel count, so two passes
        // are sufficient for typical 2-4 panel layouts.
        for (let pass = 0; pass < 4; pass++) {
            let anyChange = false;
            for (let i = 0; i < n; i++) {
                const lo = getPanelMin(i);
                if (out[i] < lo) {
                    const need = lo - out[i];
                    out[i] = lo;
                    // steal from the largest sibling that has slack
                    let bestIdx = -1;
                    let bestSlack = 0;
                    for (let j = 0; j < n; j++) {
                        if (j === i) continue;
                        const slack = out[j] - getPanelMin(j);
                        if (slack > bestSlack) { bestSlack = slack; bestIdx = j; }
                    }
                    if (bestIdx === -1) break;
                    const take = bestSlack < need ? bestSlack : need;
                    out[bestIdx] -= take;
                    anyChange = true;
                }
            }
            if (!anyChange) break;
        }
    }

    // Write the current layout to the container's CSS custom properties.
    // Called once per setLayout() invocation. Uses style.setProperty, which
    // is a single batched DOM write per call.
    function paintLayout(sizes) {
        if (!_container) return;
        for (let i = 0; i < sizes.length; i++) {
            // toFixed(4) gives enough resolution for sub-pixel positioning
            // on typical screens (10000+ pixels max width) without runaway
            // string length.
            _container.style.setProperty(
                "--lh-panel-" + i + "-pct",
                sizes[i].toFixed(4)
            );
        }
    }

    // Sync ARIA state on every handle (aria-valuenow, aria-valuetext) from
    // the layout. Runs once per layout change -- not per pointermove inside
    // the same frame (the layout signal coalesces those).
    function paintAria(sizes) {
        for (let i = 0; i < _handles.length; i++) {
            const handle = _handles[i];
            if (!handle) continue;
            // valuenow is the percentage size of the LEFT/TOP panel (the
            // panel the handle is "set against"). aria-valuetext reports
            // both neighboring sizes for screen-reader friendliness.
            const left  = sizes[i];
            const right = sizes[i + 1];
            handle.el.setAttribute("aria-valuenow", Math.round(left).toString());
            handle.el.setAttribute("aria-valuemin", String(getPanelMin(i)));
            handle.el.setAttribute("aria-valuemax", String(100 - getPanelMin(i + 1)));
            handle.el.setAttribute(
                "aria-valuetext",
                Math.round(left) + "%, " + Math.round(right) + "%"
            );
        }
    }

    function publishLayout(next, reason) {
        if (_destroyed) return;
        // Equality short-circuit: a no-op layout update shouldn't re-paint
        // or fire onLayoutChange. Cheap to check for small arrays.
        const current = _layout();
        if (current && current.length === next.length) {
            let same = true;
            for (let i = 0; i < next.length; i++) {
                if (Math.abs(current[i] - next[i]) > 0.0001) { same = false; break; }
            }
            if (same) return;
        }
        _layout.set(next);
        if (onLayoutChange) {
            try { onLayoutChange(next, reason || "set"); } catch { /* swallow */ }
        }
    }

    // Reactive paint: any time the layout signal changes (from drag,
    // keyboard, programmatic setLayout, or external controlled-signal
    // write), repaint the container CSS vars + ARIA on handles.
    const stopPaint = effect(() => {
        const sizes = _layout();
        if (!sizes || sizes.length === 0) return;
        paintLayout(sizes);
        paintAria(sizes);
    });

    // -----------------------------------------------------------------
    // attach* lifecycle
    // -----------------------------------------------------------------

    function attachContainer(el) {
        if (!el || _destroyed) return noop;
        _container = el;
        el.setAttribute("data-orientation", orientation);
        // role="group" is implied; we don't pollute. Consumers can add
        // their own aria-label/labelledby.

        // Trigger initial paint -- _layout might already have a non-empty
        // array if defaultLayout was provided AND panels registered before
        // attachContainer. Otherwise it'll paint when the first panel
        // registers and publishes.
        const current = _layout();
        if (current && current.length > 0) paintLayout(current);

        return () => {
            if (_container === el) {
                el.removeAttribute("data-orientation");
                // wipe custom props so consumer styles don't see stale values
                for (let i = 0; i < _panels.length; i++) {
                    el.style.removeProperty("--lh-panel-" + i + "-pct");
                }
                _container = null;
            }
        };
    }

    function attachPanel(el, idx, panelOpts = {}) {
        if (!el || _destroyed) return noop;
        if (idx < 0) throw new Error(`createSplitPanels.attachPanel: idx must be >= 0, got ${idx}`);

        const entry = {
            el,
            minSize:       panelOpts.minSize       ?? 0,
            maxSize:       panelOpts.maxSize       ?? 100,
            defaultSize:   panelOpts.defaultSize,
            collapsible:   !!panelOpts.collapsible,
            // remembers the last non-zero size before a collapse so
            // expandPanel can restore it
            _lastNonZero:  panelOpts.defaultSize ?? (panelOpts.minSize ?? 10),
        };
        _panels[idx] = entry;
        el.setAttribute("data-panel-idx", String(idx));

        // Publish a fresh layout. If the current published layout doesn't
        // match the panel count (typical during sequential attachPanel
        // calls at construction time), rebuild from defaults rather than
        // trying to scale an N-element layout into an N+1-element shape.
        // Otherwise, normalize the existing layout in place (preserves
        // user-driven sizes when only the constraints changed).
        let next;
        const current = _layout();
        if (current.length !== _panels.length) {
            next = buildDefaultLayout();
        } else {
            next = new Array(_panels.length);
            normalizeInto(current, next);
        }
        publishLayout(next, "attach");

        return () => {
            if (_panels[idx] === entry) {
                el.removeAttribute("data-panel-idx");
                _panels[idx] = undefined;
            }
        };
    }

    // Build a fresh layout array of length _panels.length, prioritizing
    // (1) panel.defaultSize, (2) the createSplitPanels(defaultLayout) seed
    // by index, (3) even split of the remaining percentage across all
    // panels that didn't get an explicit value. The final pass through
    // normalizeInto enforces min/max constraints.
    function buildDefaultLayout() {
        const n = _panels.length;
        const draft = new Array(n);
        let knownSum = 0;
        let unknownCount = 0;
        for (let i = 0; i < n; i++) {
            let v = null;
            if (_panels[i] && _panels[i].defaultSize != null) {
                v = _panels[i].defaultSize;
            } else if (defaultLayout && defaultLayout[i] != null) {
                v = defaultLayout[i];
            }
            if (v != null) {
                draft[i] = v;
                knownSum += v;
            } else {
                draft[i] = null;
                unknownCount++;
            }
        }
        const remaining = 100 - knownSum > 0 ? 100 - knownSum : 0;
        const each = unknownCount > 0 ? remaining / unknownCount : 0;
        for (let i = 0; i < n; i++) {
            if (draft[i] === null) draft[i] = each;
        }
        const out = new Array(n);
        normalizeInto(draft, out);
        return out;
    }

    function attachHandle(el, idx) {
        if (!el || _destroyed) return noop;
        if (idx < 0) throw new Error(`createSplitPanels.attachHandle: idx must be >= 0, got ${idx}`);

        const entry = { el, idx };
        _handles[idx] = entry;

        // ARIA: role=separator. Per W3C ARIA spec for role=separator
        // (https://www.w3.org/TR/wai-aria-1.2/#separator) and the
        // WAI-ARIA APG window-splitter pattern, aria-orientation
        // describes the SEPARATOR LINE ITSELF, which is perpendicular
        // to the panel arrangement axis:
        //   - panels arranged horizontally (side by side) -> separator
        //     is a vertical line -> aria-orientation="vertical"
        //   - panels arranged vertically (stacked top/bottom) -> separator
        //     is a horizontal line -> aria-orientation="horizontal"
        // The codebase's `orientation` prop describes the PANEL
        // arrangement axis (consistent with sortable/carousel/slider),
        // so the separator's aria-orientation is the opposite string.
        // tabindex makes the handle focusable for keyboard nav.
        el.setAttribute("role", "separator");
        el.setAttribute("aria-orientation", isHorizontal() ? "vertical" : "horizontal");
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
        el.setAttribute("data-handle-idx", String(idx));

        // Pointer down: cache the drag state. No DOM reads happen after
        // this point during the drag.
        const onPointerDown = (e) => {
            // Primary button only; ignore right-click and pointer types
            // we don't want to drag (e.g. pen with secondary barrel button).
            if (e.button != null && e.button !== 0) return;
            if (!_container) return;
            e.preventDefault();

            const rect = _container.getBoundingClientRect();
            _dragContainerSize = isHorizontal() ? rect.width : rect.height;
            _dragStartPointer  = isHorizontal() ? e.clientX : e.clientY;
            _dragHandleIdx     = idx;
            _dragActiveHandle  = entry;

            // Copy current layout into the start-snapshot scratch.
            const current = _layout();
            _dragStartSizes.length = current.length;
            for (let i = 0; i < current.length; i++) _dragStartSizes[i] = current[i];

            // Pointer capture so the move continues even if the cursor
            // leaves the handle (drags often slide off).
            try {
                el.setPointerCapture(e.pointerId);
                _dragPointerId = e.pointerId;
            } catch { /* not all environments support setPointerCapture */ }

            el.setAttribute("data-dragging", "");
            if (_container) _container.setAttribute("data-resizing", "");

            // Bind move/up on the element itself (not document) so pointer-
            // capture routes them correctly. Falls through to document if
            // capture isn't supported.
            const moveTarget = (typeof document !== "undefined") ? document : el;
            moveTarget.addEventListener("pointermove", onPointerMove);
            moveTarget.addEventListener("pointerup", onPointerUp);
            moveTarget.addEventListener("pointercancel", onPointerUp);
        };

        const onPointerMove = (e) => {
            if (_dragHandleIdx !== idx) return;
            if (_dragContainerSize <= 0) return;

            const currentPointer = isHorizontal() ? e.clientX : e.clientY;
            const deltaPx        = currentPointer - _dragStartPointer;
            const deltaPct       = (deltaPx / _dragContainerSize) * 100;

            // Compute proposed new sizes for the two adjacent panels. All
            // other panels stay at their snapshot value.
            const left  = idx;
            const right = idx + 1;
            const startLeft  = _dragStartSizes[left];
            const startRight = _dragStartSizes[right];

            let newLeft  = startLeft + deltaPct;
            let newRight = startRight - deltaPct;

            // Apply min/max + collapse snap to the left panel.
            const lMin = getPanelMin(left), lMax = getPanelMax(left);
            const rMin = getPanelMin(right), rMax = getPanelMax(right);

            // Collapse snap (left): if collapsible AND below threshold,
            // snap to 0 and give the room to the right.
            if (isCollapsible(left) && newLeft < lMin * snapThreshold) {
                newRight += newLeft; // give back what we took
                newLeft = 0;
            } else if (newLeft < lMin) {
                // Held back at min; right gets the excess back.
                const overshoot = lMin - newLeft;
                newLeft = lMin;
                newRight = startRight - deltaPct - overshoot;
            } else if (newLeft > lMax) {
                const overshoot = newLeft - lMax;
                newLeft = lMax;
                newRight = startRight - deltaPct + overshoot;
            }

            // Same for the right panel.
            if (isCollapsible(right) && newRight < rMin * snapThreshold) {
                newLeft += newRight;
                newRight = 0;
            } else if (newRight < rMin) {
                const overshoot = rMin - newRight;
                newRight = rMin;
                newLeft = startLeft + deltaPct - overshoot;
            } else if (newRight > rMax) {
                const overshoot = newRight - rMax;
                newRight = rMax;
                newLeft = startLeft + deltaPct + overshoot;
            }

            // Build the new layout array. Allocation per pointermove is
            // unavoidable due to signal reference-equality semantics --
            // bounded by frame rate, well under the GC budget.
            const next = new Array(_panels.length);
            for (let i = 0; i < _panels.length; i++) next[i] = _dragStartSizes[i];
            next[left]  = newLeft;
            next[right] = newRight;

            // Update _lastNonZero for collapse/expand restore.
            if (newLeft  > 0 && entry.el) _panels[left]._lastNonZero  = newLeft;
            if (newRight > 0 && entry.el) _panels[right]._lastNonZero = newRight;

            publishLayout(next, "drag");
        };

        const onPointerUp = (e) => {
            if (_dragHandleIdx !== idx) return;
            _dragHandleIdx     = -1;
            _dragContainerSize = 0;
            _dragActiveHandle  = null;
            el.removeAttribute("data-dragging");
            if (_container) _container.removeAttribute("data-resizing");
            try { el.releasePointerCapture(_dragPointerId); } catch { /* not critical */ }
            _dragPointerId = -1;
            const moveTarget = (typeof document !== "undefined") ? document : el;
            moveTarget.removeEventListener("pointermove", onPointerMove);
            moveTarget.removeEventListener("pointerup", onPointerUp);
            moveTarget.removeEventListener("pointercancel", onPointerUp);
        };

        const onKey = (e) => {
            const k = e.key;
            const isMain = isHorizontal()
                ? (k === "ArrowLeft" || k === "ArrowRight")
                : (k === "ArrowUp"   || k === "ArrowDown");
            const isHome = k === "Home";
            const isEnd  = k === "End";
            if (!isMain && !isHome && !isEnd) return;

            e.preventDefault();
            const current = _layout();
            const next = current.slice();
            const left = idx, right = idx + 1;

            if (isHome) {
                // Push the left panel to its minimum.
                const lMin = getPanelMin(left);
                const delta = next[left] - lMin;
                next[left]  = lMin;
                next[right] = next[right] + delta;
            } else if (isEnd) {
                // Push the left panel to its maximum (or what the right
                // panel's min allows).
                const lMax = getPanelMax(left);
                const rMin = getPanelMin(right);
                const maxAllowed = next[left] + (next[right] - rMin);
                const target = Math.min(lMax, maxAllowed);
                const delta = target - next[left];
                next[left]  = target;
                next[right] = next[right] - delta;
            } else {
                const sign = (k === "ArrowLeft" || k === "ArrowUp") ? -1 : 1;
                const step = keyboardStep * sign;
                let newLeft  = next[left]  + step;
                let newRight = next[right] - step;
                const lMin = getPanelMin(left), lMax = getPanelMax(left);
                const rMin = getPanelMin(right), rMax = getPanelMax(right);
                if (newLeft < lMin)  { newRight += (newLeft - lMin); newLeft = lMin; }
                if (newLeft > lMax)  { newRight += (newLeft - lMax); newLeft = lMax; }
                if (newRight < rMin) { newLeft += (newRight - rMin); newRight = rMin; }
                if (newRight > rMax) { newLeft += (newRight - rMax); newRight = rMax; }
                next[left]  = newLeft;
                next[right] = newRight;
            }
            publishLayout(next, "keyboard");
        };

        el.addEventListener("pointerdown", onPointerDown);
        el.addEventListener("keydown", onKey);

        // Paint ARIA once from the current layout. The reactive effect
        // only fires on layout *changes*; a handle that attaches after
        // the panels were registered would otherwise have empty
        // aria-valuenow until the first drag/keyboard interaction.
        {
            const current = _layout();
            if (current && current.length > 0) paintAria(current);
        }

        return () => {
            if (_handles[idx] === entry) {
                el.removeEventListener("pointerdown", onPointerDown);
                el.removeEventListener("keydown", onKey);
                el.removeAttribute("role");
                el.removeAttribute("aria-orientation");
                el.removeAttribute("data-handle-idx");
                el.removeAttribute("aria-valuenow");
                el.removeAttribute("aria-valuemin");
                el.removeAttribute("aria-valuemax");
                el.removeAttribute("aria-valuetext");
                _handles[idx] = undefined;
            }
        };
    }

    // -----------------------------------------------------------------
    // Public API for programmatic control
    // -----------------------------------------------------------------

    function setLayout(sizes, reason = "set") {
        if (_destroyed) return;
        const next = new Array(_panels.length);
        normalizeInto(sizes, next);
        publishLayout(next, reason);
    }

    function collapsePanel(idx) {
        if (idx < 0 || idx >= _panels.length) return;
        const panel = _panels[idx];
        if (!panel) return;
        const current = _layout();
        if (current[idx] === 0) return;     // already collapsed
        panel._lastNonZero = current[idx];
        // Move this panel's percentage to the nearest non-collapsed neighbor.
        const next = current.slice();
        const give = next[idx];
        next[idx] = 0;
        // prefer right neighbor; fall back to left
        if (idx + 1 < next.length && next[idx + 1] != null) next[idx + 1] += give;
        else if (idx - 1 >= 0)                              next[idx - 1] += give;
        publishLayout(next, "collapse");
    }

    function expandPanel(idx, sizeOverride) {
        if (idx < 0 || idx >= _panels.length) return;
        const panel = _panels[idx];
        if (!panel) return;
        const current = _layout();
        if (current[idx] > 0 && sizeOverride == null) return;
        const restore = sizeOverride != null ? sizeOverride : (panel._lastNonZero || panel.minSize || 10);
        const next = current.slice();
        // Take the restore amount from the largest sibling that has slack.
        let bestIdx = -1, bestSlack = 0;
        for (let i = 0; i < next.length; i++) {
            if (i === idx) continue;
            const slack = next[i] - getPanelMin(i);
            if (slack > bestSlack) { bestSlack = slack; bestIdx = i; }
        }
        if (bestIdx === -1) return;
        const take = Math.min(restore, bestSlack);
        next[bestIdx] -= take;
        next[idx] = take;
        publishLayout(next, "expand");
    }

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPaint();
        // attach* teardowns are returned to the consumer; we don't track
        // them centrally. Destroy is idempotent and just stops the reactive
        // paint + flags the engine.
    }

    return {
        attachContainer,
        attachPanel,
        attachHandle,
        layout: () => _layout(),
        setLayout,
        collapsePanel,
        expandPanel,
        destroy,
        get destroyed() { return _destroyed; },
    };
}
