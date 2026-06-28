// @zakkster/lite-headless / tag-input
//
// Multi-value input. A text field plus a list of "tag" chips, where typing +
// pressing Enter / Tab / comma creates a new tag, and backspace in an empty
// input enters "tag-selection" mode (last tag visually active, next
// backspace removes it). Standard chip-input UX, used in label/category
// pickers, recipient lists, search filters.
//
// What this owns
//
//   - `tags` reactive array (readonly string[])
//   - `activeIndex` reactive (-1 = input focused, else 0..tags.length-1)
//   - `inputValue` reactive (current text in the input)
//   - validation + normalization pipeline: trim -> normalize -> check
//     dup -> check maxItems -> check validate(); rejected adds fire
//     `onInvalid` with a reason string
//   - keyboard wiring on the input + (when attached) the root for tag
//     navigation
//
// What the consumer owns
//
//   - The input element (provided to attachInput)
//   - The tag chip elements (rendered however -- a `for tag of tags()`
//     effect on the consumer side is the typical pattern). The primitive
//     does NOT mount or update tag DOM; it exposes the data + state.
//   - The remove button per tag: consumer wires its click to
//     `removeTag(i)`
//
// Backspace semantics (two-step, common in chip inputs)
//
//   Empty input + activeIndex === -1 -> first Backspace sets activeIndex
//     to last tag (consumer paints `data-tag-active` highlight).
//   Empty input + activeIndex >= 0   -> Backspace removes the active tag.
//                                       activeIndex stays at the next
//                                       (now-last) tag, or -1 if empty.
//   Non-empty input                  -> Backspace edits text as usual.
//
//   Single-step "remove immediately" is one line in the consumer's
//   onChange if they prefer; we default to the safer two-step.
//
// Delimiters
//
//   `delimiters` option: an array of keys (e.g. "Enter", "Tab") AND/OR
//   single-char strings (e.g. ",", ";"). On `keydown`, if the key matches
//   a delimiter, we commit. Default: ["Enter", "Tab", ","].
//
//   For paste, the option is separate: `pasteSplitOn` (default `/[,\n;]/`).
//   The full pasted text is split on this regex, each fragment is trimmed +
//   added in order. Paste of "a, b, c" -> three tags.
//
// API
//
//   createTagInput({
//       initialValue?:    string[],
//       maxItems?:        number,        // default Infinity
//       allowDuplicates?: boolean,       // default false
//       delimiters?:      string[],      // default ["Enter", "Tab", ","]
//       pasteSplitOn?:    RegExp,        // default /[,\n;]/
//       trim?:            boolean,       // default true
//       normalize?:       (tag) => string,
//       validate?:        (tag, currentTags) => boolean | string,
//       onChange?:        (tags) => void,
//       onAdd?:           (tag) => void,
//       onRemove?:        (tag, index) => void,
//       onInvalid?:       (tag, reason) => void,
//       ariaLabel?:       string,       // root group label
//   })
//
//   .tags()                              // readonly string[]
//   .count()                             // number
//   .canAddMore()                        // tags.length < maxItems
//   .activeIndex()                       // -1 = input focus, else tag idx
//   .inputValue()                        // current text in the input
//
//   .addTag(s, source)                   // -> boolean (added?)
//   .removeTag(index)
//   .removeLast()
//   .clear()
//   .setTags(array)                      // bulk replace; runs full pipeline per item
//   .setActiveIndex(i)                   // -1 to focus input
//   .focusInput()
//
//   .attachRoot(el)
//   .attachInput(inputEl)
//
//   .destroy()
//
// ARIA
//
//   Root:  role="group", aria-label="...", data-tag-root,
//          data-tag-count="N", data-tag-active="i|-" (i if focused, "-" else)
//   Input: data-tag-input-field; the primitive leaves type/inputmode alone
//          so consumers can use type=email, autocomplete patterns, etc.
//   Tags:  the consumer renders these; the standard convention is one element
//          per tag carrying data-tag-index="i", with data-tag-active="true"
//          when activeIndex() === i. We DO NOT paint these from the
//          primitive (we'd be guessing the tag element selector), but we
//          provide the state via signals.
//
//   Invalid reasons (passed to onInvalid):
//     "empty"      tag was empty after trim
//     "duplicate"  tag already exists (and allowDuplicates=false)
//     "max-items"  adding would exceed maxItems
//     "validate"   user-supplied validate() returned false / string
//                  (the string is forwarded; users can inspect it)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";

