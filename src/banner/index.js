// @zakkster/lite-headless / banner / index.js
//
// createBanner(options) -> BannerHandle
//
// Dismissible page-level alert. Distinct from toast (which is
// floating + ephemeral): the banner is a static slot in the page that
// can be shown/hidden + supports re-opening after dismiss.
//
// Kinds: info, success, warning, error. Kind controls the ARIA role
// (error/warning -> "alert" for assistive-tech announcement;
// info/success -> "status" for less-urgent updates).
//
// State:
//   open()        -- reactive: true if currently shown
//   kind()        -- reactive: "info" | "success" | "warning" | "error"
//
// Mutations:
//   dismiss()     -- close (fires onDismiss)
//   show()        -- open
//   setOpen(b)
//   setKind(k)
//
// Paint:
//   data-kind="<kind>"
//   data-open / data-hidden
//   role=alert (warning/error) or role=status (info/success)
//   aria-live=assertive (warning/error) or polite (info/success)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";

function noop() {}

const VALID_KINDS = ["info", "success", "warning", "error"];

function normalizeKind(k) {
    return VALID_KINDS.indexOf(k) === -1 ? "info" : k;
}

function ariaForKind(k) {
    // error + warning are urgent; info + success are not.
    return k === "error" || k === "warning"
        ? { role: "alert",  live: "assertive" }
        : { role: "status", live: "polite" };
}

export function createBanner(options = {}) {
    const {
        defaultOpen = true,
        defaultKind = "info",
        onOpenChange,
        onDismiss,
        dismissOnEscape = false,
    } = options;

    let _destroyed = false;
    const _cleanups = [];
    function addCleanup(fn) { if (fn) _cleanups.push(fn); }

    const _open = makeSignal(!!defaultOpen);
    const _kind = makeSignal(normalizeKind(defaultKind));

    // ----- accessors -----------------------------------------------------

    function isOpen() { return _open(); }
    function kind() { return _kind(); }

    // ----- mutations -----------------------------------------------------

    function setOpen(b) {
        if (_destroyed) return;
        const next = !!b;
        if (next === _open()) return;
        _open.set(next);
        if (onOpenChange) {
            try { onOpenChange(next); } catch {}
        }
        if (!next && onDismiss) {
            try { onDismiss(); } catch {}
        }
    }

    function show()    { setOpen(true); }
    function dismiss() { setOpen(false); }

    function setKind(k) {
        if (_destroyed) return;
        const next = normalizeKind(k);
        if (next === _kind()) return;
        _kind.set(next);
    }

    // ----- attach: root --------------------------------------------------

    let _root = null;
    let _escapeOff = null;

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _root = el;
        ensureId(el, "lh-banner");
        // Reactive paint of kind + open state + ARIA role/live.
        let _lastRole = null;
        let _lastLive = null;
        let _lastKind = null;
        const stop = effect(() => {
            const k = _kind();
            const isOpen = _open();
            const aria = ariaForKind(k);
            if (_lastKind !== k) {
                setAttr(el, "data-kind", k);
                _lastKind = k;
            }
            if (_lastRole !== aria.role) {
                setAttr(el, "role", aria.role);
                _lastRole = aria.role;
            }
            if (_lastLive !== aria.live) {
                setAttr(el, "aria-live", aria.live);
                _lastLive = aria.live;
            }
            toggleAttr(el, "data-open",   isOpen);
            toggleAttr(el, "data-hidden", !isOpen);
        });
        addCleanup(stop);

        // Optional: Esc dismisses.
        if (dismissOnEscape) {
            const onKey = (ev) => {
                if (ev.key === "Escape" && _open()) {
                    ev.preventDefault();
                    dismiss();
                }
            };
            // Listen at the document level (banner is page-level).
            const owner = el.ownerDocument || document;
            owner.addEventListener("keydown", onKey);
            _escapeOff = () => owner.removeEventListener("keydown", onKey);
            addCleanup(_escapeOff);
        }

        const off = () => {
            stop();
            if (_escapeOff) { _escapeOff(); _escapeOff = null; }
            if (_root === el) {
                el.removeAttribute("role");
                el.removeAttribute("aria-live");
                el.removeAttribute("data-kind");
                el.removeAttribute("data-open");
                el.removeAttribute("data-hidden");
                _root = null;
            }
        };
        addCleanup(off);
        return off;
    }

    // ----- attach: dismiss button ----------------------------------------

    function attachDismissButton(el) {
        if (!el || _destroyed) return noop;
        if (!el.hasAttribute("type")) setAttr(el, "type", "button");
        setAttr(el, "aria-label", "Dismiss");
        const onClick = (ev) => { ev.preventDefault(); dismiss(); };
        el.addEventListener("click", onClick);
        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeAttribute("aria-label");
        };
        addCleanup(off);
        return off;
    }

    // ----- teardown -------------------------------------------------------

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
        _root = null;
    }

    return {
        isOpen, kind,
        setOpen, show, dismiss, setKind,
        attachRoot, attachDismissButton,
        destroy,
        get destroyed() { return _destroyed; },
    };
}
