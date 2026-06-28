// @zakkster/lite-headless / card
//
// Container primitive: header / body / footer slots, optionally
// collapsible or dismissible. The cornerstone of every admin
// dashboard.
//
// Slots are detected by data attributes (consumer-authored markup):
//
//   <lite-card>
//     <div data-card-header>Title</div>
//     <div data-card-body>Content</div>
//     <div data-card-footer>Actions</div>
//   </lite-card>
//
// Painted attributes:
//   root:
//     role="region"               (when label provided)
//     aria-label=<label>          (when label provided and not pre-set)
//     data-card-root
//     data-open              (boolean, when collapsible + collapsed)
//     data-hidden              (boolean, when dismissible + dismissed)
//   collapse trigger:
//     aria-expanded="true|false"  (when collapsible)
//     aria-controls=<body-id>     (when collapsible + body has id)
//   body:
//     id (auto-generated for aria-controls when collapsible)
//     hidden                      (when collapsible + collapsed; for SR + non-CSS)
//
// State machines: none by default; opt-in for collapsible + dismissible.
//
// Collapsible toggle source: a child element with [data-card-collapse-trigger]
// (or, by default, anywhere inside the header) -- click toggles.
//
// Dismissible source: a child element with [data-card-dismiss] -- click dismisses.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

export function createCard(opts = {}) {
    const o = opts || {};
    const collapsible = !!o.collapsible;
    const dismissible = !!o.dismissible;
    const label       = typeof o.label === "string" ? o.label : null;
    const onCollapseChange = typeof o.onCollapseChange === "function" ? o.onCollapseChange : null;
    const onDismiss        = typeof o.onDismiss        === "function" ? o.onDismiss        : null;

    const _collapsed = makeSignal(!!o.collapsed);
    const _dismissed = makeSignal(!!o.dismissed);
    const _destroyed = { v: false };

    let _rootEl = null;
    let _bodyEl = null;
    let _triggerEl = null;
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    // ─── mutations ───────────────────────────────────────────────────

    function setCollapsed(b, reason) {
        if (_destroyed.v || !collapsible) return;
        if (_collapsed() === !!b) return;
        _collapsed.set(!!b);
        if (onCollapseChange) try { onCollapseChange(!!b, reason || "api"); } catch {}
    }

    function toggle(reason) {
        if (!collapsible) return;
        setCollapsed(!_collapsed(), reason || "toggle");
    }

    function dismiss(reason) {
        if (_destroyed.v || !dismissible) return;
        if (_dismissed()) return;
        _dismissed.set(true);
        if (onDismiss) try { onDismiss(reason || "api"); } catch {}
    }

    function reopen() {
        if (_destroyed.v) return;
        if (!_dismissed()) return;
        _dismissed.set(false);
    }

    function isCollapsed() { return _collapsed(); }
    function isDismissed() { return _dismissed(); }

    // ─── attach: root ────────────────────────────────────────────────

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        _rootEl = el;
        setAttr(el, "data-card-root", "");
        if (label && !el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby")) {
            setAttr(el, "aria-label", label);
            if (!el.hasAttribute("role")) setAttr(el, "role", "region");
        }
        const stop = effect(() => {
            toggleAttr(el, "data-open", collapsible && !_collapsed());
            toggleAttr(el, "data-hidden", dismissible && _dismissed());
            if (dismissible && _dismissed()) {
                setAttr(el, "hidden", "");
            } else {
                removeAttr(el, "hidden");
            }
        });
        addCleanup(stop);
        const off = () => {
            stop();
            removeAttr(el, "data-card-root");
            removeAttr(el, "data-open");
            removeAttr(el, "data-hidden");
            removeAttr(el, "hidden");
            if (label && el.getAttribute("aria-label") === label) removeAttr(el, "aria-label");
            if (el.getAttribute("role") === "region") removeAttr(el, "role");
            if (_rootEl === el) _rootEl = null;
        };
        addCleanup(off);
        return off;
    }

    // ─── attach: body ────────────────────────────────────────────────

    function attachBody(el) {
        if (!el || _destroyed.v) return noop;
        _bodyEl = el;
        setAttr(el, "data-card-body", "");
        if (collapsible) ensureId(el, "lh-card-body");
        // Paint collapsed visibility on body
        const stop = effect(() => {
            if (collapsible && _collapsed()) setAttr(el, "hidden", "");
            else removeAttr(el, "hidden");
        });
        addCleanup(stop);
        // If a trigger was already attached, wire aria-controls now.
        if (_triggerEl && collapsible) {
            setAttr(_triggerEl, "aria-controls", el.id);
        }
        const off = () => {
            stop();
            removeAttr(el, "data-card-body");
            removeAttr(el, "hidden");
            if (_bodyEl === el) _bodyEl = null;
        };
        addCleanup(off);
        return off;
    }

    // ─── attach: collapse trigger ────────────────────────────────────

    function attachCollapseTrigger(el) {
        if (!el || _destroyed.v || !collapsible) return noop;
        _triggerEl = el;
        if (_bodyEl && _bodyEl.id) setAttr(el, "aria-controls", _bodyEl.id);
        const stop = effect(() => {
            setAttr(el, "aria-expanded", _collapsed() ? "false" : "true");
        });
        addCleanup(stop);
        const onClick = (ev) => { toggle("click"); };
        const onKey = (ev) => {
            // Native <button>s already trigger click on Enter/Space.
            // For non-button triggers (e.g., divs), wire it.
            if (el.tagName === "BUTTON") return;
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                toggle("keyboard");
            }
        };
        el.addEventListener("click", onClick);
        el.addEventListener("keydown", onKey);
        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKey);
            removeAttr(el, "aria-expanded");
            removeAttr(el, "aria-controls");
            if (_triggerEl === el) _triggerEl = null;
        };
        addCleanup(off);
        return off;
    }

    // ─── attach: dismiss button ──────────────────────────────────────

    function attachDismissButton(el) {
        if (!el || _destroyed.v || !dismissible) return noop;
        setAttr(el, "data-card-dismiss", "");
        if (!el.hasAttribute("aria-label")) setAttr(el, "aria-label", "Dismiss");
        const onClick = () => { dismiss("click"); };
        el.addEventListener("click", onClick);
        const off = () => {
            el.removeEventListener("click", onClick);
            removeAttr(el, "data-card-dismiss");
        };
        addCleanup(off);
        return off;
    }

    // ─── destroy ─────────────────────────────────────────────────────

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
        _rootEl = null; _bodyEl = null; _triggerEl = null;
    }

    return {
        isCollapsed, isDismissed,
        get collapsible() { return collapsible; },
        get dismissible() { return dismissible; },
        setCollapsed, toggle, dismiss, reopen,
        attachRoot, attachBody, attachCollapseTrigger, attachDismissButton,
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
