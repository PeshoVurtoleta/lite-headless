// @zakkster/lite-headless / _overlay / position.js
//
// Hand-rolled positioner for popover + tooltip. ~95% case coverage with strict
// scope per the design doc:
//
//   YES: 12 placements (top/bottom/left/right x {default, -start, -end})
//        basic flip (opposite side when main axis clips)
//        basic shift (slide along cross axis to stay inside boundary)
//        arrow positioning (inline left/top inside content; data-side hint)
//        autoUpdate (scroll capture + resize + ResizeObserver)
//        boundary: "clipping" walks the nearest scroll/overflow ancestor
//
//   NO:  cross-iframe handling
//        virtual keyboard awareness
//        complex polygon boundaries
//        intersection of multiple clipping ancestors (innermost only; consumers
//        wanting intersection should pass an explicit HTMLElement boundary)
//
// Performance posture (zero-GC-in-hot-loop): under `autoUpdate`, `update()`
// runs every scroll + resize tick. The implementation is structured so that a
// steady-state update produces ZERO allocations:
//
//   1. Placement string is parsed ONCE at construction into `_requestedSide`
//      and `_requestedAlign`. No re-parse per tick.
//   2. The clipping ancestor is resolved ONCE at construction (the DOM walk +
//      getComputedStyle calls happen once, not every scroll). The cached
//      element ref stays valid; its `getBoundingClientRect()` produces fresh
//      values each tick. Re-walk requires `invalidateClipping()` or a fresh
//      positioner.
//   3. `_coords`, `_oppCoords`, `_boundary`, `_viewport`, `_returnInfo` are
//      closure-scope mutable scratch objects. Math helpers mutate them in
//      place; no `{x,y}` or `{left,top,right,bottom}` returns per tick.
//   4. `content.style.transform` and `data-side`/`data-align` writes are
//      diffed against last-written values; if nothing changed, no string
//      allocation, no DOM write.
//   5. Inline styles `position`, `left`, `top` are set ONCE on first paint
//      then never touched (they're stable for the life of the positioner).
//
// The two unavoidable browser-owned allocations per tick are the two
// `getBoundingClientRect()` calls (DOMRect is immutable; we can't reuse).
// Those cost ~80 bytes each and are reclaimed promptly since we don't hold
// the refs.
//
// Test injection: `getRect` and `getViewport` are overridable so happy-dom
// (which has no real layout) can supply synthetic measurements.

const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" };

