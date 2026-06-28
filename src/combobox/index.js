// @zakkster/lite-headless / combobox / index.js
//
// createCombobox(options) -> ComboboxHandle
//
// Single-select listbox-style combobox. Focus stays on the trigger button;
// the listbox uses the aria-activedescendant pattern so we don't have to
// shuffle real DOM focus across items (which is fragile, fights screen
// readers, and breaks virtualization). The highlighted item gets a
// `data-highlighted` attribute so consumers can style it.
//
// Composes:
//   _overlay/core         state machine + status signal
//   _overlay/position     listbox placement (defaults to bottom-start)
//   _overlay/dismiss      Escape stack + outside-click
//   _overlay/portal       move listbox to container
//   _overlay/aria         id generation + IDREF-list helpers
//
// Keyboard model:
//   trigger has focus throughout. When OPEN:
//     ArrowDown / ArrowUp        move highlight (loops by default)
//     Home / End                 jump to first / last
//     Enter / Space              select highlighted, close (if closeOnSelect)
//     Escape                     close without selecting
//     <printable char>           typeahead (first letter match by default)
//   When CLOSED:
//     ArrowDown / ArrowUp / Enter / Space        open
//     <printable char>                           open + typeahead
//
// What this is NOT (deferred):
//   - editable combobox (input + filtering): out of scope for v0.2 single-select
//   - multi-select: deferred
//   - async / remote options: deferred (attach items as they arrive works fine)
//   - virtualization: pair with @zakkster/lite-virtual when needed
//
// API:
//   combo.attachTrigger(buttonEl)
//   combo.attachListbox(ulEl)
//   combo.attachItem(liEl, { value, label })
//   combo.attachInside(el)        -- extend outside-click ignore list
//   combo.value()                 -- current selected value
//   combo.setValue(v, reason)     -- programmatic selection
//   combo.open, status, setOpen, toggle, destroy

import { signal, effect } from "@zakkster/lite-signal";
import { createOverlayCore } from "../_overlay/core.js";
import { bindEscape, bindOutsideClick } from "../_overlay/dismiss.js";
import { createPositioner } from "../_overlay/position.js";
import { portal } from "../_overlay/portal.js";
import { uniqueId, setAttr, toggleAttr, ensureId, addIdToken, removeIdToken } from "../_overlay/aria.js";
import { createRovingFocus, STRATEGY_ACTIVE_DESCENDANT } from "../_overlay/roving-focus.js";

