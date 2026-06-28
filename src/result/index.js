// @zakkster/lite-headless / result
//
// Page state primitive: success / error / warning / info / empty /
// 404 / 403 / 500. Used as the bigger sibling of empty-state, typically
// occupying the main content area to communicate an outcome.
//
// Structurally identical to empty-state but with a richer status
// vocabulary and the convention of being a "page-level" element
// (centered, with title + subtitle + actions row).
//
// Painted attributes:
//   root:
//     role="status"
//     data-result-root
//     data-status="success|error|warning|info|empty|404|403|500"
//   icon:        data-result-icon       aria-hidden="true"
//   title:       data-result-title
//   subtitle:    data-result-subtitle
//   actions:     data-result-actions    role="group"

import { setAttr } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

const VALID_STATUS = new Set([
    "success", "error", "warning", "info", "empty",
    "404", "403", "500",
]);

export function createResult(opts = {}) {
    const o = opts || {};
    const status = VALID_STATUS.has(o.status) ? o.status : "info";
    const _destroyed = { v: false };
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-result-root", "");
        setAttr(el, "data-status", status);
        if (!el.hasAttribute("role")) setAttr(el, "role", "status");
        const off = () => {
            removeAttr(el, "data-result-root");
            removeAttr(el, "data-status");
            if (el.getAttribute("role") === "status") removeAttr(el, "role");
        };
        addCleanup(off);
        return off;
    }

    function attachIcon(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-result-icon", "");
        if (!el.hasAttribute("aria-hidden")) setAttr(el, "aria-hidden", "true");
        const off = () => {
            removeAttr(el, "data-result-icon");
            if (el.getAttribute("aria-hidden") === "true") removeAttr(el, "aria-hidden");
        };
        addCleanup(off);
        return off;
    }

    function attachTitle(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-result-title", "");
        const off = () => removeAttr(el, "data-result-title");
        addCleanup(off);
        return off;
    }

    function attachSubtitle(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-result-subtitle", "");
        const off = () => removeAttr(el, "data-result-subtitle");
        addCleanup(off);
        return off;
    }

    function attachActions(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-result-actions", "");
        if (!el.hasAttribute("role")) setAttr(el, "role", "group");
        const off = () => {
            removeAttr(el, "data-result-actions");
            if (el.getAttribute("role") === "group") removeAttr(el, "role");
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
        get status() { return status; },
        attachRoot, attachIcon, attachTitle, attachSubtitle, attachActions,
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