export function createPositioner(options = {}) {
    const {
        anchor,
        content,
        arrow = null,
        placement = "bottom",
        offset = 8,
        flip = true,
        shift = true,
        boundary = "clipping",
        getRect = defaultGetRect,
        getViewport = defaultGetViewport,
    } = options;

    // ----- parsed placement (computed ONCE) ------------------------------
    let _requestedSide  = "bottom";
    let _requestedAlign = "center";
    let _side  = "bottom";
    let _align = "center";
    parsePlacementInto(placement);

    function parsePlacementInto(p) {
        if (!p) { _requestedSide = "bottom"; _requestedAlign = "center"; return; }
        const dash = p.indexOf("-");
        if (dash < 0) { _requestedSide = p; _requestedAlign = "center"; return; }
        _requestedSide  = p.slice(0, dash);
        _requestedAlign = p.slice(dash + 1);
    }

    // ----- cached clipping ancestor (resolved ONCE) ----------------------
    // Walks the DOM tree and calls getComputedStyle exactly once at
    // construction. Each `update()` tick re-reads the cached ancestor's
    // rect via getBoundingClientRect (cheap, no layout walk), but does NOT
    // re-walk the tree or re-invoke getComputedStyle.
    let _clippingAncestor = null;
    let _clippingResolved = false;

    function resolveClippingAncestor() {
        if (_clippingResolved) return _clippingAncestor;
        _clippingAncestor = anchor ? findClippingAncestor(anchor) : null;
        _clippingResolved = true;
        return _clippingAncestor;
    }

    function invalidateClipping() {
        _clippingResolved = false;
        _clippingAncestor = null;
    }

    // ----- mutable scratch buffers (reused across update() calls) --------
    const _coords     = { x: 0, y: 0 };
    const _oppCoords  = { x: 0, y: 0 };
    const _boundary   = { left: 0, top: 0, right: 0, bottom: 0 };
    const _viewport   = { width: 0, height: 0 };
    const _returnInfo = { x: 0, y: 0, side: "bottom", placement: "bottom" };

    // ----- last-written values (for diffing) -----------------------------
    let _stylesInited = false;
    let _lastTransformX = NaN;
    let _lastTransformY = NaN;
    let _lastSideWritten = null;
    let _lastAlignWritten = null;
    let _placementStrCache = null;

    let _autoUpdateStop = null;

    function update() {
        if (!anchor || !content) return null;

        // Browser-owned: 2 DOMRects per tick. Properties are getters; no
        // further allocations on access.
        const anchorRect = getRect(anchor);
        const contentRect = getRect(content);

        // Read viewport into scratch (default reader uses module-shared
        // scratch; external injection may produce one alloc per call, OK).
        const vp = getViewport();
        _viewport.width  = vp.width;
        _viewport.height = vp.height;

        // Boundary scratch -- writes into _boundary in place
        resolveBoundaryInto(boundary, _viewport, _boundary, resolveClippingAncestor);

        // Compute coords for requested side -- writes _coords in place
        let chosenSide = _requestedSide;
        computeCoordsInto(anchorRect, contentRect, chosenSide, _requestedAlign, offset, _coords);

        // Flip: opposite side if main axis overflows
        if (flip && overflowsMain(chosenSide, _coords, contentRect, _boundary)) {
            const opp = OPPOSITE[chosenSide];
            computeCoordsInto(anchorRect, contentRect, opp, _requestedAlign, offset, _oppCoords);
            if (!overflowsMain(opp, _oppCoords, contentRect, _boundary)) {
                chosenSide = opp;
                _coords.x = _oppCoords.x;
                _coords.y = _oppCoords.y;
            }
        }

        if (shift) applyShiftInPlace(chosenSide, _coords, contentRect, _boundary);

        _side  = chosenSide;
        _align = _requestedAlign;

        const rx = Math.round(_coords.x);
        const ry = Math.round(_coords.y);

        if (!_stylesInited) {
            content.style.position = "fixed";
            content.style.left = "0px";
            content.style.top = "0px";
            _stylesInited = true;
        }
        if (rx !== _lastTransformX || ry !== _lastTransformY) {
            // String concat (not template literal): cheaper in V8 for hot
            // paths since template literals dispatch through a tag function
            // even when untagged.
            content.style.transform =
                "translate3d(" + rx + "px," + ry + "px,0)";
            _lastTransformX = rx;
            _lastTransformY = ry;
        }
        if (chosenSide !== _lastSideWritten) {
            content.setAttribute("data-side", chosenSide);
            if (arrow) arrow.setAttribute("data-side", chosenSide);
            _lastSideWritten = chosenSide;
            _placementStrCache = null;
        }
        if (_align !== _lastAlignWritten) {
            content.setAttribute("data-align", _align);
            _lastAlignWritten = _align;
            _placementStrCache = null;
        }

        if (arrow) positionArrow(arrow, anchorRect, contentRect, _coords, chosenSide);

        // Mutate the shared return scratch -- callers that read it must
        // treat it as transient (valid only until next update()).
        _returnInfo.x = _coords.x;
        _returnInfo.y = _coords.y;
        _returnInfo.side = chosenSide;
        _returnInfo.placement = _align === "center" ? chosenSide : (chosenSide + "-" + _align);
        return _returnInfo;
    }

    function autoUpdate() {
        if (_autoUpdateStop) return _autoUpdateStop;

        // Single named fn ref (no closure-per-tick)
        const handler = update;

        if (typeof window !== "undefined") {
            window.addEventListener("scroll", handler, { capture: true, passive: true });
            window.addEventListener("resize", handler, { passive: true });
        }
        let ro = null;
        if (typeof ResizeObserver !== "undefined" && anchor && content) {
            ro = new ResizeObserver(handler);
            ro.observe(anchor);
            ro.observe(content);
        }
        _autoUpdateStop = () => {
            if (typeof window !== "undefined") {
                window.removeEventListener("scroll", handler, { capture: true });
                window.removeEventListener("resize", handler);
            }
            if (ro) ro.disconnect();
            _autoUpdateStop = null;
        };
        return _autoUpdateStop;
    }

    function destroy() {
        if (_autoUpdateStop) _autoUpdateStop();
    }

    return {
        update,
        autoUpdate,
        destroy,
        invalidateClipping,
        get placement() {
            if (_placementStrCache === null) {
                _placementStrCache = _align === "center" ? _side : (_side + "-" + _align);
            }
            return _placementStrCache;
        },
        get side() { return _side; },
        // Resolved-after-flip side from the LAST `update()` call (or `_side`
        // if `update()` has never run). Callers that need to know which way
        // the popover actually ended up pointing (e.g. to paint a readout)
        // should read this in memory instead of querying `data-side` from
        // the DOM -- the latter forces a synchronous style recalc when read
        // immediately after a position write.
        get currentSide() { return _lastSideWritten || _side; },
        // Resolved align. Currently align doesn't flip in the auto-placement
        // algorithm so this matches the input, but we expose it as a getter
        // anyway for symmetry + future-proofing.
        get currentAlign() { return _lastAlignWritten || _align; },
    };
}

