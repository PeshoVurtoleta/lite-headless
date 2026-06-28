// @zakkster/lite-headless / tour
//
// Headless multi-step coach mark / product tour. Each step anchors to
// a target element and renders content (title, description, actions).
// The primitive owns:
//
//   - Step list management (add/remove + reactive index)
//   - Navigation: next, prev, skip, finish, goTo
//   - Focus management: focus moves to the current step's content
//     when the step changes
//   - Keyboard: Escape -> skip, ArrowRight -> next, ArrowLeft -> prev
//   - ARIA paint on target (aria-describedby chain) and on step content
//   - Events: stepchange, complete, skip
//
// What this primitive does NOT own:
//   - Layout / positioning. Consumer positions step content however
//     they want (Floating UI, CSS anchors, fixed-position overlay,
//     or composing with createPopover). The primitive provides the
//     target element reference; consumer handles the math.
//   - Backdrop with cutout. Consumer renders the backdrop; the
//     primitive paints `data-tour-target` on the current target so
//     CSS can cut a hole or apply a spotlight.
//   - Persistence. Consumer decides whether "tour completed" gets
//     stored in localStorage / a server.
//
// Wire it up:
//
//   const tour = createTour({
//       onStepChange: (idx, step) => { /* position the popover */ },
//       onComplete:   ()           => { /* mark done in storage */ },
//       onSkip:       (atIdx)      => { /* mark dismissed */ },
//   });
//
//   tour.addStep({ id: "nav", target: document.querySelector("#nav") });
//   tour.addStep({ id: "new", target: document.querySelector("#new-btn") });
//
//   tour.attachRoot(rootEl);
//   tour.attachStepContent("nav", contentForNavEl);
//   tour.attachStepContent("new", contentForNewEl);
//
//   tour.start();

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

