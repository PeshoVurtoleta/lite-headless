// @zakkster/lite-headless / inline-edit
//
// Click-to-edit text. Display mode shows a value; clicking (or pressing
// Enter on a focused trigger) transitions to edit mode where an input
// (or textarea) holds a draft. Enter / blur commits, Escape cancels.
// Used in titles, kanban card text, tag names, profile fields --
// anywhere an inline edit replaces a separate edit screen.
//
// What this owns
//
//   - `value` reactive (the committed string)
//   - `draftValue` reactive (the in-edit working copy)
//   - `isEditing` reactive
//   - `isInvalid` reactive (last commit attempt failed validation)
//   - validation + normalize pipeline
//   - keyboard wiring on the input (Enter / Escape / Tab) per the
//     `commitOn` and `cancelOn` config
//   - display-mode click to enter edit, focus on the input + select-all
//
// What this does NOT own
//
//   - Markup. The consumer provides both a display element AND an input
//     (or textarea). The primitive hides the non-active one via the
//     `hidden` attribute and paints `data-mode` on the root for CSS.
//
//   - Persistence. `onCommit(new, old)` fires once on a successful
//     commit; the consumer persists.
//
// API
//
//   createInlineEdit({
//       initialValue?:   string,
//       placeholder?:    string,        // applied to the input as a
//                                       // placeholder attr on attach
//       trim?:           boolean,       // default true (trim drafts
//                                       // before validation + commit)
//       allowEmpty?:     boolean,       // default false (empty after
//                                       // trim is rejected as "empty")
//       commitOn?:       string[],      // default ["Enter", "blur"]
//       cancelOn?:       string[],      // default ["Escape"]
//       normalize?:      (s) => string,
//       validate?:       (next, prev) => boolean | string,
//       onChange?:       (next, prev) => void,
//       onCommit?:       (next, prev) => void,
//       onCancel?:       () => void,
//       onInvalid?:      (val, reason) => void,
//       onEditStart?:    () => void,
//       multiline?:      boolean,       // default false; when true,
//                                       // Enter inserts newline unless
//                                       // commitOn includes "Enter"
//                                       // explicitly with Cmd/Ctrl
//                                       // (then Cmd-Enter commits)
//       ariaLabel?:      string,
//   })
//
//   .value()                            // string, committed
//   .draftValue()                       // string, current edit draft
//   .isEditing()                        // boolean
//   .isInvalid()                        // boolean
//
//   .setValue(s)                        // programmatic commit (no event)
//   .startEdit()
//   .setDraftValue(s)
//   .commit()                           // attempt commit; -> boolean
//   .cancel()                           // revert
//
//   .attachRoot(el)
//   .attachDisplay(el)                  // gets textContent from value()
//                                       // + click handler -> startEdit
//   .attachInput(inputEl)               // wires keydown + blur + input
//   .attachTrigger(triggerEl)           // optional click target ->
//                                       // startEdit (e.g. "edit" button)
//
//   .destroy()
//
// ARIA + DOM contract
//
//   Root:    data-inline-edit-root, role="group" (optional),
//            data-mode="display|edit",
//            data-invalid="true" (when applicable)
//   Display: data-inline-edit-display, hidden when editing, textContent
//            sync'd from value() reactively
//   Input:   data-inline-edit-input, hidden when displaying, value
//            sync'd from draftValue() reactively
//   Trigger: data-inline-edit-trigger (optional)
//
// Multiline note
//
//   When `multiline: true`, the input should be a <textarea>. Enter
//   inserts a newline by default; the primitive will only commit on
//   Enter if "Enter" is in commitOn AND the user holds Cmd/Ctrl (the
//   common pattern for textarea forms). For single-line inputs, Enter
//   commits per commitOn.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";

const noop = () => {};

function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