// ----- helpers (allocation-free; output via mutable `out` params) --------

function computeCoordsInto(anchor, content, side, align, offset, out) {
    if (side === "top") {
        out.y = anchor.top - content.height - offset;
        out.x = alignXOnAxis(anchor, content, align);
    } else if (side === "bottom") {
        out.y = anchor.bottom + offset;
        out.x = alignXOnAxis(anchor, content, align);
    } else if (side === "left") {
        out.x = anchor.left - content.width - offset;
        out.y = alignYOnAxis(anchor, content, align);
    } else if (side === "right") {
        out.x = anchor.right + offset;
        out.y = alignYOnAxis(anchor, content, align);
    }
}

function alignXOnAxis(anchor, content, align) {
    if (align === "start") return anchor.left;
    if (align === "end")   return anchor.right - content.width;
    return anchor.left + anchor.width / 2 - content.width / 2;
}

function alignYOnAxis(anchor, content, align) {
    if (align === "start") return anchor.top;
    if (align === "end")   return anchor.bottom - content.height;
    return anchor.top + anchor.height / 2 - content.height / 2;
}

function overflowsMain(side, coords, content, b) {
    if (side === "top")    return coords.y < b.top;
    if (side === "bottom") return coords.y + content.height > b.bottom;
    if (side === "left")   return coords.x < b.left;
    if (side === "right")  return coords.x + content.width > b.right;
    return false;
}

// Mutates `coords` in place rather than returning a fresh `{x, y}`.
function applyShiftInPlace(side, coords, content, b) {
    if (side === "top" || side === "bottom") {
        if (coords.x < b.left) coords.x = b.left;
        if (coords.x + content.width > b.right) coords.x = b.right - content.width;
    } else {
        if (coords.y < b.top) coords.y = b.top;
        if (coords.y + content.height > b.bottom) coords.y = b.bottom - content.height;
    }
}

// Writes boundary into `out`. The clipping-ancestor path uses the cached
// lookup via `resolveClipping` so the DOM walk happens once per positioner
// lifetime, not per tick.
function resolveBoundaryInto(spec, vp, out, resolveClipping) {
    if (spec === "viewport") {
        out.left = 0; out.top = 0;
        out.right = vp.width; out.bottom = vp.height;
        return;
    }
    if (spec === "clipping") {
        const a = resolveClipping();
        if (a) {
            const r = a.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) {
                out.left = 0; out.top = 0;
                out.right = vp.width; out.bottom = vp.height;
                return;
            }
            // Math.max / Math.min would also work; manual ternary inlines
            // better in V8's optimizer for this shape.
            out.left   = r.left   > 0          ? r.left   : 0;
            out.top    = r.top    > 0          ? r.top    : 0;
            out.right  = r.right  < vp.width   ? r.right  : vp.width;
            out.bottom = r.bottom < vp.height  ? r.bottom : vp.height;
            return;
        }
        out.left = 0; out.top = 0;
        out.right = vp.width; out.bottom = vp.height;
        return;
    }
    if (spec && spec.nodeType === 1 && typeof spec.getBoundingClientRect === "function") {
        const r = spec.getBoundingClientRect();
        out.left = r.left; out.top = r.top;
        out.right = r.right; out.bottom = r.bottom;
        return;
    }
    out.left = 0; out.top = 0;
    out.right = vp.width; out.bottom = vp.height;
}