export function createTour(opts = {}) {
    const o = opts || {};
    const onStepChange = typeof o.onStepChange === "function" ? o.onStepChange : null;
    const onComplete   = typeof o.onComplete   === "function" ? o.onComplete   : null;
    const onSkip       = typeof o.onSkip       === "function" ? o.onSkip       : null;
    const loop         = !!o.loop;     // default false; tours usually don't wrap

    // -1 = not started. 0..steps.length-1 = visible step.
    const _index = makeSignal(-1);
    const _destroyed = { v: false };
    const _steps = [];        // [{ id, target, contentEl: null, off: null }]
    let _rootEl = null;
    let _bound = false;
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    function indexOfId(id) {
        for (let i = 0; i < _steps.length; i++) {
            if (_steps[i].id === id) return i;
        }
        return -1;
    }

    // ─── step registry ───────────────────────────────────────────────

    function addStep(step) {
        if (_destroyed.v || !step) return null;
        const id = typeof step.id === "string" ? step.id : ("step-" + _steps.length);
        if (indexOfId(id) >= 0) return null;    // duplicate id
        _steps.push({
            id,
            target:    step.target || null,    // Element | null
            contentEl: null,                   // wired by attachStepContent
            title:     step.title || "",
            description: step.description || "",
        });
        return id;
    }

    function removeStep(id) {
        if (_destroyed.v) return;
        const idx = indexOfId(id);
        if (idx < 0) return;
        // Clean up paint on current target if removing the active step.
        const cur = _index();
        if (cur === idx) clearActiveTargetPaint();
        _steps.splice(idx, 1);
        // Re-index if we removed something before the current step.
        if (cur > idx) _index.set(cur - 1);
        else if (cur === idx) {
            // Active step removed; bound or skip.
            if (_steps.length === 0) _index.set(-1);
            else _index.set(Math.min(cur, _steps.length - 1));
        }
    }

    function steps() { return _steps.slice(); }
    function count() { return _steps.length; }
    function current() { return _index(); }
    function currentStep() {
        const i = _index();
        return (i >= 0 && i < _steps.length) ? _steps[i] : null;
    }
    function isActive() { return _index() >= 0; }
    function isFirst() { return _index() === 0; }
    function isLast()  { return _index() >= 0 && _index() === _steps.length - 1; }

    // ─── navigation ──────────────────────────────────────────────────

    function start() {
        if (_destroyed.v || _steps.length === 0) return;
        _index.set(0);
    }

    function next() {
        if (_destroyed.v) return;
        const cur = _index();
        if (cur < 0) return;
        if (cur + 1 >= _steps.length) {
            // Past the last step -> complete.
            finish();
            return;
        }
        _index.set(cur + 1);
    }

    function prev() {
        if (_destroyed.v) return;
        const cur = _index();
        if (cur <= 0) {
            if (loop && _steps.length > 0) _index.set(_steps.length - 1);
            return;
        }
        _index.set(cur - 1);
    }

    function goTo(idxOrId) {
        if (_destroyed.v) return;
        const idx = typeof idxOrId === "string" ? indexOfId(idxOrId) : (idxOrId | 0);
        if (idx < 0 || idx >= _steps.length) return;
        _index.set(idx);
    }

    function skip() {
        if (_destroyed.v) return;
        const at = _index();
        if (at < 0) return;
        clearActiveTargetPaint();
        _index.set(-1);
        if (onSkip) try { onSkip(at); } catch {}
    }

    function finish() {
        if (_destroyed.v) return;
        clearActiveTargetPaint();
        _index.set(-1);
        if (onComplete) try { onComplete(); } catch {}
    }

    // ─── paint effect ────────────────────────────────────────────────

    let _activeTargetEl = null;
    let _activeContentEl = null;

    function clearActiveTargetPaint() {
        if (_activeTargetEl) {
            removeAttr(_activeTargetEl, "data-tour-target");
            _activeTargetEl = null;
        }
        if (_activeContentEl) {
            setAttr(_activeContentEl, "hidden", "");
            removeAttr(_activeContentEl, "data-tour-active");
            _activeContentEl = null;
        }
    }

    const stopPaint = effect(() => {
        const i = _index();
        // Clear previous (cheap; setAttr is dirty-checked at the helper).
        clearActiveTargetPaint();
        if (i < 0 || i >= _steps.length) {
            // Tour not active; nothing to paint.
            if (_rootEl) toggleAttr(_rootEl, "data-tour-active", false);
            return;
        }
        const step = _steps[i];
        if (_rootEl) toggleAttr(_rootEl, "data-tour-active", true);
        if (step.target) {
            setAttr(step.target, "data-tour-target", "");
            _activeTargetEl = step.target;
        }
        if (step.contentEl) {
            // Show the current step's content; hide all others.
            for (let j = 0; j < _steps.length; j++) {
                const ce = _steps[j].contentEl;
                if (!ce) continue;
                if (j === i) {
                    ce.removeAttribute("hidden");
                    setAttr(ce, "data-tour-active", "");
                } else {
                    setAttr(ce, "hidden", "");
                    removeAttr(ce, "data-tour-active");
                }
            }
            _activeContentEl = step.contentEl;
            // ARIA: tie target -> content as a description.
            if (step.target && step.contentEl.id) {
                setAttr(step.target, "aria-describedby", step.contentEl.id);
            }
            // Move focus to the active content for keyboard users.
            // setTimeout to avoid focus before layout settles (consumer
            // may be positioning the popover synchronously after this
            // effect runs).
            const ce = step.contentEl;
            setTimeout(() => { try { ce.focus({ preventScroll: false }); } catch {} }, 0);
        }
        if (onStepChange) try { onStepChange(i, step); } catch {}
    });
    addCleanup(stopPaint);

    // ─── attach ──────────────────────────────────────────────────────

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        _rootEl = el;
        setAttr(el, "data-tour-root", "");
        if (!_bound) {
            // Global Escape / Arrow keys while the tour is active.
            const onKey = (ev) => {
                if (!isActive()) return;
                switch (ev.key) {
                    case "Escape":     ev.preventDefault(); skip(); break;
                    case "ArrowRight": ev.preventDefault(); next(); break;
                    case "ArrowLeft":  ev.preventDefault(); prev(); break;
                }
            };
            window.addEventListener("keydown", onKey);
            _bound = true;
            addCleanup(() => {
                window.removeEventListener("keydown", onKey);
                _bound = false;
            });
        }
        const off = () => {
            removeAttr(el, "data-tour-root");
            removeAttr(el, "data-tour-active");
            if (_rootEl === el) _rootEl = null;
        };
        addCleanup(off);
        return off;
    }

    // Wire a step's content element. The id from `addStep` selects
    // which step this content belongs to.
    function attachStepContent(id, el) {
        if (!el || _destroyed.v) return noop;
        const idx = indexOfId(id);
        if (idx < 0) return noop;
        _steps[idx].contentEl = el;
        // ARIA: a coach mark is a labeled region, not a dialog.
        // role="region" + label/labelledby would be ideal; default to
        // role="region" if not set.
        if (!el.hasAttribute("role")) setAttr(el, "role", "region");
        ensureId(el, "lh-tour-step");
        setAttr(el, "data-tour-step", id);
        setAttr(el, "tabindex", "-1");    // focusable programmatically
        // Hide by default; the effect un-hides the active one.
        if (_index() !== idx) setAttr(el, "hidden", "");
        const off = () => {
            removeAttr(el, "data-tour-step");
            removeAttr(el, "data-tour-active");
            removeAttr(el, "hidden");
            removeAttr(el, "tabindex");
            if (el.getAttribute("role") === "region") removeAttr(el, "role");
            const cur = indexOfId(id);
            if (cur >= 0 && _steps[cur]) _steps[cur].contentEl = null;
        };
        addCleanup(off);
        return off;
    }

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        clearActiveTargetPaint();
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch { /* swallow */ }
        }
        _cleanups.length = 0;
        _steps.length = 0;
    }

    return {
        // step registry
        addStep, removeStep, steps, count,
        // accessors
        current, currentStep, isActive, isFirst, isLast,
        // navigation
        start, next, prev, goTo, skip, finish,
        // attach helpers
        attachRoot, attachStepContent,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
