// @zakkster/lite-headless / pin-input
//
// PIN / OTP / one-time-code entry. N input boxes with auto-advance, backspace
// behavior, paste-distribution, and ARIA wiring. The primitive owns the
// validated value + which-box-is-active state; the consumer provides the
// markup (N input elements) and styles. No layout, no shimmer, no animation.
//
// What this does
//
//   - Validates each typed character against a pattern (numeric by default;
//     also accepts "alphanumeric" or a custom RegExp). Invalid characters are
//     silently dropped at the keystroke -- no flash of bad input.
//
//   - Auto-advance: typing a valid character in box N advances focus to
//     box N+1. The last box stays focused (so the user sees what they typed)
//     and `onComplete` fires.
//
//   - Backspace:
//       * Box has a value -> clear it, stay focused.
//       * Box is empty    -> move focus to previous box, clear that box's
//                            value too. This matches every native OTP UI.
//
//   - Paste: if the pasted (filtered) text length === `length`, fill all
//     boxes from index 0 regardless of where the user pasted. Otherwise
//     insert at the current position and fill up to remaining capacity.
//     Focus moves to the end of the inserted text.
//
//   - Arrow keys, Home, End: navigate between boxes without writing.
//
//   - Focus: focusing a box selects its content (standard select-on-focus),
//     so the next keystroke replaces rather than appends -- this is how
//     `maxlength="1"` inputs need to behave for a smooth retype.
//
// What this does NOT do
//
//   - Render N input elements. The consumer provides them; the primitive
//     attaches per-input wiring via attachInput(el, index).
//
//   - Submit anything across the wire. `onComplete` fires when the value
//     fills; the consumer's hook calls the API.
//
//   - Masking. We expose the raw value; if the consumer wants to render
//     bullets they style the input's text-security CSS property or replace
//     the displayed char in a separate effect.
//
// API
//
//   createPinInput({
//       length?:        number,    // 1..16, default 6
//       type?:          "numeric" | "alphanumeric" | RegExp,
//                                  // default "numeric" = /[0-9]/
//       initialValue?:  string,
//       onChange?:      (value, isComplete) => void,
//       onComplete?:    (value) => void,
//       onInvalidPaste?:(text)  => void,
//   })
//
//   .value()                       // reactive: string 0..length
//   .isComplete()                  // reactive: value.length === length
//   .position()                    // reactive: index of the currently-active box
//
//   .setValue(s)                   // programmatic write; filters by pattern
//   .setPosition(i)                // move active box pointer + focus that input
//   .clear()                       // reset to ""
//   .submit()                      // fire onComplete if complete (else no-op)
//   .focusInput(i)                 // focus the i-th input element (no value change)
//
//   .attachRoot(el)
//   .attachInput(inputEl, index)   // -> off() cleanup
//
//   .destroy()
//
// ARIA
//
//   Root:  role="group", aria-label="..." (consumer-provided),
//          data-pin-root, data-pin-state="incomplete|complete",
//          data-pin-length="N", data-pin-value-length="K"
//   Input: aria-label="Digit K of N", data-pin-input,
//          data-pin-index="i", inputmode="numeric" (or "text" for alphanumeric),
//          maxlength="1", autocomplete="one-time-code" (first input only)
//
// The "Digit K of N" label is automatic; consumers wanting different
// phrasing can provide their own via `inputAriaLabel: (i, length) => string`
// in the constructor options.

import { signal as makeSignal, effect, untrack } from "@zakkster/lite-signal";

const noop = () => {};

function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

// Resolve `type` option into a per-character RegExp predicate.
function _compileTypePattern(type) {
    if (type instanceof RegExp) {
        // Sanity: user pattern must accept a SINGLE character. We wrap by
        // testing each char individually; we don't anchor the user's regex.
        return type;
    }
    if (type === "alphanumeric") return /[A-Za-z0-9]/;
    if (type === "numeric" || type === undefined || type === null) return /[0-9]/;
    throw new TypeError("createPinInput: type must be 'numeric', 'alphanumeric', or a RegExp");
}

function _defaultLabel(i, length) {
    return "Digit " + (i + 1) + " of " + length;
}

