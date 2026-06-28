// @zakkster/lite-headless / stepper / index.js
//
// Headless numeric stepper (spinbutton). A single raw `value` signal
// drives both keyboard input (parsed lazily on commit) and one or more
// increment/decrement controls. The display is locale-aware via
// Intl.NumberFormat by default; consumers can also pass a custom
// formatter/parser pair for currency, percentages, time-of-day, etc.
//
//   const stepper = createStepper({
//       defaultValue: 0,
//       min: 0, max: 100, step: 1,
//       largeStep: 10,                            // shift+arrow / PageUp/Down
//       precision: 0,                             // decimal places
//       locale: undefined,                        // browser default
//       onValueChange: (n, reason) => {},
//   });
//
//   stepper.attachInput(inputEl);                 // role=spinbutton
//   stepper.attachIncrement(plusBtn);
//   stepper.attachDecrement(minusBtn);
//   stepper.attachReadout(spanEl);                // optional, display-only
//
// CONTRACT
//
// The raw value signal is a plain `number`. When the input element has
// focus (a "typing" state), the engine does NOT overwrite the input
// element's text -- the user might be mid-edit. On `blur` or `Enter`,
// the engine parses the input's current text, clamps to [min,max],
// snaps to the step grid anchored at `min`, and writes the result to
// the value signal. When the input doesn't have focus, any external
// value change (programmatic setValue, button click, arrow key,
// reactive update) re-renders the formatted display into the input.
//
// LOCALE-AWARE PARSING
//
// If no `parser` is supplied, the engine derives a default parser from
// the formatter's `formatToParts` output. For `de-DE` this yields
// decimalSep = ",", groupSep = "." so "1.234,5" parses to 1234.5; for
// `en-US` decimalSep = ".", groupSep = ",". Consumers with currency or
// percentage formatters should usually supply their own parser since
// `formatToParts(1.1)` won't expose the currency/percent prefix.
//
// KEYBOARD
//
// On the input element:
//   ArrowUp   / ArrowDown    -> +/- step
//   shift + ArrowUp/Down     -> +/- largeStep
//   PageUp    / PageDown     -> +/- largeStep
//   Home      / End          -> min / max (only if those are finite)
//   Enter                    -> commit current text
//
// AUTO-REPEAT
//
// pointerdown on an increment/decrement element fires one immediate
// step. If the pointer is still held after `repeatDelay` ms (default
// 400), the engine starts repeating every `repeatInterval` ms (default
// 50). Releasing the pointer, dragging off the button, or
// pointercancel stops the repeat.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";

const noop = () => {};