export function createInlineEdit(options = {}) {
    const {
        initialValue = "",
        placeholder = "",
        trim = true,
        allowEmpty = false,
        commitOn = ["Enter", "blur"],
        cancelOn = ["Escape"],
        normalize = null,
        validate = null,
        onChange,
        onCommit,
        onCancel,
        onInvalid,
        onEditStart,
        multiline = false,
        ariaLabel = null,
    } = options;

    if (typeof initialValue !== "string") {
        throw new TypeError("createInlineEdit: initialValue must be a string");
    }
    if (!Array.isArray(commitOn)) {
        throw new TypeError("createInlineEdit: commitOn must be an array");
    }
    if (!Array.isArray(cancelOn)) {
        throw new TypeError("createInlineEdit: cancelOn must be an array");
    }

    const _commitOnEnter = commitOn.includes("Enter");
    const _commitOnBlur  = commitOn.includes("blur");
    const _commitOnTab   = commitOn.includes("Tab");
    const _cancelOnEscape = cancelOn.includes("Escape");

    const _value     = makeSignal(initialValue);
    const _draft     = makeSignal(initialValue);
    const _editing   = makeSignal(false);
    const _invalid   = makeSignal(false);

    let _rootEl     = null;
    let _displayEl  = null;
    let _displayOff = null;
    let _inputEl    = null;
    let _inputOff   = null;
    let _triggerEl  = null;
    let _triggerOff = null;
    let _destroyed  = false;

    // Validation: normalize -> trim -> empty check -> validate(). Returns
    // { ok: boolean, value: string, reason?: string }.
    function _check(raw, prev) {
        let s = typeof raw === "string" ? raw : String(raw);
        if (normalize) {
            try { s = normalize(s); } catch (_) {}
            if (typeof s !== "string") s = "";
        }
        if (trim) s = s.trim();
        if (s.length === 0 && !allowEmpty) {
            return { ok: false, value: s, reason: "empty" };
        }
        if (validate) {
            let result;
            try { result = validate(s, prev); } catch (err) {
                try { console.error("lite-inline-edit: validate threw:", err); } catch (_) {}
                return { ok: false, value: s, reason: "validate" };
            }
            if (result === false || (typeof result === "string" && result.length > 0)) {
                return { ok: false, value: s, reason: typeof result === "string" ? result : "validate" };
            }
        }
        return { ok: true, value: s };
    }

    // ----- reactive ascription --------------------------------------

    const stopPaint = effect(() => {
        const editing = _editing();
        const invalid = _invalid();
        if (_rootEl) {
            setAttr(_rootEl, "data-mode", editing ? "edit" : "display");
            if (invalid) setAttr(_rootEl, "data-invalid", "true");
            else         removeAttr(_rootEl, "data-invalid");
        }
        // Toggle hidden between display + input
        if (_displayEl) {
            if (editing) setAttr(_displayEl, "hidden", "");
            else         removeAttr(_displayEl, "hidden");
        }
        if (_inputEl) {
            if (editing) removeAttr(_inputEl, "hidden");
            else         setAttr(_inputEl, "hidden", "");
        }
    });

    // Display text mirrors value()
    const stopDisplayText = effect(() => {
        const v = _value();
        if (_displayEl) {
            if (_displayEl.textContent !== v) _displayEl.textContent = v;
        }
    });

    // Input value mirrors draft (when editing) -- we don't push during
    // display-mode since the user isn't seeing it.
    const stopInputValue = effect(() => {
        const d = _draft();
        const editing = _editing();
        if (_inputEl && editing) {
            if (_inputEl.value !== d) _inputEl.value = d;
        }
    });

    // ----- public reactive ------------------------------------------

    function value()      { return _value(); }
    function draftValue() { return _draft(); }
    function isEditing()  { return _editing(); }
    function isInvalid()  { return _invalid(); }

    // ----- public methods -------------------------------------------

    function setValue(s) {
        if (_destroyed) return;
        const cur = _value.peek();
        const next = typeof s === "string" ? s : String(s);
        if (next !== cur) {
            _value.set(next);
            _draft.set(next);   // sync draft too (no in-progress edit)
        }
        if (_invalid.peek()) _invalid.set(false);
    }

    function setDraftValue(s) {
        if (_destroyed) return;
        const next = typeof s === "string" ? s : String(s);
        if (next !== _draft.peek()) _draft.set(next);
        // Typing again clears the invalid state -- gives the user a
        // chance to fix it before the next commit attempt.
        if (_invalid.peek()) _invalid.set(false);
    }

    function startEdit() {
        if (_destroyed) return;
        if (_editing.peek()) return;
        _draft.set(_value.peek());
        _invalid.set(false);
        _editing.set(true);
        if (onEditStart) {
            try { onEditStart(); } catch (err) {
                try { console.error("lite-inline-edit: onEditStart threw:", err); } catch (_) {}
            }
        }
        if (_inputEl) {
            // Defer focus to a microtask so the `hidden` removal has
            // committed in layout. Without this, the focus call might
            // run while the input is still hidden, which some browsers
            // refuse silently.
            queueMicrotask(() => {
                if (_destroyed || !_editing.peek() || !_inputEl) return;
                try { _inputEl.focus(); } catch (_) {}
                if (typeof _inputEl.select === "function") {
                    try { _inputEl.select(); } catch (_) {}
                }
            });
        }
    }

    function commit() {
        if (_destroyed) return false;
        if (!_editing.peek()) return false;
        const prev = _value.peek();
        const r = _check(_draft.peek(), prev);
        if (!r.ok) {
            _invalid.set(true);
            if (onInvalid) {
                try { onInvalid(r.value, r.reason); } catch (err) {
                    try { console.error("lite-inline-edit: onInvalid threw:", err); } catch (_) {}
                }
            }
            return false;
        }
        // Filter the draft to match the (possibly normalized/trimmed) value
        // so the input mirrors what got committed.
        if (r.value !== _draft.peek()) _draft.set(r.value);
        const changed = r.value !== prev;
        if (changed) _value.set(r.value);
        _editing.set(false);
        _invalid.set(false);
        if (changed && onChange) {
            try { onChange(r.value, prev); } catch (err) {
                try { console.error("lite-inline-edit: onChange threw:", err); } catch (_) {}
            }
        }
        if (onCommit) {
            try { onCommit(r.value, prev); } catch (err) {
                try { console.error("lite-inline-edit: onCommit threw:", err); } catch (_) {}
            }
        }
        return true;
    }

    function cancel() {
        if (_destroyed) return;
        if (!_editing.peek()) return;
        _draft.set(_value.peek());
        _editing.set(false);
        _invalid.set(false);
        if (onCancel) {
            try { onCancel(); } catch (err) {
                try { console.error("lite-inline-edit: onCancel threw:", err); } catch (_) {}
            }
        }
    }

    // ----- attach root ----------------------------------------------

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        setAttr(el, "data-inline-edit-root", "");
        setAttr(el, "data-mode", _editing.peek() ? "edit" : "display");
        if (ariaLabel) setAttr(el, "aria-label", ariaLabel);
        if (_invalid.peek()) setAttr(el, "data-invalid", "true");
        return () => {
            removeAttr(el, "data-inline-edit-root");
            removeAttr(el, "data-mode");
            removeAttr(el, "data-invalid");
            if (ariaLabel) removeAttr(el, "aria-label");
            if (_rootEl === el) _rootEl = null;
        };
    }

    // ----- attach display -------------------------------------------

    function attachDisplay(el) {
        if (!el || _destroyed) return noop;
        if (_displayOff) _displayOff();
        _displayEl = el;
        setAttr(el, "data-inline-edit-display", "");
        if (_editing.peek()) setAttr(el, "hidden", "");
        else                 removeAttr(el, "hidden");
        // Initial paint
        if (el.textContent !== _value.peek()) el.textContent = _value.peek();

        function onClick() {
            if (_destroyed) return;
            startEdit();
        }
        // Keyboard accessibility: a click handler on a non-button display
        // wouldn't catch Enter / Space. We add a keydown handler that
        // triggers startEdit on those keys IF the display is focusable
        // (consumer sets tabindex="0" if they want this).
        function onKeyDown(ev) {
            if (_destroyed) return;
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                startEdit();
            }
        }
        el.addEventListener("click", onClick);
        el.addEventListener("keydown", onKeyDown);

        _displayOff = () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKeyDown);
            removeAttr(el, "data-inline-edit-display");
            removeAttr(el, "hidden");
            if (_displayEl === el) _displayEl = null;
        };
        return _displayOff;
    }

    // ----- attach input ---------------------------------------------

    function attachInput(inputEl) {
        if (!inputEl || _destroyed) return noop;
        if (_inputOff) _inputOff();
        _inputEl = inputEl;
        setAttr(inputEl, "data-inline-edit-input", "");
        if (placeholder && !inputEl.hasAttribute("placeholder")) {
            inputEl.setAttribute("placeholder", placeholder);
        }
        if (!_editing.peek()) setAttr(inputEl, "hidden", "");
        else                  removeAttr(inputEl, "hidden");
        // Initial value
        if (inputEl.value !== _draft.peek()) inputEl.value = _draft.peek();

        function onInput() {
            if (_destroyed) return;
            setDraftValue(inputEl.value || "");
        }

        function onKeyDown(ev) {
            if (_destroyed) return;
            const key = ev.key;

            if (_cancelOnEscape && key === "Escape") {
                ev.preventDefault();
                cancel();
                return;
            }

            if (key === "Enter") {
                if (multiline) {
                    // Newline by default; commit only on Cmd/Ctrl + Enter
                    // IF commitOn includes Enter.
                    if (_commitOnEnter && (ev.ctrlKey || ev.metaKey)) {
                        ev.preventDefault();
                        commit();
                    }
                    // Otherwise let the newline through.
                } else if (_commitOnEnter) {
                    ev.preventDefault();
                    commit();
                }
                return;
            }

            if (_commitOnTab && key === "Tab") {
                ev.preventDefault();
                commit();
                return;
            }
        }

        function onBlur() {
            if (_destroyed) return;
            if (!_editing.peek()) return;
            if (_commitOnBlur) commit();
            // If blur isn't a commit trigger AND we're still editing,
            // do nothing -- the next focus event on the input will
            // resume editing (since _editing stayed true).
        }

        inputEl.addEventListener("input",   onInput);
        inputEl.addEventListener("keydown", onKeyDown);
        inputEl.addEventListener("blur",    onBlur);

        _inputOff = () => {
            inputEl.removeEventListener("input",   onInput);
            inputEl.removeEventListener("keydown", onKeyDown);
            inputEl.removeEventListener("blur",    onBlur);
            removeAttr(inputEl, "data-inline-edit-input");
            removeAttr(inputEl, "hidden");
            removeAttr(inputEl, "placeholder");
            if (_inputEl === inputEl) _inputEl = null;
        };
        return _inputOff;
    }

    // ----- attach trigger -------------------------------------------

    function attachTrigger(el) {
        if (!el || _destroyed) return noop;
        if (_triggerOff) _triggerOff();
        _triggerEl = el;
        setAttr(el, "data-inline-edit-trigger", "");

        function onClick(ev) {
            if (_destroyed) return;
            ev.preventDefault();
            startEdit();
        }
        el.addEventListener("click", onClick);

        _triggerOff = () => {
            el.removeEventListener("click", onClick);
            removeAttr(el, "data-inline-edit-trigger");
            if (_triggerEl === el) _triggerEl = null;
        };
        return _triggerOff;
    }

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPaint();
        stopDisplayText();
        stopInputValue();
        if (_displayOff) try { _displayOff(); } catch (_) {}
        if (_inputOff)   try { _inputOff(); }   catch (_) {}
        if (_triggerOff) try { _triggerOff(); } catch (_) {}
        _displayOff = null;
        _inputOff = null;
        _triggerOff = null;
        if (_rootEl) {
            removeAttr(_rootEl, "data-inline-edit-root");
            removeAttr(_rootEl, "data-mode");
            removeAttr(_rootEl, "data-invalid");
            if (ariaLabel) removeAttr(_rootEl, "aria-label");
        }
        _rootEl = null;
        _displayEl = null;
        _inputEl = null;
        _triggerEl = null;
    }

    return {
        value, draftValue, isEditing, isInvalid,
        setValue, setDraftValue, startEdit, commit, cancel,
        attachRoot, attachDisplay, attachInput, attachTrigger,
        destroy,
        get destroyed() { return _destroyed; },
    };
}
