// @zakkster/lite-headless / descriptions
//
// Definition-list-style layout for key:value pairs. Used heavily in
// admin detail views ("Username: alice | Email: a@b | Role: admin").
//
// This is primarily a layout + ARIA primitive. The visual presentation
// (rows, columns, table-like grid) is consumer-styled.
//
// Painted attributes:
//   root:
//     data-descriptions-root
//     data-columns="<1..4>"        (count of columns; default 1)
//     data-bordered                (boolean, when bordered: true)
//   items (each has a label + value):
//     data-desc-item
//     role="group"
//     [data-desc-label]            (consumer-authored)
//     [data-desc-value]            (consumer-authored)
//
// The label and value get associated via aria-labelledby (auto-generated
// id on the label is referenced from the value).

import { setAttr, ensureId } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

export function createDescriptions(opts = {}) {
    const o = opts || {};
    const columns = (typeof o.columns === "number" && o.columns >= 1 && o.columns <= 4)
                  ? Math.floor(o.columns) : 1;
    const bordered = !!o.bordered;
    const _destroyed = { v: false };
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-descriptions-root", "");
        setAttr(el, "data-columns", String(columns));
        if (bordered) setAttr(el, "data-bordered", "");
        const off = () => {
            removeAttr(el, "data-descriptions-root");
            removeAttr(el, "data-columns");
            removeAttr(el, "data-bordered");
        };
        addCleanup(off);
        return off;
    }

    function attachItem(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-desc-item", "");
        if (!el.hasAttribute("role")) setAttr(el, "role", "group");
        // Wire aria-labelledby on value pointing at label's id.
        const label = el.querySelector("[data-desc-label]");
        const value = el.querySelector("[data-desc-value]");
        if (label) {
            ensureId(label, "lh-desc-label");
            if (value && !value.hasAttribute("aria-labelledby")) {
                setAttr(value, "aria-labelledby", label.id);
            }
        }
        const off = () => {
            removeAttr(el, "data-desc-item");
            if (el.getAttribute("role") === "group") removeAttr(el, "role");
            if (value && label && value.getAttribute("aria-labelledby") === label.id) {
                value.removeAttribute("aria-labelledby");
            }
        };
        addCleanup(off);
        return off;
    }

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
    }

    return {
        get columns() { return columns; },
        get bordered() { return bordered; },
        attachRoot, attachItem,
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
