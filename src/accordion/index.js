// @zakkster/lite-headless / accordion / index.js
//
// Headless accordion. N items, each with a trigger + panel. Two modes:
//
//   type: "single"    -- at most one panel open at a time (default)
//                        collapsible:false (default) means an open
//                        panel can only be closed by opening another;
//                        collapsible:true allows closing the active
//                        one by clicking its trigger.
//   type: "multiple"  -- any number of panels open simultaneously
//
//   const acc = createAccordion({
//       type: "single",
//       collapsible: true,
//       defaultValue: "billing",
//   });
//   acc.attachRoot(rootEl);
//   acc.attachItem(itemEl, "billing");
//   acc.attachTrigger(triggerEl, "billing");
//   acc.attachPanel(panelEl, "billing");
//
// VALUE SHAPE
//
// type:"single"    -> value is a string | null (the open key, or null
//                     when collapsed)
// type:"multiple"  -> value is a string[] (the set of open keys)
//
// ANIMATION CONTRACT
//
// Animation is NOT in the primitive. The primitive writes:
//   trigger.aria-expanded = "true" | "false"
//   trigger.data-open     = present when open (boolean)
//   panel.data-open       = present when open (boolean)
//   panel.hidden          (only when closed AND no transition wanted;
//                          we don't auto-set this -- CSS-driven
//                          animation requires the panel to stay in the
//                          DOM with display:block during the transition)
//
// CSS is the consumer's call. Two recommended patterns:
//
//   1. Modern: `interpolate-size: allow-keywords` (Chrome 129+/Safari 18+)
//      lets you transition `height: 0` <-> `height: auto` directly.
//
//      [data-accordion-panel] { height: 0; overflow: hidden;
//          transition: height 200ms; interpolate-size: allow-keywords; }
//      [data-accordion-panel][data-open] { height: auto; }
//
//   2. Universal: animate `grid-template-rows: 0fr` -> `1fr` on the
//      panel's wrapper. Works in all evergreens; no JS dance needed.
//
//      [data-accordion-panel] { display: grid; grid-template-rows: 0fr;
//          transition: grid-template-rows 200ms; }
//      [data-accordion-panel] > * { overflow: hidden; }
//      [data-accordion-panel][data-open] { grid-template-rows: 1fr; }
//
// KEYBOARD
//
// Per WAI-ARIA APG accordion pattern, ALL triggers are in the tab
// sequence (not roving). Arrow keys move focus between triggers; tab
// moves out of the accordion entirely.
//
//   ArrowDown / ArrowUp -- next / previous trigger (wraps)
//   Home / End          -- first / last enabled trigger
//   Enter / Space       -- activates (which is just a click on a button)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { uniqueId, setAttr, toggleAttr } from "../_overlay/aria.js";

const noop = () => {};

function asArrayValue(value) {
    if (Array.isArray(value)) return value.slice();
    if (value == null) return [];
    return [String(value)];
}

