// @zakkster/lite-headless / button
//
// Thin wrapper around a native <button> that adds reactive
// `pressed` / `loading` / `disabled` states + an optional async
// runner that gates clicks during in-flight work.
//
// Why a primitive at all? Because the THREE STATES + their ARIA
// pairings keep getting re-implemented by every consumer with subtle
// bugs:
//   - aria-pressed for toggle buttons (not "checked", not "selected")
//   - aria-busy + disabled while loading (not just disabled --
//     "disabled" hides from accessibility tree; "busy + disabled"
//     announces "loading" then locks)
//   - blocking clicks during loading (the most common bug: user
//     double-clicks Submit, kicks off two requests)
//
// Usage:
//
//   const btn = createButton({
//       pressed: false,     // for toggle buttons
//       loading: false,
//       disabled: false,
//       onPress: () => { ... },   // fires on click (gated by states)
//   });
//   btn.attachRoot(buttonEl);
//
//   // Toggle button:
//   btn.setPressed(true);
//
//   // Async work + auto-loading:
//   await btn.runAsync(async () => { await submit(); });
//
// State paint:
//   aria-pressed="true|false"  (when toggle: true at construction OR setPressed called)
//   aria-busy="true"           (during loading)
//   disabled                   (DOM attribute; native disabled wins)
//   data-pressed   boolean
//   data-loading   boolean
//   data-disabled  boolean  (mirrors disabled for CSS hooks even if you don't use `disabled` directly)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

export function createButton(opts = {}) {
    const o = opts || {};
    // toggle === true means this is a toggle button (aria-pressed
    // gets painted). If `pressed` is provided as a boolean at
    // construction, toggle is implied true.
    const isToggle = (o.toggle === true) || (typeof o.pressed === "boolean");
    const _pressed   = makeSignal(!!o.pressed);
    const _loading   = makeSignal(!!o.loading);
    const _disabled  = makeSignal(!!o.disabled);
    const onPress    = typeof o.onPress === "function" ? o.onPress : null;
    const _destroyed = { v: false };

    let _rootEl = null;
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    // ─── mutations ───────────────────────────────────────────────────

    function setPressed(b) {
        if (_destroyed.v) return;
        if (!isToggle) return;    // only meaningful for toggle buttons
        if (_pressed() === !!b) return;
        _pressed.set(!!b);
    }

    function setLoading(b) {
        if (_destroyed.v) return;
        if (_loading() === !!b) return;
        _loading.set(!!b);
    }

    function setDisabled(b) {
        if (_destroyed.v) return;
        if (_disabled() === !!b) return;
        _disabled.set(!!b);
    }

    function isPressed()  { return _pressed(); }
    function isLoading()  { return _loading(); }
    function isDisabled() { return _disabled(); }
    // canPress is the gate: true iff a click should be honored.
    function canPress() { return !_disabled() && !_loading() && !_destroyed.v; }

    // Run an async fn with auto-loading. Returns the same Promise the
    // fn returns (or one wrapping a sync return). Blocks new presses
    // while in flight; if a press fires during loading, it's ignored.
    async function runAsync(fn) {
        if (typeof fn !== "function") return;
        if (!canPress()) return;
        setLoading(true);
        try {
            return await fn();
        } finally {
            setLoading(false);
        }
    }

    // ─── attach ──────────────────────────────────────────────────────

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        _rootEl = el;
        setAttr(el, "data-button-root", "");

        // Reactive paint
        const stop = effect(() => {
            const p = _pressed();
            const l = _loading();
            const d = _disabled();

            toggleAttr(el, "data-pressed",  p);
            toggleAttr(el, "data-loading",  l);
            toggleAttr(el, "data-disabled", d);

            if (isToggle) setAttr(el, "aria-pressed", p ? "true" : "false");
            else if (el.hasAttribute("aria-pressed")) removeAttr(el, "aria-pressed");

            if (l) setAttr(el, "aria-busy", "true");
            else if (el.getAttribute("aria-busy") === "true") removeAttr(el, "aria-busy");

            // Lock the native button via `disabled`. We disable when
            // EITHER explicitly disabled OR loading -- "loading"
            // semantically means "this control is unavailable right
            // now". Without this lock, double-clicks during async
            // submit re-fire onPress.
            if (d || l) {
                if (!el.hasAttribute("disabled")) setAttr(el, "disabled", "");
            } else {
                if (el.hasAttribute("disabled")) removeAttr(el, "disabled");
            }
        });
        addCleanup(stop);

        // Click handler
        const onClick = (ev) => {
            if (!canPress()) {
                // Belt-and-suspenders: even though the native disabled
                // would block this, JS-dispatched clicks bypass that.
                ev.preventDefault();
                ev.stopImmediatePropagation();
                return;
            }
            if (isToggle) setPressed(!_pressed());
            if (onPress) {
                try {
                    const r = onPress(ev);
                    // If onPress returns a Promise, auto-route through
                    // runAsync semantics (lock during the promise).
                    if (r && typeof r.then === "function") {
                        setLoading(true);
                        r.finally(() => setLoading(false));
                    }
                } catch {}
            }
        };
        el.addEventListener("click", onClick);

        // Keyboard: native <button> already handles Enter + Space, so
        // we don't bind anything here. The click handler fires
        // automatically for keyboard activation on real buttons.

        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            removeAttr(el, "data-button-root");
            removeAttr(el, "data-pressed");
            removeAttr(el, "data-loading");
            removeAttr(el, "data-disabled");
            removeAttr(el, "aria-busy");
            if (isToggle) removeAttr(el, "aria-pressed");
            // Don't blow away `disabled` -- we don't own it from the
            // outside. The reactive effect already cleared it when
            // setDisabled(false) was called; if it was set externally,
            // it stays.
            if (_rootEl === el) _rootEl = null;
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
        _rootEl = null;
    }

    return {
        // accessors
        isPressed, isLoading, isDisabled, canPress,
        get toggle() { return isToggle; },
        // mutations
        setPressed, setLoading, setDisabled, runAsync,
        // attach
        attachRoot,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
