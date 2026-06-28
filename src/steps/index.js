// @zakkster/lite-headless / steps / index.js
//
// createSteps(options) -> StepsHandle
//
// Multi-step process indicator. NOT the numeric stepper (that's
// `stepper` and handles +/- on a number). This is the "you are step 3
// of 5" pattern used in checkout flows, onboarding wizards, multi-page
// forms, and approval workflows.
//
// Per-step state:
//   "complete"   -- finished, can navigate back to
//   "current"    -- the active step
//   "pending"    -- not yet reached
//   "error"      -- failed validation; needs attention
//
// All steps before the current step are "complete" by default. All
// steps after are "pending". Consumers can mark individual steps as
// "error" via setStepStatus(id, "error") to flag e.g. a failed
// validation on a step the user has already passed.
//
// Orientation: "horizontal" (default, wizards) or "vertical" (Gantt-
// like progress lists). Painted as data-orientation on the root.
//
// Navigation: allowBack=true (default) lets users jump to any
// completed or current step via attach. allowSkip=false (default)
// prevents jumping forward past the current step. Both can be relaxed
// for stage-agnostic flows.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";

function noop() {}

const VALID_STATUSES = ["complete", "current", "pending", "error"];

export function createSteps(options = {}) {
    const {
        steps: initialSteps = [],
        defaultCurrent = 0,
        orientation = "horizontal",
        allowBack = true,
        allowSkip = false,
        onStepChange,
        onComplete,
    } = options;

    let _destroyed = false;
    const _cleanups = [];
    function addCleanup(fn) { if (fn) _cleanups.push(fn); }

    // ----- state ----------------------------------------------------------

    // _steps: StepDef[] = { id, title, ...meta }
    const _steps = makeSignal(initialSteps.slice());
    // _current: index of the active step (0..steps.length-1; -1 if no steps)
    const _current = makeSignal(
        initialSteps.length > 0
            ? Math.max(0, Math.min(defaultCurrent, initialSteps.length - 1))
            : -1
    );
    // _stepStatusOverrides: Map<stepId, "error"> for explicit overrides.
    // Default status is derived from _current vs the step's index.
    const _stepStatusOverrides = new Map();
    // signal that re-fires when overrides change (Map identity doesn't
    // notify; we bump a counter instead).
    const _overrideVersion = makeSignal(0);

    // ----- query helpers --------------------------------------------------

    function steps()    { return _steps(); }
    function current()  { return _current(); }
    function currentStep() {
        const i = _current();
        const arr = _steps();
        return i >= 0 && i < arr.length ? arr[i] : null;
    }
    function getStep(id) {
        const arr = _steps();
        for (let i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
        return null;
    }
    function indexOf(id) {
        const arr = _steps();
        for (let i = 0; i < arr.length; i++) if (arr[i].id === id) return i;
        return -1;
    }

    // Read the version signal so this function is reactive inside an
    // effect (overrides change -> effect re-runs).
    function statusOf(idOrIndex) {
        _overrideVersion();   // reactivity dep
        const arr = _steps();
        const i = typeof idOrIndex === "string" ? indexOf(idOrIndex) : idOrIndex;
        if (i < 0 || i >= arr.length) return "pending";
        const step = arr[i];
        const override = _stepStatusOverrides.get(step.id);
        if (override === "error") return "error";
        const cur = _current();
        if (i < cur) return "complete";
        if (i === cur) return "current";
        return "pending";
    }

    function isComplete() {
        const arr = _steps();
        return arr.length > 0 && _current() >= arr.length;
    }

    function progress() {
        // 0..1 fraction of completed steps
        const arr = _steps();
        if (arr.length === 0) return 0;
        return Math.max(0, Math.min(arr.length, _current())) / arr.length;
    }

    // ----- mutations ------------------------------------------------------

    function setSteps(arr) {
        if (_destroyed) return;
        _steps.set((arr || []).slice());
        // Drop overrides for steps that no longer exist
        const ids = new Set();
        for (const s of _steps()) ids.add(s.id);
        for (const id of _stepStatusOverrides.keys()) {
            if (!ids.has(id)) _stepStatusOverrides.delete(id);
        }
        _overrideVersion.set(_overrideVersion() + 1);
        // Clamp current to range
        const cur = _current();
        const len = _steps().length;
        if (len === 0) _current.set(-1);
        else if (cur >= len) _current.set(len - 1);
    }

    function setCurrent(i, reason) {
        if (_destroyed) return;
        const arr = _steps();
        const next = Math.max(-1, Math.min(i, arr.length));    // allow == length for "complete"
        const cur = _current();
        if (next === cur) return;
        _current.set(next);
        if (onStepChange) {
            try { onStepChange(next, cur, reason || "api"); } catch {}
        }
        if (next >= arr.length && onComplete) {
            try { onComplete(); } catch {}
        }
    }

    function setCurrentById(id, reason) {
        const i = indexOf(id);
        if (i === -1) return;
        setCurrent(i, reason);
    }

    function next(reason) {
        const cur = _current();
        const len = _steps().length;
        if (cur >= len) return;        // already complete
        setCurrent(cur + 1, reason || "next");
    }

    function prev(reason) {
        const cur = _current();
        if (cur <= 0) return;
        setCurrent(cur - 1, reason || "prev");
    }

    // Mark a step's status as "error" (or clear with null/undefined).
    function setStepStatus(id, status) {
        if (_destroyed) return;
        const step = getStep(id);
        if (!step) return;
        if (status === "error") {
            _stepStatusOverrides.set(id, "error");
        } else {
            if (!_stepStatusOverrides.has(id)) return;
            _stepStatusOverrides.delete(id);
        }
        _overrideVersion.set(_overrideVersion() + 1);
    }

    // Drop every error override in one call. Useful for "retry the
    // whole form" UX after the user has flagged several steps as
    // invalid and now wants to start fresh.
    function clearAllErrors() {
        if (_destroyed) return;
        if (_stepStatusOverrides.size === 0) return;
        _stepStatusOverrides.clear();
        _overrideVersion.set(_overrideVersion() + 1);
    }

    // Reset to the start of the flow. Clears all error overrides AND
    // moves current back to 0 (or -1 if there are no steps). Fires
    // onStepChange with reason "reset" if current actually moved.
    function reset() {
        if (_destroyed) return;
        if (_stepStatusOverrides.size > 0) {
            _stepStatusOverrides.clear();
            _overrideVersion.set(_overrideVersion() + 1);
        }
        const target = _steps().length > 0 ? 0 : -1;
        setCurrent(target, "reset");
    }

    // Can the user navigate to step i from the current step? Defaults
    // follow the allowBack + allowSkip flags.
    function canNavigateTo(i) {
        const cur = _current();
        const len = _steps().length;
        if (i < 0 || i >= len) return false;
        if (i === cur) return true;
        if (i < cur) return allowBack;
        if (i > cur) return allowSkip;
        return false;
    }

    // ----- attach helpers ------------------------------------------------

    const _stepEls = new Map();   // el -> { id, off }
    let _root = null;

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _root = el;
        ensureId(el, "lh-steps");
        setAttr(el, "role", "list");
        setAttr(el, "aria-label", "Progress");
        const stop = effect(() => {
            setAttr(el, "data-orientation", orientation);
            const arr = _steps();
            const cur = _current();
            setAttr(el, "data-step-count", String(arr.length));
            setAttr(el, "data-current-index", String(cur));
            toggleAttr(el, "data-complete", isComplete());
        });
        addCleanup(stop);
        const off = () => {
            stop();
            if (_root === el) {
                el.removeAttribute("role");
                el.removeAttribute("aria-label");
                el.removeAttribute("data-orientation");
                el.removeAttribute("data-step-count");
                el.removeAttribute("data-current-index");
                el.removeAttribute("data-complete");
                _root = null;
            }
        };
        addCleanup(off);
        return off;
    }

    function attachStep(el, id) {
        if (!el || _destroyed || id == null) return noop;
        const prev = _stepEls.get(el);
        if (prev) prev.off();

        ensureId(el, "lh-step");
        setAttr(el, "role", "listitem");
        setAttr(el, "data-step-id", String(id));

        // Click to navigate (gated by canNavigateTo).
        const onClick = (ev) => {
            const target = indexOf(id);
            if (target === -1) return;
            if (canNavigateTo(target)) {
                ev.preventDefault();
                setCurrent(target, "click");
            }
        };
        el.addEventListener("click", onClick);

        // Reactive paint of status + navigability + index.
        let _lastStatus = null;
        const stop = effect(() => {
            const idx = indexOf(id);
            const status = statusOf(id);
            const nav = canNavigateTo(idx);
            if (_lastStatus !== status) {
                setAttr(el, "data-status", status);
                _lastStatus = status;
            }
            setAttr(el, "data-index", String(idx));
            toggleAttr(el, "data-navigable", nav);
            toggleAttr(el, "data-current", status === "current");
            toggleAttr(el, "data-error",   status === "error");
            toggleAttr(el, "data-complete", status === "complete");
            // aria-current matches W3C: "step" when active
            setAttr(el, "aria-current", status === "current" ? "step" : "false");
            // tabindex makes the step focusable only when navigable
            setAttr(el, "tabindex", nav ? "0" : "-1");
        });

        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            el.removeAttribute("role");
            el.removeAttribute("data-step-id");
            el.removeAttribute("data-status");
            el.removeAttribute("data-index");
            el.removeAttribute("data-navigable");
            el.removeAttribute("data-current");
            el.removeAttribute("data-error");
            el.removeAttribute("data-complete");
            el.removeAttribute("aria-current");
            el.removeAttribute("tabindex");
            _stepEls.delete(el);
        };
        _stepEls.set(el, { id, off });
        addCleanup(off);
        return off;
    }

    function attachNextButton(el) {
        if (!el || _destroyed) return noop;
        if (!el.hasAttribute("type") && el.tagName === "BUTTON") {
            setAttr(el, "type", "button");
        }
        const onClick = (ev) => { ev.preventDefault(); next(); };
        el.addEventListener("click", onClick);
        // Disable the button when there's no next step (already complete).
        const stop = effect(() => {
            const len = _steps().length;
            const cur = _current();
            const disabled = cur >= len;
            toggleAttr(el, "disabled", disabled);
            setAttr(el, "aria-disabled", disabled ? "true" : "false");
        });
        addCleanup(stop);
        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            el.removeAttribute("disabled");
            el.removeAttribute("aria-disabled");
        };
        addCleanup(off);
        return off;
    }

    function attachPrevButton(el) {
        if (!el || _destroyed) return noop;
        if (!el.hasAttribute("type") && el.tagName === "BUTTON") {
            setAttr(el, "type", "button");
        }
        const onClick = (ev) => { ev.preventDefault(); prev(); };
        el.addEventListener("click", onClick);
        const stop = effect(() => {
            const cur = _current();
            const disabled = cur <= 0;
            toggleAttr(el, "disabled", disabled);
            setAttr(el, "aria-disabled", disabled ? "true" : "false");
        });
        addCleanup(stop);
        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            el.removeAttribute("disabled");
            el.removeAttribute("aria-disabled");
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
        _stepEls.clear();
        _stepStatusOverrides.clear();
        _root = null;
    }

    return {
        // reactive
        steps, current, currentStep, statusOf, isComplete, progress,
        // queries (non-reactive)
        getStep, indexOf, canNavigateTo,
        // mutations
        setSteps, setCurrent, setCurrentById, next, prev,
        setStepStatus, clearAllErrors, reset,
        // attach
        attachRoot, attachStep, attachNextButton, attachPrevButton,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
        get orientation() { return orientation; },
    };
}