// Walk up from el's parentElement looking for the nearest ancestor whose
// computed overflow is anything other than "visible" on any axis. EXPENSIVE:
// calls getComputedStyle once per ancestor. Intended to be called ONCE per
// positioner lifetime; cached by the positioner. NEVER called inside an
// autoUpdate tick.
export function findClippingAncestor(el) {
    if (!el) return null;
    const view = el.ownerDocument && el.ownerDocument.defaultView;
    const gcs = (view && typeof view.getComputedStyle === "function")
        ? view.getComputedStyle.bind(view)
        : (typeof globalThis !== "undefined" && typeof globalThis.getComputedStyle === "function")
            ? globalThis.getComputedStyle
            : null;
    if (!gcs) return null;

    let node = el.parentElement;
    const root = (typeof document !== "undefined") ? document.documentElement : null;
    while (node && node !== root) {
        let cs;
        try { cs = gcs(node); }
        catch { node = node.parentElement; continue; }
        if (!cs) { node = node.parentElement; continue; }
        if (cs.position === "fixed" || cs.position === "sticky") return null;
        const ov  = cs.overflow;
        const ovX = cs.overflowX;
        const ovY = cs.overflowY;
        if (isClippingOverflow(ov) || isClippingOverflow(ovX) || isClippingOverflow(ovY)) {
            return node;
        }
        node = node.parentElement;
    }
    return null;
}

function isClippingOverflow(value) {
    return value === "hidden" || value === "scroll" || value === "auto" || value === "clip";
}

// ----- arrow positioning -------------------------------------------------

// Diffs the arrow's inline left/top to avoid string allocations on no-op
// ticks. State is stashed on the arrow element itself via `_lhArrow*` so
// multiple positioners targeting different arrows don't share state.
function positionArrow(arrow, anchor, content, contentCoords, side) {
    if (!arrow) return;
    let key, val;
    if (side === "top" || side === "bottom") {
        const anchorCenter = anchor.left + anchor.width / 2;
        let off = anchorCenter - contentCoords.x;
        if (off < 0) off = 0;
        else if (off > content.width) off = content.width;
        key = "left"; val = off;
        if (arrow._lhArrowSide !== "top" && arrow._lhArrowSide !== "bottom") {
            arrow.style.top = "";
        }
    } else {
        const anchorCenter = anchor.top + anchor.height / 2;
        let off = anchorCenter - contentCoords.y;
        if (off < 0) off = 0;
        else if (off > content.height) off = content.height;
        key = "top"; val = off;
        if (arrow._lhArrowSide !== "left" && arrow._lhArrowSide !== "right") {
            arrow.style.left = "";
        }
    }
    const rounded = Math.round(val);
    if (arrow._lhArrowVal !== rounded || arrow._lhArrowKey !== key) {
        arrow.style[key] = rounded + "px";
        arrow._lhArrowKey = key;
        arrow._lhArrowVal = rounded;
    }
    arrow._lhArrowSide = side;
}

// ----- defaults ----------------------------------------------------------

function defaultGetRect(el) {
    return el.getBoundingClientRect();
}

// Module-shared scratch for the default viewport reader. Only one positioner
// reads it at a time on the main thread, so the shared buffer is safe.
const _defaultVpScratch = { width: 0, height: 0 };
function defaultGetViewport() {
    if (typeof window === "undefined") {
        _defaultVpScratch.width  = 1024;
        _defaultVpScratch.height = 768;
    } else {
        _defaultVpScratch.width  = window.innerWidth;
        _defaultVpScratch.height = window.innerHeight;
    }
    return _defaultVpScratch;
}
