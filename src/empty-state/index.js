// @zakkster/lite-headless / empty-state
//
// Headless empty-state. A structural primitive for the "no items" /
// "no results" UI pattern that appears across admin products:
//
//   ┌─────────────────────────┐
//   │      [icon]             │
//   │   No projects yet       │  ← title
//   │   Create one to start   │  ← description
//   │   [Primary]  [Secondary]│  ← actions
//   └─────────────────────────┘
//
// This primitive is intentionally minimal: it wires ARIA structure
// (role="status" + aria-labelledby/describedby chain), tracks
// declarative slot markers (icon, title, description, actions), and
// supports a `variant` attribute for "empty" vs "error" vs "loading"
// kinds. It DOES NOT own the layout (consumer styles it), the icon
// (consumer supplies SVG / glyph), or the action buttons (those are
// just buttons consumer wires up however they want).
//
// Slot markers (consumer markup):
//
//   data-empty-icon          decorative icon container (aria-hidden)
//   data-empty-title         the heading text
//   data-empty-description   the explanatory paragraph
//   data-empty-actions       the CTA button group
//
// Painted on root:
//   role="status"               (live region; announces on attach)
//   aria-labelledby             → title id
//   aria-describedby            → description id
//   data-empty-state-root
//   data-variant="empty"|"error"|"loading"
//   data-empty                  (boolean; for CSS hooks)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

export function createEmptyState(opts = {}) {
    const o = opts || {};
    const _variant = makeSignal(typeof o.variant === "string" ? o.variant : "empty");
    const _destroyed = { v: false };

    let _rootEl = null;
    let _titleEl = null;
    let _descEl = null;
    let _iconEl = null;
    let _actionsEl = null;
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    // Paint ARIA + data-variant on the root.
    const stopPaint = effect(() => {
        const v = _variant();
        if (_rootEl) {
            setAttr(_rootEl, "data-variant", v);
            // data-empty is a boolean marker so consumers can write
            //   [data-empty-state-root][data-empty] { ... }
            // without caring about the variant value.
            toggleAttr(_rootEl, "data-empty", true);
        }
    });
    addCleanup(stopPaint);

    // ─── attach ──────────────────────────────────────────────────────

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        _rootEl = el;
        setAttr(el, "data-empty-state-root", "");
        // Live region: when the empty state appears (e.g. a list went
        // from N items to 0), screen readers announce its content.
        if (!el.hasAttribute("role")) setAttr(el, "role", "status");
        if (!el.hasAttribute("aria-live")) setAttr(el, "aria-live", "polite");
        // Re-paint initial variant.
        setAttr(el, "data-variant", _variant());
        toggleAttr(el, "data-empty", true);
        // Re-link labelledby/describedby in case title/desc were attached first.
        relinkAria();
        const off = () => {
            removeAttr(el, "data-empty-state-root");
            removeAttr(el, "data-variant");
            removeAttr(el, "data-empty");
            removeAttr(el, "role");
            removeAttr(el, "aria-live");
            removeAttr(el, "aria-labelledby");
            removeAttr(el, "aria-describedby");
            if (_rootEl === el) _rootEl = null;
        };
        addCleanup(off);
        return off;
    }

    function attachTitle(el) {
        if (!el || _destroyed.v) return noop;
        _titleEl = el;
        setAttr(el, "data-empty-title", "");
        // Default to <h2>-like role if it's a div/span (consumer can
        // override by using an actual <h2> or <h3> element).
        if (!el.hasAttribute("role") && el.tagName !== "H1" && el.tagName !== "H2"
            && el.tagName !== "H3" && el.tagName !== "H4") {
            setAttr(el, "role", "heading");
            // Default level 2; common admin pattern is empty-state
            // shown inside an existing page section.
            if (!el.hasAttribute("aria-level")) setAttr(el, "aria-level", "2");
        }
        ensureId(el, "lh-empty-title");
        relinkAria();
        const off = () => {
            removeAttr(el, "data-empty-title");
            // Don't blow away role/aria-level on a real <h2>.
            if (el.getAttribute("role") === "heading") removeAttr(el, "role");
            if (_titleEl === el) _titleEl = null;
            relinkAria();
        };
        addCleanup(off);
        return off;
    }

    function attachDescription(el) {
        if (!el || _destroyed.v) return noop;
        _descEl = el;
        setAttr(el, "data-empty-description", "");
        ensureId(el, "lh-empty-desc");
        relinkAria();
        const off = () => {
            removeAttr(el, "data-empty-description");
            if (_descEl === el) _descEl = null;
            relinkAria();
        };
        addCleanup(off);
        return off;
    }

    function attachIcon(el) {
        if (!el || _destroyed.v) return noop;
        _iconEl = el;
        setAttr(el, "data-empty-icon", "");
        // Icons in empty-state are decorative; hide from the a11y tree.
        setAttr(el, "aria-hidden", "true");
        const off = () => {
            removeAttr(el, "data-empty-icon");
            removeAttr(el, "aria-hidden");
            if (_iconEl === el) _iconEl = null;
        };
        addCleanup(off);
        return off;
    }

    function attachActions(el) {
        if (!el || _destroyed.v) return noop;
        _actionsEl = el;
        setAttr(el, "data-empty-actions", "");
        // Group role lets screen readers announce the CTA cluster as
        // a unit (e.g. "Actions, 2 buttons").
        if (!el.hasAttribute("role")) setAttr(el, "role", "group");
        const off = () => {
            removeAttr(el, "data-empty-actions");
            if (el.getAttribute("role") === "group") removeAttr(el, "role");
            if (_actionsEl === el) _actionsEl = null;
        };
        addCleanup(off);
        return off;
    }

    // Re-bind aria-labelledby / aria-describedby on the root when the
    // title or description elements are attached or detached. Idempotent.
    function relinkAria() {
        if (!_rootEl) return;
        if (_titleEl) setAttr(_rootEl, "aria-labelledby",  _titleEl.id);
        else          removeAttr(_rootEl, "aria-labelledby");
        if (_descEl)  setAttr(_rootEl, "aria-describedby", _descEl.id);
        else          removeAttr(_rootEl, "aria-describedby");
    }

    // ─── mutations ──────────────────────────────────────────────────

    function setVariant(v) {
        if (_destroyed.v) return;
        if (typeof v !== "string") return;
        if (_variant() === v) return;
        _variant.set(v);
    }

    function variant() { return _variant(); }

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch { /* swallow */ }
        }
        _cleanups.length = 0;
    }

    return {
        // accessors
        variant,
        // mutations
        setVariant,
        // attach helpers
        attachRoot, attachTitle, attachDescription, attachIcon, attachActions,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