export function createStepper(options = {}) {
    const {
        value: valueSignal,
        defaultValue = 0,
        min:  _initialMin  = -Infinity,
        max:  _initialMax  =  Infinity,
        step: _initialStep = 1,
        largeStep    = 10,
        precision,
        formatter,
        parser,
        locale,
        onValueChange,
        repeatDelay    = 400,
        repeatInterval = 50,
        // selectOnFocus: when the input gets focus, select all its text
        // so the user can immediately overwrite. Opt-in because some UIs
        // (e.g. embedded in a larger form where Tab cycles through) want
        // the caret at the end instead.
        selectOnFocus = false,
        // disabled: opt-in disabled flag; can be toggled via setDisabled.
        disabled = false,
    } = options;

    if (!Number.isFinite(_initialStep) || _initialStep <= 0) {
        throw new Error(`createStepper: step must be a positive finite number, got ${_initialStep}`);
    }
    if (Number.isFinite(_initialMin) && Number.isFinite(_initialMax) && _initialMin > _initialMax) {
        throw new Error(`createStepper: min (${_initialMin}) > max (${_initialMax})`);
    }

    // v0.7.11: min / max / step are mutable so consumers can update bounds
    // at runtime (e.g. shopping cart max = available_inventory dropping).
    // The wrapper exposes `min` and `max` attributes reactively; the
    // primitive exposes setMin/setMax/setStep. Each setter re-normalizes
    // the current value against the new constraint so we never leave
    // value outside [min, max] or off-grid.
    let min  = _initialMin;
    let max  = _initialMax;
    let step = _initialStep;

    // v0.7.11: pre-computed multiplier for the float-hygiene round-trip
    // in normalize(). The old implementation called -Math.log10(step) and
    // Math.pow(10, decimals) twice per normalize() invocation -- that
    // fires on every +/- click, every drag tick, every programmatic set.
    // For step=0.01 (a common currency case) and a busy slider, that
    // adds up. Recompute only when step changes (typically never).
    let _stepMul = 1;
    function recomputeStepMul() {
        if (step < 1) {
            const decimals = Math.min(10, Math.ceil(-Math.log10(step)));
            _stepMul = Math.pow(10, decimals);
        } else {
            _stepMul = 1;   // step >= 1 -> no fractional cleanup needed
        }
    }
    recomputeStepMul();

    // ----- formatter / parser ------------------------------------------
    //
    // Build a default Intl.NumberFormat at construction time using
    // `precision` if supplied. The grouping option is disabled by
    // default for spinbutton ergonomics -- typical spinbutton ranges
    // are small (0-100, 1-9999) where group separators feel noisy. A
    // consumer that wants grouping should pass a custom formatter.
    let _intl = null;
    if (!formatter) {
        const intlOpts = { useGrouping: false };
        if (precision != null) {
            intlOpts.minimumFractionDigits = precision;
            intlOpts.maximumFractionDigits = precision;
        }
        _intl = new Intl.NumberFormat(locale, intlOpts);
    }
    const fmt = formatter || ((n) => _intl.format(n));

    // Derive separators ONCE from a sample format. Used by the default
    // parser to normalize the input text back to a JS-parseable string.
    let _decimalSep = ".";
    let _groupSep = null;
    if (_intl) {
        try {
            const parts1 = _intl.formatToParts(1.1);
            for (const p of parts1) if (p.type === "decimal") _decimalSep = p.value;
            // formatToParts(1000) only emits a "group" token when the
            // formatter actually groups; with useGrouping:false there
            // won't be one, which is fine -- _groupSep stays null.
            const parts2 = _intl.formatToParts(1000000);
            for (const p of parts2) if (p.type === "group") _groupSep = p.value;
        } catch { /* fall back to defaults */ }
    }

    function defaultParse(str) {
        if (typeof str !== "string") return NaN;
        let s = str.trim();
        if (s === "") return NaN;
        if (_groupSep) {
            // String.split + join is faster than a regex replace-all
            // and handles the multi-char case (some locales use "\u00A0"
            // which is two UTF-16 code units... actually it's one).
            s = s.split(_groupSep).join("");
        }
        if (_decimalSep !== ".") s = s.replace(_decimalSep, ".");
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : NaN;
    }
    const parse = parser || defaultParse;

    // ----- normalization (clamp + step-snap) ---------------------------
    //
    // The step grid is anchored at `min` (or 0 if min is -Infinity).
    // So step=0.5 with min=0.7 yields valid values 0.7, 1.2, 1.7, ...
    // Snap happens AFTER clamp because snap might push past max (e.g.
    // value=99.7, step=1, max=100 -> snap to 100, ok; max=99.5 -> snap
    // would yield 99.7 then clamp to 99.5, ok).
    function normalize(n) {
        if (!Number.isFinite(n)) return null;
        if (n < min) n = min;
        if (n > max) n = max;
        const base = Number.isFinite(min) ? min : 0;
        const k = Math.round((n - base) / step);
        n = base + k * step;
        // re-clamp after snap (snap could overshoot)
        if (n < min) n = min;
        if (n > max) n = max;
        // Floating-point hygiene: 0.1 + 0.2 = 0.30000000000000004. Round
        // to a reasonable precision derived from step. log10(1/step)
        // gives the decimal-places implied by step. The multiplier is
        // pre-computed in `_stepMul` and refreshed only when setStep
        // runs, so this is just two ops in the hot path.
        if (step < 1) {
            n = Math.round(n * _stepMul) / _stepMul;
        }
        return n;
    }

    // ----- value signal ------------------------------------------------
    const _initial = normalize(defaultValue);
    const _value = valueSignal || makeSignal(_initial != null ? _initial : 0);

    // ----- DOM scratch -------------------------------------------------
    let _input = null;
    let _isTyping = false;    // true between focus and commit/blur
    let _disabled = !!disabled;
    let _destroyed = false;

    function publish(n, reason) {
        if (_destroyed) return;
        const v = normalize(n);
        if (v == null) return;
        const cur = _value();
        if (v === cur) return;
        _value.set(v);
        if (onValueChange) {
            try { onValueChange(v, reason || "set"); } catch { /* swallow */ }
        }
    }

    function setValue(n, reason)        { publish(n, reason || "set"); }
    function increment(amount)          { publish(_value() + (amount == null ? step      : amount), "increment"); }
    function decrement(amount)          { publish(_value() - (amount == null ? step      : amount), "decrement"); }
    function largeIncrement()           { publish(_value() + largeStep, "increment"); }
    function largeDecrement()           { publish(_value() - largeStep, "decrement"); }

    // v0.7.11: dynamic constraint setters. Numeric inputs are almost
    // always bound to dynamic system limits (shopping cart quantity
    // where max == available_inventory, "per-line item" pickers, time
    // pickers in a scheduling UI, etc). The wrapper exposes `min` and
    // `max` as observed attributes; framework consumers can dynamically
    // re-render the element with new bounds and the primitive will
    // re-normalize the current value against them.
    //
    // Each setter:
    //  - updates the lexical binding (closures pick it up next event)
    //  - re-normalizes the current value (clamping if needed)
    //  - fires onValueChange with reason="constraint" only when value
    //    actually moved
    function _renormalize(reason) {
        const cur = _value();
        const next = normalize(cur);
        if (next != null && next !== cur) {
            _value.set(next);
            if (onValueChange) {
                try { onValueChange(next, reason || "constraint"); } catch { /* swallow */ }
            }
        }
    }
    function setMin(n) {
        if (!Number.isFinite(n) && n !== -Infinity) return;
        if (n === min) return;
        if (Number.isFinite(n) && Number.isFinite(max) && n > max) return;   // ignore invalid
        min = n;
        _renormalize("constraint");
    }
    function setMax(n) {
        if (!Number.isFinite(n) && n !== Infinity) return;
        if (n === max) return;
        if (Number.isFinite(n) && Number.isFinite(min) && n < min) return;
        max = n;
        _renormalize("constraint");
    }
    function setStep(n) {
        if (!Number.isFinite(n) || n <= 0) return;
        if (n === step) return;
        step = n;
        recomputeStepMul();
        _renormalize("constraint");
    }

    function setDisabled(flag) {
        _disabled = !!flag;
        if (_input) {
            if (_disabled) _input.setAttribute("aria-disabled", "true");
            else _input.removeAttribute("aria-disabled");
            // also reflect to the native disabled attribute if it's a
            // form control; safe to set on non-form elements (ignored).
            try { _input.disabled = _disabled; } catch { /* swallow */ }
            // v0.7.11: contenteditable loophole. The docs allow
            // <span contenteditable data-input> as a stylable
            // alternative to <input type="text">. On such elements,
            // setting `disabled = true` silently fails (the property
            // isn't standard on non-form elements) and the user can
            // still type into the disabled stepper. Explicitly flip
            // contenteditable to "false" so the browser actually
            // blocks input. Restore to "true" on enable; we only
            // touch the attribute if it was present in the first
            // place -- consumers who didn't use contenteditable
            // shouldn't have it added by us.
            if (_input.hasAttribute("contenteditable")) {
                _input.setAttribute("contenteditable", _disabled ? "false" : "true");
            }
        }
        // v0.7.6: also sync the +/- buttons. Previously only the click
        // behavior was gated (a click on a disabled stepper's + button
        // would no-op); now the buttons also visually reflect the state
        // via the disabled attribute, so consumers' CSS can style them
        // accordingly and ATs announce them correctly.
        for (let i = 0; i < _controlButtons.length; i++) {
            const el = _controlButtons[i];
            if (!el) continue;
            if (_disabled) {
                el.setAttribute("aria-disabled", "true");
                try { el.disabled = true; } catch {}
            } else {
                el.removeAttribute("aria-disabled");
                try { el.disabled = false; } catch {}
            }
        }
    }

    // Tracked +/- button elements -- both makeStepper attachments push
    // themselves into this list so setDisabled can fan out reactively.
    // Cleared on detach via the closure-scoped cleanup.
    const _controlButtons = [];

    // ----- attachInput -------------------------------------------------
    //
    // The input is treated as a spinbutton. We intentionally don't force
    // type="text" -- the consumer chose what to render. If they passed a
    // <span contenteditable> or a <div>, that's their call; the value
    // round-trip uses `.value` if available, falling back to
    // `.textContent` otherwise.
    function getInputText(el) {
        return el.value != null ? el.value : (el.textContent || "");
    }
    function setInputText(el, txt) {
        if (el.value !== undefined) el.value = txt;
        else el.textContent = txt;
    }

    function syncDisplay() {
        if (!_input) return;
        if (_isTyping) return;    // don't clobber user input mid-edit
        const n = _value();
        const display = fmt(n);
        if (getInputText(_input) !== display) setInputText(_input, display);
        _input.setAttribute("aria-valuenow", String(n));
        if (display !== String(n)) _input.setAttribute("aria-valuetext", display);
        else _input.removeAttribute("aria-valuetext");
    }

    function commitInput() {
        if (!_input) return;
        const txt = getInputText(_input);
        const parsed = parse(txt);
        if (Number.isFinite(parsed)) {
            publish(parsed, "commit");
        }
        // else: invalid -- value unchanged; syncDisplay restores the
        // last good formatted text on the next paint.
    }

    // Helper: a keyboard-driven value change (arrow keys, Enter,
    // Home/End) should refresh the displayed text even though the
    // input has focus. We temporarily release the typing guard so the
    // reactive effect's syncDisplay actually paints. The lite-signal
    // effects run synchronously so the unguarded window is one tick.
    function withDisplaySync(fn) {
        const wasTyping = _isTyping;
        _isTyping = false;
        try { fn(); }
        finally { _isTyping = wasTyping; }
    }

    function attachInput(el) {
        if (!el || _destroyed) return noop;
        if (_input && _input !== el) {
            // Allow only one input at a time. If the consumer wants to
            // swap, they should detach the previous via the returned
            // teardown first.
            return noop;
        }
        _input = el;
        el.setAttribute("role", "spinbutton");
        if (Number.isFinite(min)) el.setAttribute("aria-valuemin", String(min));
        if (Number.isFinite(max)) el.setAttribute("aria-valuemax", String(max));
        if (!el.hasAttribute("inputmode")) el.setAttribute("inputmode", "decimal");
        if (_disabled) {
            el.setAttribute("aria-disabled", "true");
            try { el.disabled = true; } catch {}
        }

        const onFocus = () => {
            if (_disabled) { el.blur(); return; }
            _isTyping = true;
            if (selectOnFocus && typeof el.select === "function") {
                try { el.select(); } catch {}
            }
        };
        const onBlur = () => {
            commitInput();
            _isTyping = false;
            syncDisplay();
        };
        const onKeyDown = (e) => {
            if (_disabled) return;
            const k = e.key;
            switch (k) {
                case "ArrowUp":
                    e.preventDefault();
                    withDisplaySync(() => { e.shiftKey ? largeIncrement() : increment(); });
                    break;
                case "ArrowDown":
                    e.preventDefault();
                    withDisplaySync(() => { e.shiftKey ? largeDecrement() : decrement(); });
                    break;
                case "PageUp":
                    e.preventDefault();
                    withDisplaySync(largeIncrement);
                    break;
                case "PageDown":
                    e.preventDefault();
                    withDisplaySync(largeDecrement);
                    break;
                case "Home":
                    if (Number.isFinite(min)) { e.preventDefault(); withDisplaySync(() => publish(min, "home")); }
                    break;
                case "End":
                    if (Number.isFinite(max)) { e.preventDefault(); withDisplaySync(() => publish(max, "end")); }
                    break;
                case "Enter":
                    e.preventDefault();
                    // commit first (publish updates the signal); then
                    // force a display sync regardless of the typing guard.
                    // If the commit was invalid (NaN), the value didn't
                    // change and syncDisplay restores the previous good
                    // formatted text.
                    withDisplaySync(() => {
                        commitInput();
                        syncDisplay();
                    });
                    break;
                // anything else: let it through (user is typing characters)
            }
        };

        el.addEventListener("focus", onFocus);
        el.addEventListener("blur",  onBlur);
        el.addEventListener("keydown", onKeyDown);

        // initial paint
        syncDisplay();

        const off = () => {
            el.removeEventListener("focus", onFocus);
            el.removeEventListener("blur",  onBlur);
            el.removeEventListener("keydown", onKeyDown);
            el.removeAttribute("role");
            el.removeAttribute("aria-valuemin");
            el.removeAttribute("aria-valuemax");
            el.removeAttribute("aria-valuenow");
            el.removeAttribute("aria-valuetext");
            el.removeAttribute("aria-disabled");
            if (_input === el) _input = null;
        };
        return off;
    }

    // ----- attachIncrement / attachDecrement ---------------------------
    //
    // Auto-repeat: a single timeout schedules the start of repeats; once
    // started, a setInterval drives the step. Both timers are stored on
    // the closure so destroy can clear them. We use pointer events (not
    // mouse) for unified touch + mouse + pen handling.
    function makeStepper(el, fn, ariaLabel) {
        if (!el || _destroyed) return noop;
        if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", ariaLabel);
        // Mark it for CSS / tests / introspection.
        el.setAttribute("data-stepper-control", "");

        // register for reactive disabled sync
        _controlButtons.push(el);
        if (_disabled) {
            el.setAttribute("aria-disabled", "true");
            try { el.disabled = true; } catch {}
        }

        let _holdTimer = null;
        let _holdInterval = null;
        function startHold() {
            if (_disabled) return;
            fn();
            _holdTimer = setTimeout(() => {
                _holdInterval = setInterval(() => {
                    if (_disabled) { stopHold(); return; }
                    fn();
                }, repeatInterval);
                _holdTimer = null;
            }, repeatDelay);
        }
        function stopHold() {
            if (_holdTimer)    { clearTimeout(_holdTimer); _holdTimer = null; }
            if (_holdInterval) { clearInterval(_holdInterval); _holdInterval = null; }
        }

        const onPointerDown = (e) => {
            if (e.button != null && e.button !== 0) return;
            e.preventDefault();
            try { el.setPointerCapture(e.pointerId); } catch { /* swallow */ }
            startHold();
        };
        const onPointerUp     = () => stopHold();
        const onPointerCancel = () => stopHold();
        const onPointerLeave  = () => stopHold();
        const onKeyDown       = (e) => {
            if (_disabled) return;
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fn();
            }
        };

        el.addEventListener("pointerdown",   onPointerDown);
        el.addEventListener("pointerup",     onPointerUp);
        el.addEventListener("pointercancel", onPointerCancel);
        el.addEventListener("pointerleave",  onPointerLeave);
        el.addEventListener("keydown",       onKeyDown);

        return () => {
            stopHold();
            el.removeEventListener("pointerdown",   onPointerDown);
            el.removeEventListener("pointerup",     onPointerUp);
            el.removeEventListener("pointercancel", onPointerCancel);
            el.removeEventListener("pointerleave",  onPointerLeave);
            el.removeEventListener("keydown",       onKeyDown);
            el.removeAttribute("data-stepper-control");
            // unregister from disabled-sync list (v0.7.6)
            const idx = _controlButtons.indexOf(el);
            if (idx >= 0) _controlButtons.splice(idx, 1);
            el.removeAttribute("aria-disabled");
        };
    }

    function attachIncrement(el) { return makeStepper(el, () => increment(), "Increment"); }
    function attachDecrement(el) { return makeStepper(el, () => decrement(), "Decrement"); }

    // ----- attachReadout (display-only) --------------------------------
    function attachReadout(el) {
        if (!el || _destroyed) return noop;
        const stop = effect(() => { el.textContent = fmt(_value()); });
        return () => {
            stop();
            // Leave textContent alone -- consumer may have other markup
            // they want preserved on detach.
        };
    }

    // ----- reactive display sync ---------------------------------------
    //
    // Any external value change (programmatic setValue, button click,
    // arrow key, controlled signal write) re-renders the input via
    // syncDisplay. When _isTyping is true, syncDisplay is a no-op so we
    // don't clobber the user.
    const stopSync = effect(() => {
        _value();    // subscribe
        syncDisplay();
    });

    // ----- destroy -----------------------------------------------------
    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopSync();
    }

    return {
        // signals + accessors
        value: () => _value(),
        displayValue: () => fmt(_value()),
        // mutators
        setValue,
        increment,
        decrement,
        setDisabled,
        // v0.7.11: dynamic constraints
        setMin, setMax, setStep,
        // metadata accessors (read current values; primitive owns them)
        min: () => min,
        max: () => max,
        step: () => step,
        // attachments
        attachInput,
        attachIncrement,
        attachDecrement,
        attachReadout,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
    };
}