export function createPinInput(options = {}) {
    const {
        length = 6,
        type = "numeric",
        initialValue = "",
        onChange,
        onComplete,
        onInvalidPaste,
        inputAriaLabel = _defaultLabel,
        ariaLabel = "One-time code",
    } = options;

    if (typeof length !== "number" || length < 1 || length > 16 || !Number.isInteger(length)) {
        throw new RangeError("createPinInput: length must be an integer in 1..16");
    }
    const _pattern = _compileTypePattern(type);
    const _isNumeric = type === "numeric" || type === undefined || type === null;

    // Validate + trim initial value.
    function _filter(s) {
        if (typeof s !== "string" || s.length === 0) return "";
        let out = "";
        for (let i = 0; i < s.length && out.length < length; i++) {
            const c = s.charAt(i);
            if (_pattern.test(c)) out += c;
        }
        return out;
    }

    const _value = makeSignal(_filter(initialValue));
    const _position = makeSignal(0);
    const _isComplete = makeSignal(_value().length === length);

    let _rootEl = null;
    const _inputs = new Map();      // index -> { el, off }
    let _destroyed = false;
    let _lastFiredComplete = false;

    // ----- helpers ---------------------------------------------------

    // Write a new value + update position + fire change/complete callbacks.
    // Centralised so every code path (typing, paste, setValue, clear)
    // produces the same observable behavior.
    function _writeValue(next, nextPosition) {
        if (_destroyed) return;
        const v = _filter(next);
        const isComplete = v.length === length;
        const positionClamped = Math.max(0, Math.min(length - 1, nextPosition | 0));

        const prev = _value.peek();
        const prevPos = _position.peek();
        const prevComplete = _isComplete.peek();

        if (v !== prev)                  _value.set(v);
        if (positionClamped !== prevPos) _position.set(positionClamped);
        if (isComplete !== prevComplete) _isComplete.set(isComplete);

        if (v !== prev && onChange) {
            try { onChange(v, isComplete); } catch (err) {
                try { console.error("lite-pin-input: onChange threw:", err); } catch (_) {}
            }
        }
        // Edge-only onComplete: fires once on incomplete -> complete.
        if (isComplete && !_lastFiredComplete) {
            _lastFiredComplete = true;
            if (onComplete) {
                try { onComplete(v); } catch (err) {
                    try { console.error("lite-pin-input: onComplete threw:", err); } catch (_) {}
                }
            }
        } else if (!isComplete) {
            _lastFiredComplete = false;
        }
    }

    // ----- public reactive -------------------------------------------

    function value()      { return _value(); }
    function isComplete() { return _isComplete(); }
    function position()   { return _position(); }

    // ----- public methods --------------------------------------------

    function setValue(s) {
        if (_destroyed) return;
        const v = _filter(s);
        // Position lands at the end of the new value (or last box if full).
        const pos = Math.min(v.length, length - 1);
        _writeValue(v, pos);
        // Re-sync input DOM values + focus.
        _repaintInputs();
        _focusInputAt(pos);
    }

    function setPosition(i) {
        if (_destroyed) return;
        const p = Math.max(0, Math.min(length - 1, i | 0));
        if (p !== _position.peek()) _position.set(p);
        _focusInputAt(p);
    }

    function clear() {
        if (_destroyed) return;
        _writeValue("", 0);
        _repaintInputs();
        _focusInputAt(0);
    }

    function submit() {
        if (_destroyed) return;
        const v = _value.peek();
        if (v.length === length && onComplete) {
            try { onComplete(v); } catch (err) {
                try { console.error("lite-pin-input: onComplete threw:", err); } catch (_) {}
            }
        }
    }

    function focusInput(i) {
        _focusInputAt(i);
    }

    function _focusInputAt(i) {
        const rec = _inputs.get(i);
        if (rec && rec.el && typeof rec.el.focus === "function") {
            // Use a microtask so concurrent DOM mutations (e.g. paste-fill
            // setting all input values) don't race the focus call.
            queueMicrotask(() => {
                if (_destroyed) return;
                rec.el.focus();
                // Select content so a re-type replaces rather than appends.
                if (typeof rec.el.select === "function") {
                    try { rec.el.select(); } catch (_) { /* readonly inputs throw */ }
                }
            });
        }
    }

    function _repaintInputs() {
        const v = _value.peek();
        for (const [i, rec] of _inputs) {
            const desired = i < v.length ? v.charAt(i) : "";
            if (rec.el.value !== desired) rec.el.value = desired;
        }
    }

    // ----- paint root ARIA -------------------------------------------

    const stopPaint = effect(() => {
        const v = _value();
        const complete = _isComplete();
        if (_rootEl) {
            setAttr(_rootEl, "data-pin-state", complete ? "complete" : "incomplete");
            setAttr(_rootEl, "data-pin-value-length", String(v.length));
        }
    });

    // ----- attach root -----------------------------------------------

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        setAttr(el, "data-pin-root", "");
        setAttr(el, "role", "group");
        setAttr(el, "aria-label", ariaLabel);
        setAttr(el, "data-pin-length", String(length));
        const v = _value.peek();
        setAttr(el, "data-pin-state", v.length === length ? "complete" : "incomplete");
        setAttr(el, "data-pin-value-length", String(v.length));
        return () => {
            removeAttr(el, "data-pin-root");
            removeAttr(el, "role");
            removeAttr(el, "aria-label");
            removeAttr(el, "data-pin-length");
            removeAttr(el, "data-pin-state");
            removeAttr(el, "data-pin-value-length");
            if (_rootEl === el) _rootEl = null;
        };
    }

    // ----- attach input ----------------------------------------------

    function attachInput(inputEl, index) {
        if (!inputEl || _destroyed) return noop;
        if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= length) {
            throw new RangeError("attachInput: index must be 0.." + (length - 1));
        }
        // ARIA + input mode + autocomplete
        setAttr(inputEl, "data-pin-input", "");
        setAttr(inputEl, "data-pin-index", String(index));
        setAttr(inputEl, "maxlength", "1");
        setAttr(inputEl, "aria-label", inputAriaLabel(index, length));
        if (_isNumeric) setAttr(inputEl, "inputmode", "numeric");
        // autocomplete="one-time-code" on the FIRST input gives iOS Safari
        // the SMS auto-fill prompt. Multi-box layouts conventionally put it
        // on just the first; iOS distributes the autofilled code across the
        // group via paste-like behavior, which our paste handler catches.
        if (index === 0) setAttr(inputEl, "autocomplete", "one-time-code");

        // Sync initial value into the DOM.
        const v = _value.peek();
        inputEl.value = index < v.length ? v.charAt(index) : "";

        // Track via Map so backspace can reach into neighbors.
        _inputs.set(index, { el: inputEl, off: null });

        // ----- handlers --------------------------------------------------

        function onInput(ev) {
            if (_destroyed) return;
            const raw = inputEl.value || "";
            // `input` may include MORE than one char if browser autofill or
            // soft keyboard sends a longer string. Filter, take first
            // matching char, advance.
            let c = "";
            for (let i = 0; i < raw.length; i++) {
                if (_pattern.test(raw.charAt(i))) { c = raw.charAt(i); break; }
            }
            // Build the new value: replace position `index` with c, keep
            // all others, then trim trailing empty positions to match
            // contiguous-fill convention (value is a prefix).
            const cur = _value.peek();
            const chars = new Array(length);
            for (let i = 0; i < length; i++) {
                chars[i] = i < cur.length ? cur.charAt(i) : "";
            }
            chars[index] = c;
            // The value is the contiguous prefix of filled boxes. Find
            // the first empty AFTER index; that's the new length.
            let newLen = 0;
            for (let i = 0; i < length; i++) {
                if (chars[i] === "") break;
                newLen++;
            }
            // BUT if the user typed in box K and there are filled boxes
            // beyond K, preserve them -- model accepts non-contiguous
            // values (the user might be editing a middle box). We treat
            // the value as the whole array up to the LAST non-empty box.
            let lastFilled = -1;
            for (let i = length - 1; i >= 0; i--) {
                if (chars[i] !== "") { lastFilled = i; break; }
            }
            // Compact: rebuild value taking ONLY the filled prefix. If
            // there's a gap, treat the value as ending at the first gap
            // (matches typical OTP UX where boxes shouldn't have gaps).
            let outV = "";
            for (let i = 0; i < length; i++) {
                if (chars[i] === "") break;
                outV += chars[i];
            }
            // Advance focus: if c was written AND there's a next box,
            // move forward.
            const nextPos = c && index < length - 1 ? index + 1 : index;
            _writeValue(outV, nextPos);
            // Re-paint just the boxes whose displayed values may have
            // become stale (e.g. if compact trimmed beyond the gap).
            _repaintInputs();
            if (c && index < length - 1) _focusInputAt(index + 1);
        }

        function onKeyDown(ev) {
            if (_destroyed) return;
            const key = ev.key;

            if (key === "Backspace") {
                const cur = _value.peek();
                const hasOwn = index < cur.length && cur.charAt(index) !== "";
                if (hasOwn) {
                    // Clear THIS box, stay focused.
                    ev.preventDefault();
                    const chars = cur.split("");
                    // Compact: turn this position empty + drop everything
                    // after (the value is a prefix; you can't have a gap).
                    chars.length = index;
                    _writeValue(chars.join(""), index);
                    _repaintInputs();
                } else if (index > 0) {
                    // Move to previous, clear it.
                    ev.preventDefault();
                    const chars = cur.split("");
                    chars.length = index - 1;     // truncate prev value
                    _writeValue(chars.join(""), index - 1);
                    _repaintInputs();
                    _focusInputAt(index - 1);
                }
                return;
            }
            if (key === "ArrowLeft") {
                ev.preventDefault();
                if (index > 0) _focusInputAt(index - 1);
                return;
            }
            if (key === "ArrowRight") {
                ev.preventDefault();
                if (index < length - 1) _focusInputAt(index + 1);
                return;
            }
            if (key === "Home") {
                ev.preventDefault();
                _focusInputAt(0);
                return;
            }
            if (key === "End") {
                ev.preventDefault();
                _focusInputAt(length - 1);
                return;
            }
            if (key === "Enter") {
                ev.preventDefault();
                submit();
                return;
            }
            // Block characters that don't match the pattern at keydown
            // time, so the input element never visibly contains them.
            // Only block printable, single-char keys; let modifiers /
            // navigation through.
            if (key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
                if (!_pattern.test(key)) {
                    ev.preventDefault();
                    return;
                }
            }
        }

        function onPaste(ev) {
            if (_destroyed) return;
            ev.preventDefault();
            const text = (ev.clipboardData || window.clipboardData)?.getData("text") || "";
            const filtered = _filter(text);
            if (filtered.length === 0) {
                if (onInvalidPaste) {
                    try { onInvalidPaste(text); } catch (err) {
                        try { console.error("lite-pin-input: onInvalidPaste threw:", err); } catch (_) {}
                    }
                }
                return;
            }
            // Spec: if filtered text is a full-length code, fill from box 0.
            // Otherwise, insert starting at the paste-target index.
            if (filtered.length >= length) {
                _writeValue(filtered.slice(0, length), length - 1);
                _repaintInputs();
                _focusInputAt(length - 1);
            } else {
                const cur = _value.peek();
                // Combine: cur[0..index-1] + filtered + cur[index+filtered.length..]
                // ...but we keep the value as a prefix, so the cleanest semantic
                // is: prefix-up-to-index + filtered, capped at `length`. The
                // user likely intends "fill from here", not "interleave with
                // existing".
                const head = cur.slice(0, index);
                const combined = (head + filtered).slice(0, length);
                const newPos = Math.min(combined.length, length - 1);
                _writeValue(combined, newPos);
                _repaintInputs();
                _focusInputAt(newPos);
            }
        }

        function onFocus() {
            if (_destroyed) return;
            if (_position.peek() !== index) _position.set(index);
            // Select content so retyping replaces; this is what the browser
            // does for text inputs anyway when reached via Tab, but click
            // doesn't auto-select, so do it explicitly.
            if (typeof inputEl.select === "function") {
                try { inputEl.select(); } catch (_) {}
            }
        }

        inputEl.addEventListener("input",   onInput);
        inputEl.addEventListener("keydown", onKeyDown);
        inputEl.addEventListener("paste",   onPaste);
        inputEl.addEventListener("focus",   onFocus);

        const off = () => {
            inputEl.removeEventListener("input",   onInput);
            inputEl.removeEventListener("keydown", onKeyDown);
            inputEl.removeEventListener("paste",   onPaste);
            inputEl.removeEventListener("focus",   onFocus);
            removeAttr(inputEl, "data-pin-input");
            removeAttr(inputEl, "data-pin-index");
            removeAttr(inputEl, "maxlength");
            removeAttr(inputEl, "aria-label");
            removeAttr(inputEl, "inputmode");
            removeAttr(inputEl, "autocomplete");
            inputEl.value = "";
            _inputs.delete(index);
        };
        _inputs.get(index).off = off;
        return off;
    }

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPaint();
        for (const rec of _inputs.values()) {
            if (rec.off) try { rec.off(); } catch (_) {}
        }
        _inputs.clear();
        if (_rootEl) {
            removeAttr(_rootEl, "data-pin-root");
            removeAttr(_rootEl, "role");
            removeAttr(_rootEl, "aria-label");
            removeAttr(_rootEl, "data-pin-length");
            removeAttr(_rootEl, "data-pin-state");
            removeAttr(_rootEl, "data-pin-value-length");
        }
        _rootEl = null;
    }

    return {
        value, isComplete, position,
        setValue, setPosition, clear, submit, focusInput,
        attachRoot, attachInput,
        destroy,
        get destroyed() { return _destroyed; },
        get length() { return length; },
    };
}