export function createCombobox(options = {}) {
    const {
        open, defaultOpen = false, onOpenChange,
        value: valueOpt, defaultValue = null, onValueChange,

        placement = "bottom-start",
        offset = 4,
        flip = true, shift = true, boundary = "clipping",

        typeahead = true,
        typeaheadTimeout = 500,
        loop = true,
        autoFocus = "first",          // 'first' | 'selected' | 'none'
        closeOnSelect = true,
        closeOnEscape = true,
        closeOnOutsideClick = true,

        container = (typeof document !== "undefined" ? document.body : null),
        transition = false,
    } = options;

    const core = createOverlayCore({
        open, defaultOpen, onOpenChange,
        awaitTransitionEnd: !!transition,
    });

    // ---- value: signal-or-internal --------------------------------------
    // Mirror the pattern from core for `open`: if the caller passed a signal,
    // use it; otherwise keep an internal one. This lets React/Svelte/vanilla
    // bring their own state.
    const _internalValue = signal(defaultValue);
    const _externalValue = valueOpt || null;
    const readValue = () => _externalValue ? _externalValue() : _internalValue();
    const writeValue = (v, reason) => {
        if (_externalValue && typeof _externalValue.set === "function") _externalValue.set(v);
        else _internalValue.set(v);
        if (onValueChange) onValueChange(v, reason || "select");
    };

    // ---- registry --------------------------------------------------------
    let _trigger = null;
    let _listbox = null;
    let _restorePortal = null;
    let _positioner = null;
    let _stopAutoUpdate = null;
    let _outsideOff = null;
    let _escapeOff = null;
    const _items = [];            // {el, id, value, label}
    const _extraInsides = [];

    // ---- highlight + typeahead (delegated to shared helper) --------------
    // The combobox uses aria-activedescendant: DOM focus stays on the
    // trigger, the highlighted item is announced via the trigger's
    // aria-activedescendant attribute, and items get data-highlighted.
    // See src/_overlay/roving-focus.js for the full contract.
    const roving = createRovingFocus({
        getItems: () => _items,
        strategy: STRATEGY_ACTIVE_DESCENDANT,
        getFocusHost: () => _trigger,
        loop,
        typeahead,
        typeaheadTimeout,
        getLabel: (it) => (it.label || "").toLowerCase(),
    });
    // Back-compat shim: callsites below were written against the local
    // names `setHighlight` / `moveHighlight` / `typeaheadHandle` /
    // `_highlightIndex`. We keep those names as thin wrappers so the
    // diff is minimal and the call sites remain readable.
    const setHighlight    = (idx)   => roving.setIndex(idx);
    const moveHighlight   = (delta) => roving.move(delta);
    const typeaheadHandle = (ch)    => roving.typeChar(ch);
    function highlightIndex() { return roving.index; }

    function selectIndex(idx) {
        if (idx < 0 || idx >= _items.length) return;
        writeValue(_items[idx].value, "select");
        if (closeOnSelect) core.setOpen(false, "select");
    }

    function indexOfValue(v) {
        for (let i = 0; i < _items.length; i++) if (_items[i].value === v) return i;
        return -1;
    }

    // ---- doOpen / doClose -----------------------------------------------
    function doOpen() {
        if (!_listbox || !_trigger) return;
        if (container && _listbox.parentNode !== container) {
            _restorePortal = portal(_listbox, container);
        }
        setAttr(_trigger, "aria-expanded", "true");

        _positioner = createPositioner({
            anchor: _trigger, content: _listbox,
            placement, offset, flip, shift, boundary,
        });
        _positioner.update();
        _stopAutoUpdate = _positioner.autoUpdate();

        // initial highlight
        if (autoFocus === "selected") {
            const idx = indexOfValue(readValue());
            setHighlight(idx >= 0 ? idx : (_items.length > 0 ? 0 : -1));
        } else if (autoFocus === "first") {
            setHighlight(_items.length > 0 ? 0 : -1);
        } else {
            setHighlight(-1);
        }
    }

    function doClose() {
        if (_stopAutoUpdate) { _stopAutoUpdate(); _stopAutoUpdate = null; }
        if (_positioner) { _positioner.destroy(); _positioner = null; }
        if (_trigger) {
            setAttr(_trigger, "aria-expanded", "false");
            _trigger.removeAttribute("aria-activedescendant");
        }
        roving.reset();
    }

    // ---- reactive effects (one dep each, dialog/popover discipline) ----
    const stopOpen = effect(() => {
        if (core.open()) doOpen();
        else doClose();
    });
    core._addCleanup(stopOpen);

    const stopOpenAria = effect(() => {
        const isOpen = core.open();
        if (!_listbox) return;
        setAttr(_listbox, "aria-hidden", isOpen ? null : "true");
        toggleAttr(_listbox, "data-open", isOpen);
    });
    core._addCleanup(stopOpenAria);

    const stopStatusAttr = effect(() => {
        const s = core.status();
        if (_listbox) setAttr(_listbox, "data-status", s);
    });
    core._addCleanup(stopStatusAttr);

    const stopRestore = effect(() => {
        if (core.status() === "closed" && _restorePortal) {
            _restorePortal();
            _restorePortal = null;
        }
    });
    core._addCleanup(stopRestore);

    // mirror value -> aria-selected + data-selected on items. Each
    // effect run iterates every item; the dirty-checked helpers skip
    // writes for items whose painted state already matches their
    // current selection. For a 200-option listbox toggling a single
    // selection, this drops per-paint writes from ~400 to ~2-3.
    const stopValueReflect = effect(() => {
        const v = readValue();
        for (let i = 0; i < _items.length; i++) {
            const it = _items[i];
            const sel = it.value === v;
            setAttr(it.el, "aria-selected", sel ? "true" : "false");
            toggleAttr(it.el, "data-selected", sel);
        }
    });
    core._addCleanup(stopValueReflect);

    // ---- attach* methods ------------------------------------------------
    function attachTrigger(el) {
        if (!el || core.destroyed) return noop;
        _trigger = el;
        ensureId(el, "lh-combobox-trigger");
        setAttr(el, "aria-haspopup", "listbox");
        setAttr(el, "aria-expanded", core.open() ? "true" : "false");
        if (_listbox && _listbox.id) addIdToken(el, "aria-controls", _listbox.id);
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");

        const onClick = (e) => {
            e.preventDefault();
            core.setOpen(!core.open(), "trigger");
        };

        const onKey = (e) => {
            const k = e.key;
            if (!core.open()) {
                // closed -> opening keys
                if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
                    e.preventDefault();
                    core.setOpen(true, "trigger");
                    return;
                }
                if (typeahead && k.length === 1 && /\S/.test(k)) {
                    core.setOpen(true, "trigger");
                    typeaheadHandle(k);
                    e.preventDefault();
                    return;
                }
                return;
            }
            // open -> navigation
            if (k === "ArrowDown")       { e.preventDefault(); moveHighlight(1); }
            else if (k === "ArrowUp")    { e.preventDefault(); moveHighlight(-1); }
            else if (k === "Home")       { e.preventDefault(); setHighlight(0); }
            else if (k === "End")        { e.preventDefault(); setHighlight(_items.length - 1); }
            else if (k === "Enter" || k === " ") {
                e.preventDefault();
                if (roving.index >= 0) selectIndex(roving.index);
            }
            else if (k === "Tab") {
                // Tab closes the listbox but doesn't prevent the normal tab flow:
                // user expects Tab to leave the combobox cleanly.
                core.setOpen(false, "tab");
            }
            else if (typeahead && k.length === 1 && /\S/.test(k)) {
                e.preventDefault();
                typeaheadHandle(k);
            }
        };

        el.addEventListener("click", onClick);
        el.addEventListener("keydown", onKey);

        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKey);
            el.removeAttribute("aria-haspopup");
            el.removeAttribute("aria-expanded");
            el.removeAttribute("aria-activedescendant");
            if (_listbox && _listbox.id) removeIdToken(el, "aria-controls", _listbox.id);
            if (_trigger === el) _trigger = null;
        };
        core._addCleanup(off);
        return off;
    }

    function attachListbox(el) {
        if (!el || core.destroyed) return noop;
        _listbox = el;
        if (!el.id) el.id = uniqueId("lh-listbox");
        setAttr(el, "role", "listbox");
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        setAttr(el, "aria-hidden", core.open() ? null : "true");
        toggleAttr(el, "data-open", core.open());
        setAttr(el, "data-status", core.status());
        core._setContentForTransitions(el);
        if (_trigger) addIdToken(_trigger, "aria-controls", el.id);

        if (closeOnOutsideClick) {
            const _insidesScratch = [];
            _outsideOff = bindOutsideClick(core, () => {
                _insidesScratch.length = 0;
                if (_listbox) _insidesScratch.push(_listbox);
                if (_trigger) _insidesScratch.push(_trigger);
                for (let i = 0; i < _extraInsides.length; i++) _insidesScratch.push(_extraInsides[i]);
                return _insidesScratch;
            });
        }
        if (closeOnEscape) _escapeOff = bindEscape(core);

        if (core.open()) doOpen();

        const off = () => {
            if (_listbox === el) {
                if (_trigger) removeIdToken(_trigger, "aria-controls", el.id);
                el.removeAttribute("role");
                el.removeAttribute("aria-hidden");
                el.removeAttribute("data-open");
                el.removeAttribute("data-status");
                el.removeAttribute("data-side");
                el.removeAttribute("data-align");
                _listbox = null;
            }
            if (_outsideOff) { _outsideOff(); _outsideOff = null; }
            if (_escapeOff)  { _escapeOff();  _escapeOff = null; }
        };
        core._addCleanup(off);
        return off;
    }

    function attachItem(el, meta = {}) {
        if (!el || core.destroyed) return noop;
        const { value, label } = meta;
        ensureId(el, "lh-option");
        setAttr(el, "role", "option");

        const entry = {
            el, id: el.id, value,
            label: label != null ? String(label) : (el.textContent || "").trim(),
        };
        _items.push(entry);

        // initial aria-selected reflection
        const isSelected = value === readValue();
        setAttr(el, "aria-selected", isSelected ? "true" : "false");
        toggleAttr(el, "data-selected", isSelected);

        const onClick = (e) => {
            e.preventDefault();
            const idx = _items.indexOf(entry);
            if (idx >= 0) selectIndex(idx);
        };
        const onPointerMove = () => {
            // pointer-driven highlight: hovering an item highlights it,
            // matching the conventional behavior of mouse + keyboard nav coexisting
            const idx = _items.indexOf(entry);
            if (idx !== roving.index) setHighlight(idx);
        };
        el.addEventListener("click", onClick);
        el.addEventListener("pointermove", onPointerMove);

        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("pointermove", onPointerMove);
            el.removeAttribute("role");
            el.removeAttribute("aria-selected");
            el.removeAttribute("data-selected");
            el.removeAttribute("data-highlighted");
            const idx = _items.indexOf(entry);
            if (idx >= 0) {
                _items.splice(idx, 1);
                // If the highlighted item was at or past the new end of
                // the list, clamp back to the last valid item.
                if (roving.index >= _items.length) {
                    roving.setIndex(_items.length - 1);
                }
            }
        };
        core._addCleanup(off);
        return off;
    }

    function attachInside(el) {
        if (!el || core.destroyed) return noop;
        _extraInsides.push(el);
        const off = () => {
            const i = _extraInsides.indexOf(el);
            if (i !== -1) _extraInsides.splice(i, 1);
        };
        core._addCleanup(off);
        return off;
    }

    function destroy() {
        if (core.open()) doClose();
        if (_restorePortal) { _restorePortal(); _restorePortal = null; }
        roving.destroy();
        core.destroy();
    }

    return {
        open: core.open,
        status: core.status,
        setOpen: core.setOpen,
        toggle: core.toggle,
        value: () => readValue(),
        setValue: (v, reason) => writeValue(v, reason || "api"),
        attachTrigger,
        attachListbox,
        attachItem,
        attachInside,
        destroy,
        get destroyed() { return core.destroyed; },
        // introspection (handy for tests)
        _items: () => _items.slice(),
        _highlightIndex: () => roving.index,
    };
}

function noop() {}