const noop = () => {};
const DEFAULT_DELIMITERS = ["Enter", "Tab", ","];
const DEFAULT_PASTE_SPLIT = /[,\n;]/;

function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

export function createTagInput(options = {}) {
    const {
        initialValue = [],
        maxItems = Infinity,
        allowDuplicates = false,
        delimiters = DEFAULT_DELIMITERS,
        pasteSplitOn = DEFAULT_PASTE_SPLIT,
        trim = true,
        normalize = null,
        validate = null,
        onChange,
        onAdd,
        onRemove,
        onInvalid,
        ariaLabel = "Tags",
    } = options;

    if (!Array.isArray(initialValue)) {
        throw new TypeError("createTagInput: initialValue must be an array");
    }
    if (!Array.isArray(delimiters)) {
        throw new TypeError("createTagInput: delimiters must be an array");
    }
    if (!(pasteSplitOn instanceof RegExp)) {
        throw new TypeError("createTagInput: pasteSplitOn must be a RegExp");
    }

    // Pre-classify delimiters: named keys vs single-char strings. Lookup
    // is O(1) per keydown via Set membership.
    const _delimKeys = new Set();
    const _delimChars = new Set();
    for (const d of delimiters) {
        if (typeof d !== "string" || d.length === 0) continue;
        if (d.length === 1) _delimChars.add(d);
        else                 _delimKeys.add(d);
    }

    // Normalize+validate one candidate against the current tag list.
    // Returns { ok: boolean, value: string, reason?: string }.
    function _check(raw, currentTags) {
        let s = typeof raw === "string" ? raw : String(raw);
        if (trim) s = s.trim();
        if (s.length === 0) return { ok: false, value: s, reason: "empty" };
        if (normalize) {
            try { s = normalize(s); } catch (_) {}
            if (typeof s !== "string" || s.length === 0) {
                return { ok: false, value: s || "", reason: "empty" };
            }
        }
        if (!allowDuplicates && currentTags.indexOf(s) >= 0) {
            return { ok: false, value: s, reason: "duplicate" };
        }
        if (currentTags.length >= maxItems) {
            return { ok: false, value: s, reason: "max-items" };
        }
        if (validate) {
            let result;
            try { result = validate(s, currentTags); } catch (err) {
                try { console.error("lite-tag-input: validate threw:", err); } catch (_) {}
                return { ok: false, value: s, reason: "validate" };
            }
            if (result === false || (typeof result === "string" && result.length > 0)) {
                return { ok: false, value: s, reason: typeof result === "string" ? result : "validate" };
            }
        }
        return { ok: true, value: s };
    }

    // Filter initialValue through the pipeline (drops duplicates / over-max
    // silently; onInvalid is NOT fired during construction, matching how
    // controlled inputs initialize).
    const _initial = [];
    for (const raw of initialValue) {
        const r = _check(raw, _initial);
        if (r.ok) _initial.push(r.value);
        if (_initial.length >= maxItems) break;
    }

    const _tags = makeSignal(_initial);
    const _activeIndex = makeSignal(-1);
    const _inputValue = makeSignal("");

    let _rootEl = null;
    let _inputEl = null;
    let _inputOff = null;
    let _destroyed = false;

    // ----- reactive ascription ---------------------------------------

    const stopPaint = effect(() => {
        const t = _tags();
        const ai = _activeIndex();
        if (_rootEl) {
            setAttr(_rootEl, "data-tag-count", String(t.length));
            setAttr(_rootEl, "data-tag-active", ai >= 0 ? String(ai) : "-");
        }
    });

    // ----- public reactive -------------------------------------------

    function tags()        { return _tags(); }
    function count()       { return _tags().length; }
    function canAddMore()  { return _tags().length < maxItems; }
    function activeIndex() { return _activeIndex(); }
    function inputValue()  { return _inputValue(); }

    // ----- public methods --------------------------------------------

    function addTag(raw, source) {
        if (_destroyed) return false;
        const cur = _tags.peek();
        const r = _check(raw, cur);
        if (!r.ok) {
            if (onInvalid) {
                try { onInvalid(r.value, r.reason); } catch (err) {
                    try { console.error("lite-tag-input: onInvalid threw:", err); } catch (_) {}
                }
            }
            return false;
        }
        const next = cur.concat([r.value]);
        _tags.set(next);
        if (onAdd) {
            try { onAdd(r.value); } catch (err) {
                try { console.error("lite-tag-input: onAdd threw:", err); } catch (_) {}
            }
        }
        if (onChange) {
            try { onChange(next); } catch (err) {
                try { console.error("lite-tag-input: onChange threw:", err); } catch (_) {}
            }
        }
        return true;
    }

    function removeTag(index) {
        if (_destroyed) return false;
        const cur = _tags.peek();
        if (index < 0 || index >= cur.length) return false;
        const removed = cur[index];
        const next = cur.slice(0, index).concat(cur.slice(index + 1));
        _tags.set(next);
        // Maintain activeIndex sensibly: if the removed index WAS active,
        // either keep position (now points to next tag) or fall back to
        // last; if removing AT the end, retreat one. If the active index
        // was AFTER the removed one, shift down.
        const ai = _activeIndex.peek();
        if (ai === index) {
            if (next.length === 0)               _activeIndex.set(-1);
            else if (index >= next.length)       _activeIndex.set(next.length - 1);
            // else: ai already points to the next tag (which slid into this slot)
        } else if (ai > index) {
            _activeIndex.set(ai - 1);
        }
        if (onRemove) {
            try { onRemove(removed, index); } catch (err) {
                try { console.error("lite-tag-input: onRemove threw:", err); } catch (_) {}
            }
        }
        if (onChange) {
            try { onChange(next); } catch (err) {
                try { console.error("lite-tag-input: onChange threw:", err); } catch (_) {}
            }
        }
        return true;
    }

    function removeLast() {
        const cur = _tags.peek();
        if (cur.length === 0) return false;
        return removeTag(cur.length - 1);
    }

    function clear() {
        if (_destroyed) return;
        const cur = _tags.peek();
        if (cur.length > 0) {
            _tags.set([]);
            if (onChange) {
                try { onChange([]); } catch (err) {
                    try { console.error("lite-tag-input: onChange threw:", err); } catch (_) {}
                }
            }
        }
        if (_activeIndex.peek() !== -1) _activeIndex.set(-1);
        _inputValue.set("");
        if (_inputEl) _inputEl.value = "";
    }

    function setTags(arr) {
        if (_destroyed) return;
        if (!Array.isArray(arr)) {
            throw new TypeError("setTags: argument must be an array");
        }
        const next = [];
        for (const raw of arr) {
            const r = _check(raw, next);
            if (r.ok) next.push(r.value);
            if (next.length >= maxItems) break;
        }
        _tags.set(next);
        if (_activeIndex.peek() >= next.length) _activeIndex.set(-1);
        if (onChange) {
            try { onChange(next); } catch (err) {
                try { console.error("lite-tag-input: onChange threw:", err); } catch (_) {}
            }
        }
    }

    function setActiveIndex(i) {
        if (_destroyed) return;
        const t = _tags.peek();
        const clamped = (typeof i === "number" && i >= 0 && i < t.length) ? (i | 0) : -1;
        if (clamped !== _activeIndex.peek()) _activeIndex.set(clamped);
        if (clamped === -1) focusInput();
    }

    function focusInput() {
        if (_inputEl) {
            queueMicrotask(() => {
                if (!_destroyed && _inputEl) _inputEl.focus();
            });
        }
    }

    // ----- attach root -----------------------------------------------

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        setAttr(el, "data-tag-root", "");
        setAttr(el, "role", "group");
        setAttr(el, "aria-label", ariaLabel);
        const t = _tags.peek();
        const ai = _activeIndex.peek();
        setAttr(el, "data-tag-count", String(t.length));
        setAttr(el, "data-tag-active", ai >= 0 ? String(ai) : "-");
        return () => {
            removeAttr(el, "data-tag-root");
            removeAttr(el, "role");
            removeAttr(el, "aria-label");
            removeAttr(el, "data-tag-count");
            removeAttr(el, "data-tag-active");
            if (_rootEl === el) _rootEl = null;
        };
    }

    // ----- attach input ----------------------------------------------

    function attachInput(inputEl) {
        if (!inputEl || _destroyed) return noop;
        if (_inputOff) _inputOff();   // remove previous
        _inputEl = inputEl;
        setAttr(inputEl, "data-tag-input-field", "");

        function onInput() {
            if (_destroyed) return;
            _inputValue.set(inputEl.value || "");
            // Typing exits tag-active mode -- user is editing again.
            if (_activeIndex.peek() !== -1) _activeIndex.set(-1);
        }

        function onKeyDown(ev) {
            if (_destroyed) return;
            const key = ev.key;
            const val = inputEl.value || "";

            // Delimiter keys (default Enter / Tab) commit when there's text.
            if (_delimKeys.has(key) && val.length > 0) {
                ev.preventDefault();
                if (addTag(val)) {
                    inputEl.value = "";
                    _inputValue.set("");
                }
                return;
            }
            // Single-char delimiter pressed (e.g. ","): commit + swallow
            // the char. Some delimiters are also "Enter" etc.; we already
            // handled those above. For chars, ev.key is the char.
            if (key.length === 1 && _delimChars.has(key) && val.length > 0) {
                ev.preventDefault();
                if (addTag(val)) {
                    inputEl.value = "";
                    _inputValue.set("");
                }
                return;
            }

            if (key === "Backspace") {
                if (val.length > 0) return;     // editing text -- pass through
                const ai = _activeIndex.peek();
                const t = _tags.peek();
                if (ai >= 0) {
                    // Active tag -> remove
                    ev.preventDefault();
                    removeTag(ai);
                } else if (t.length > 0) {
                    // Empty input -> activate last
                    ev.preventDefault();
                    _activeIndex.set(t.length - 1);
                }
                return;
            }

            if (key === "Delete") {
                const ai = _activeIndex.peek();
                if (ai >= 0) {
                    ev.preventDefault();
                    removeTag(ai);
                }
                return;
            }

            if (key === "ArrowLeft") {
                if (val.length > 0) return;     // editing text -- pass through
                // From input or current active, walk left.
                const t = _tags.peek();
                const ai = _activeIndex.peek();
                if (t.length === 0) return;
                ev.preventDefault();
                if (ai === -1)       _activeIndex.set(t.length - 1);
                else if (ai > 0)     _activeIndex.set(ai - 1);
                // already at index 0 -- stay
                return;
            }
            if (key === "ArrowRight") {
                if (val.length > 0) return;
                const ai = _activeIndex.peek();
                if (ai === -1) return;
                ev.preventDefault();
                const t = _tags.peek();
                if (ai + 1 >= t.length) _activeIndex.set(-1);
                else                     _activeIndex.set(ai + 1);
                return;
            }
            if (key === "Home") {
                if (val.length > 0) return;
                const t = _tags.peek();
                if (t.length === 0) return;
                ev.preventDefault();
                _activeIndex.set(0);
                return;
            }
            if (key === "End") {
                if (val.length > 0) return;
                const t = _tags.peek();
                if (t.length === 0) return;
                ev.preventDefault();
                _activeIndex.set(-1);   // back to input (the "end")
                return;
            }

            // Any printable char while tag-active mode is set: exit mode
            // so typing resumes (browser will write the char into input).
            if (key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
                if (_activeIndex.peek() !== -1) _activeIndex.set(-1);
            }
        }

        function onPaste(ev) {
            if (_destroyed) return;
            const data = (ev.clipboardData || window.clipboardData)?.getData("text") || "";
            // No splitter content? Let the browser paste normally.
            if (!pasteSplitOn.test(data)) return;
            ev.preventDefault();
            const parts = data.split(pasteSplitOn);
            for (const p of parts) {
                if (p.length === 0) continue;
                addTag(p);
            }
            inputEl.value = "";
            _inputValue.set("");
        }

        function onFocus() {
            if (_destroyed) return;
            if (_activeIndex.peek() !== -1) _activeIndex.set(-1);
        }

        inputEl.addEventListener("input",   onInput);
        inputEl.addEventListener("keydown", onKeyDown);
        inputEl.addEventListener("paste",   onPaste);
        inputEl.addEventListener("focus",   onFocus);

        _inputOff = () => {
            inputEl.removeEventListener("input",   onInput);
            inputEl.removeEventListener("keydown", onKeyDown);
            inputEl.removeEventListener("paste",   onPaste);
            inputEl.removeEventListener("focus",   onFocus);
            removeAttr(inputEl, "data-tag-input-field");
            if (_inputEl === inputEl) _inputEl = null;
        };
        return _inputOff;
    }

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPaint();
        if (_inputOff) try { _inputOff(); } catch (_) {}
        _inputOff = null;
        if (_rootEl) {
            removeAttr(_rootEl, "data-tag-root");
            removeAttr(_rootEl, "role");
            removeAttr(_rootEl, "aria-label");
            removeAttr(_rootEl, "data-tag-count");
            removeAttr(_rootEl, "data-tag-active");
        }
        _rootEl = null;
        _inputEl = null;
    }

    return {
        tags, count, canAddMore, activeIndex, inputValue,
        addTag, removeTag, removeLast, clear, setTags,
        setActiveIndex, focusInput,
        attachRoot, attachInput,
        destroy,
        get destroyed() { return _destroyed; },
    };
}