export function createAccordion(options = {}) {
    const {
        type = "single",
        collapsible = false,
        value: valueSignal,
        defaultValue,
        onValueChange,
    } = options;

    if (type !== "single" && type !== "multiple") {
        throw new Error(`createAccordion: type must be "single" or "multiple", got "${type}"`);
    }

    // Normalize initial value to the type's expected shape.
    let initialValue;
    if (type === "multiple") {
        initialValue = asArrayValue(defaultValue);
    } else {
        initialValue = (Array.isArray(defaultValue) ? defaultValue[0] : defaultValue) ?? null;
    }

    const _value = valueSignal || makeSignal(initialValue);
    let _destroyed = false;

    // items[i] = { el, key, id }
    const _items = new Map();        // key -> item entry
    const _triggers = new Map();     // key -> { el, id }
    const _panels = new Map();       // key -> { el, id }
    const _disabled = new Set();     // keys disabled at runtime

    // v0.7.9: per-key transition lock. Equivalent to GSAP's isTweening:
    // while a panel is mid-CSS-transition, swallow further CLICKS on its
    // trigger so rapid mashing doesn't interrupt the animation and
    // produce flicker. Programmatic API (setValue/toggle/open/close)
    // is NOT guarded -- code is authoritative.
    //
    // Duration is auto-detected from the panel's computed
    // transition-duration + transition-delay; we take the max across
    // comma-separated property lists so consumers can transition multiple
    // properties at different speeds. If the panel has no transition
    // (duration === 0), the lock is never set and clicks pass through
    // unmodified. Pure CSS swap-on-display:none consumers don't pay.
    //
    // Single mode: clicking "b" while "a" is open also triggers "a" to
    // close. Both keys go into _transitioning together so a third quick
    // click on "a" doesn't restart "a"'s transition mid-flight.
    const _transitioning = new Set();      // keys currently mid-transition
    const _transitionTimers = new Map();   // key -> timeout id (for cleanup)

    function _measureTransitionMs(panelEl) {
        if (typeof getComputedStyle === "undefined") return 0;
        let cs;
        try { cs = getComputedStyle(panelEl); } catch { return 0; }
        if (!cs) return 0;
        const durStr = cs.transitionDuration || "0s";
        const dlyStr = cs.transitionDelay || "0s";
        // CSS shorthand can list multiple properties; their durations are
        // returned comma-separated. Take the max so the lock holds until
        // the SLOWEST property finishes.
        const durations = durStr.split(",");
        const delays    = dlyStr.split(",");
        let maxMs = 0;
        for (let i = 0; i < durations.length; i++) {
            const d   = parseFloat(durations[i]) || 0;
            const dly = parseFloat(delays[i % delays.length]) || 0;
            const total = (d + dly) * 1000;
            if (total > maxMs) maxMs = total;
        }
        return maxMs;
    }

    function _lockKey(key) {
        const panel = _panels.get(key);
        if (!panel) return;
        const ms = _measureTransitionMs(panel.el);
        if (ms <= 0) return;                // no transition -> no lock
        _transitioning.add(key);
        // clear any prior timer for this key (defensive; shouldn't happen
        // because the click guard prevents re-entry, but if programmatic
        // calls interleave with clicks we want the latest to win)
        const prev = _transitionTimers.get(key);
        if (prev != null) clearTimeout(prev);
        const tid = setTimeout(() => {
            _transitioning.delete(key);
            _transitionTimers.delete(key);
        }, ms + 8);                          // tiny pad so CSS settles
        _transitionTimers.set(key, tid);
    }

    // ordered key list for arrow nav (matches DOM order of trigger attach)
    const _orderedKeys = [];

    let _rootEl = null;

    // ---- helpers --------------------------------------------------------

    function isOpen(key) {
        const v = _value();
        if (type === "single") return v === key;
        return Array.isArray(v) && v.indexOf(key) !== -1;
    }

    function commitValue(nextValue, reason) {
        if (_destroyed) return;
        const cur = _value();
        // shallow-equality check (works for both string and array)
        if (type === "single" && cur === nextValue) return;
        if (type === "multiple" && Array.isArray(cur) && Array.isArray(nextValue) &&
            cur.length === nextValue.length && cur.every((k, i) => k === nextValue[i])) return;
        _value.set(nextValue);
        if (onValueChange) {
            try { onValueChange(nextValue, reason || "set"); } catch { /* swallow */ }
        }
    }

    function toggle(key, reason) {
        if (_destroyed || _disabled.has(key)) return;
        if (!_triggers.has(key)) return;
        if (type === "single") {
            if (_value() === key) {
                if (collapsible) commitValue(null, reason || "toggle");
                // else: clicking the open trigger is a no-op
                return;
            }
            commitValue(key, reason || "toggle");
            return;
        }
        // multiple
        const cur = Array.isArray(_value()) ? _value() : [];
        const idx = cur.indexOf(key);
        if (idx >= 0) {
            const next = cur.slice();
            next.splice(idx, 1);
            commitValue(next, reason || "toggle");
        } else {
            commitValue(cur.concat(key), reason || "toggle");
        }
    }

    function openKey(key, reason) {
        if (_destroyed || _disabled.has(key)) return;
        if (!_triggers.has(key)) return;
        if (type === "single") {
            if (_value() !== key) commitValue(key, reason || "open");
            return;
        }
        const cur = Array.isArray(_value()) ? _value() : [];
        if (cur.indexOf(key) === -1) commitValue(cur.concat(key), reason || "open");
    }

    function closeKey(key, reason) {
        if (_destroyed) return;
        if (type === "single") {
            if (_value() === key) {
                // for non-collapsible single, closing is allowed via the
                // explicit close() API even though clicking can't do it
                commitValue(null, reason || "close");
            }
            return;
        }
        const cur = Array.isArray(_value()) ? _value() : [];
        const idx = cur.indexOf(key);
        if (idx === -1) return;
        const next = cur.slice();
        next.splice(idx, 1);
        commitValue(next, reason || "close");
    }

    // ---- ARIA + state painting -----------------------------------------
    // One effect, triggered on value() changes, sweeps every registered
    // trigger + panel. Cheap (these collections are small; an accordion
    // with 100 items would be unusual).
    const stopPaint = effect(() => {
        _value();   // dep
        for (const [key, t] of _triggers) {
            const open = isOpen(key);
            setAttr(t.el, "aria-expanded", open ? "true" : "false");
            toggleAttr(t.el, "data-open", open);
        }
        for (const [key, p] of _panels) {
            const open = isOpen(key);
            toggleAttr(p.el, "data-open", open);
            // We deliberately do NOT toggle `hidden` here -- CSS-driven
            // animation (grid-template-rows / interpolate-size) requires
            // the panel to stay in the DOM with display:block during the
            // transition. Consumer can opt in via CSS:
            //    [data-accordion-panel]:not([data-open]) { display: none; }
            // if they don't want animation.
        }
    });

    // ---- attach* lifecycle ---------------------------------------------

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        setAttr(el, "data-orientation", "vertical");
        // Accordion has no formal "role" -- "presentation" group is fine.
        // The role is on each item's <h3>-wrapped trigger conceptually;
        // we don't enforce header markup since consumers may have their
        // own. We DO write data-type for CSS hooks.
        setAttr(el, "data-accordion-type", type);

        return () => {
            if (_rootEl === el) {
                el.removeAttribute("data-orientation");
                el.removeAttribute("data-accordion-type");
                _rootEl = null;
            }
        };
    }

    function attachItem(el, key) {
        if (!el || _destroyed) return noop;
        if (key == null) throw new Error("createAccordion.attachItem: key is required");
        const entry = { el, key };
        _items.set(key, entry);
        // NB: we do NOT set data-accordion-item -- it's the consumer's
        // discovery marker carrying the key as its value, and the wrapper
        // reads it to know which key to pass us. Writing it here would
        // clobber that. We only write our own state attribute below if
        // it's not already set.
        if (!el.hasAttribute("data-accordion-key")) {
            setAttr(el, "data-accordion-key", String(key));
        }
        return () => {
            el.removeAttribute("data-accordion-key");
            _items.delete(key);
        };
    }

    function attachTrigger(el, key, triggerOpts = {}) {
        if (!el || _destroyed) return noop;
        if (key == null) throw new Error("createAccordion.attachTrigger: key is required");
        if (!el.id) el.id = uniqueId("lh-acc-trigger");

        const entry = { el, id: el.id };
        _triggers.set(key, entry);
        if (_orderedKeys.indexOf(key) === -1) _orderedKeys.push(key);

        if (triggerOpts.disabled) _disabled.add(key);

        // (we don't write data-accordion-trigger -- consumer owns it as
        // the key-bearing discovery hint)
        const open = isOpen(key);
        setAttr(el, "aria-expanded", open ? "true" : "false");
        toggleAttr(el, "data-open", open);

        if (_disabled.has(key)) {
            setAttr(el, "aria-disabled", "true");
            try { el.disabled = true; } catch {}
        }

        // wire to panel if attached
        const panel = _panels.get(key);
        if (panel) {
            setAttr(el, "aria-controls", panel.id);
            setAttr(panel.el, "aria-labelledby", entry.id);
        }

        const onClick = (e) => {
            if (_disabled.has(key)) return;
            // v0.7.9 guard: ignore the click if this trigger's panel is
            // mid-transition. The lock auto-clears when the measured CSS
            // transition duration elapses, so consumers don't need to
            // configure anything; if there's no transition the lock is
            // never set and clicks pass through.
            if (_transitioning.has(key)) return;

            // In single mode, the toggle may also close a different key
            // (the previously-active one). Capture its identity BEFORE
            // commitValue runs so we can lock it out too.
            const prevActive = (type === "single") ? _value() : null;

            toggle(key, "click");

            // Lock the just-toggled key during its transition.
            _lockKey(key);
            // Single mode: if we just swapped from prevActive to key,
            // prevActive's panel is also closing. Lock it so a rapid
            // re-click on prevActive doesn't restart its transition.
            if (prevActive != null && prevActive !== key) _lockKey(prevActive);
        };
        const onKey = (e) => {
            if (_disabled.has(key)) return;
            // ArrowDown/Up move focus between triggers; we don't activate
            // (accordion APG explicitly contrasts itself with tabs here)
            const k = e.key;
            if (k === "ArrowDown")      { e.preventDefault(); focusRel(key, +1); }
            else if (k === "ArrowUp")   { e.preventDefault(); focusRel(key, -1); }
            else if (k === "Home")      { e.preventDefault(); focusFirst(); }
            else if (k === "End")       { e.preventDefault(); focusLast(); }
            // Enter/Space are handled by the browser's native button
            // semantics; they synthesize a click which onClick handles.
        };
        el.addEventListener("click", onClick);
        el.addEventListener("keydown", onKey);

        return () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKey);
            el.removeAttribute("data-open");
            el.removeAttribute("aria-expanded");
            el.removeAttribute("aria-controls");
            if (_disabled.has(key)) el.removeAttribute("aria-disabled");
            _triggers.delete(key);
            const idx = _orderedKeys.indexOf(key);
            if (idx >= 0) _orderedKeys.splice(idx, 1);
        };
    }

    function attachPanel(el, key) {
        if (!el || _destroyed) return noop;
        if (key == null) throw new Error("createAccordion.attachPanel: key is required");
        if (!el.id) el.id = uniqueId("lh-acc-panel");

        const entry = { el, id: el.id };
        _panels.set(key, entry);

        // (we don't write data-accordion-panel -- consumer owns it)
        // role="region" labelled by the trigger is the WAI-ARIA APG
        // recommendation. "region" causes ATs to expose the panel as a
        // landmark, which is what we want for keyboard nav.
        setAttr(el, "role", "region");
        const open = isOpen(key);
        toggleAttr(el, "data-open", open);

        const trigger = _triggers.get(key);
        if (trigger) {
            setAttr(el, "aria-labelledby", trigger.id);
            setAttr(trigger.el, "aria-controls", el.id);
        }

        return () => {
            el.removeAttribute("role");
            el.removeAttribute("data-open");
            el.removeAttribute("aria-labelledby");
            _panels.delete(key);
        };
    }

    // ---- focus helpers --------------------------------------------------

    function focusKey(key) {
        const t = _triggers.get(key);
        if (t && t.el && typeof t.el.focus === "function") {
            try { t.el.focus(); } catch {}
        }
    }

    function enabledKeys() {
        const out = [];
        for (let i = 0; i < _orderedKeys.length; i++) {
            const k = _orderedKeys[i];
            if (!_disabled.has(k)) out.push(k);
        }
        return out;
    }

    function focusRel(fromKey, delta) {
        const keys = enabledKeys();
        if (keys.length === 0) return;
        let i = keys.indexOf(fromKey);
        if (i < 0) i = 0;
        const next = (i + delta + keys.length) % keys.length;
        focusKey(keys[next]);
    }
    function focusFirst() {
        const keys = enabledKeys();
        if (keys.length) focusKey(keys[0]);
    }
    function focusLast() {
        const keys = enabledKeys();
        if (keys.length) focusKey(keys[keys.length - 1]);
    }

    // ---- public mutations -----------------------------------------------

    function setValue(v, reason) {
        if (_destroyed) return;
        let next;
        if (type === "single") {
            next = (v == null) ? null : String(v);
        } else {
            // multiple: dedupe but DO NOT filter unknown keys. A consumer
            // may setValue(...) before attaching all triggers (e.g.
            // hydrating from a URL or stored prefs); when those triggers
            // attach later, the matching keys render open immediately.
            const seen = new Set();
            next = asArrayValue(v).filter((k) => {
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            });
        }
        commitValue(next, reason || "set");
    }

    function setDisabled(key, flag) {
        if (flag) _disabled.add(key);
        else _disabled.delete(key);

        const t = _triggers.get(key);
        if (t) {
            if (flag) {
                setAttr(t.el, "aria-disabled", "true");
                try { t.el.disabled = true; } catch {}
            } else {
                t.el.removeAttribute("aria-disabled");
                try { t.el.disabled = false; } catch {}
            }
        }

        // For type:"single", if you disable the open key while it's
        // open, close it (don't force collapsibility -- if non-
        // collapsible, the user could still re-enable later and reopen)
        if (flag && type === "single" && _value() === key) {
            commitValue(null, "disable-fallback");
        }
        if (flag && type === "multiple") {
            const cur = Array.isArray(_value()) ? _value() : [];
            const idx = cur.indexOf(key);
            if (idx >= 0) {
                const next = cur.slice();
                next.splice(idx, 1);
                commitValue(next, "disable-fallback");
            }
        }
    }

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPaint();
        // v0.7.9: clear any in-flight transition timers so a destroy
        // mid-animation doesn't leak setTimeout callbacks
        for (const tid of _transitionTimers.values()) clearTimeout(tid);
        _transitionTimers.clear();
        _transitioning.clear();
    }

    return {
        // signals
        value: () => _value(),
        isOpen,

        // mutations
        setValue, toggle,
        open: openKey, close: closeKey,
        setDisabled,

        // navigation
        focusFirst, focusLast, focusKey,

        // lifecycle
        attachRoot, attachItem, attachTrigger, attachPanel,
        destroy,
        get destroyed() { return _destroyed; },

        // introspection
        _orderedKeys: () => _orderedKeys.slice(),
    };
}
