// @zakkster/lite-headless / timeline
//
// Vertical activity log with markers per item. Each item has a type
// (default | success | warning | danger | info) that controls the
// marker color, plus optional time + content slots.
//
// Mostly a layout + ARIA primitive. Items are static (consumer
// renders them); the primitive paints data attributes for styling
// and an aria-label for accessibility.
//
// Painted attributes:
//   root:
//     role="list"
//     data-timeline-root
//   items:
//     role="listitem"
//     data-timeline-item
//     data-type="default|success|warning|danger|info"
//   marker (optional [data-timeline-marker] inside item):
//     aria-hidden="true"  (decoration only -- the surrounding item announces it)

import { setAttr } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

const VALID_TYPES = new Set(["default", "success", "warning", "danger", "info"]);

export function createTimeline(opts = {}) {
    const o = opts || {};
    const _destroyed = { v: false };
    const _items = new Set();    // attached item elements
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-timeline-root", "");
        if (!el.hasAttribute("role")) setAttr(el, "role", "list");
        const off = () => {
            removeAttr(el, "data-timeline-root");
            if (el.getAttribute("role") === "list") removeAttr(el, "role");
        };
        addCleanup(off);
        return off;
    }

    function attachItem(el, opts2) {
        if (!el || _destroyed.v) return noop;
        const o2 = opts2 || {};
        const type = VALID_TYPES.has(o2.type) ? o2.type : "default";
        _items.add(el);
        setAttr(el, "data-timeline-item", "");
        setAttr(el, "data-type", type);
        if (!el.hasAttribute("role")) setAttr(el, "role", "listitem");
        // Marker inside, if present, should be aria-hidden.
        const marker = el.querySelector("[data-timeline-marker]");
        if (marker && !marker.hasAttribute("aria-hidden")) setAttr(marker, "aria-hidden", "true");
        const off = () => {
            _items.delete(el);
            removeAttr(el, "data-timeline-item");
            removeAttr(el, "data-type");
            if (el.getAttribute("role") === "listitem") removeAttr(el, "role");
            if (marker && marker.getAttribute("aria-hidden") === "true") {
                marker.removeAttribute("aria-hidden");
            }
        };
        addCleanup(off);
        return off;
    }

    function setItemType(el, type) {
        if (_destroyed.v) return;
        if (!VALID_TYPES.has(type)) return;
        if (!_items.has(el)) return;
        setAttr(el, "data-type", type);
    }

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
        _items.clear();
    }

    return {
        get itemCount() { return _items.size; },
        attachRoot, attachItem, setItemType,
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
