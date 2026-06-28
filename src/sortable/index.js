// @zakkster/lite-headless / sortable
//
// Headless drag-to-reorder list. Items are tracked by string KEY (not
// DOM order); the canonical state is an array of keys representing
// the current order. Consumers either render their list in framework
// (React/Vue/etc) and call attachItem(el, key) as nodes appear, or
// opt-in to applyDOMReorder so the primitive moves DOM nodes itself
// on commit (vanilla mode).
//
// Drag mechanics
// --------------
// pointerdown on item (or its registered handle) records the start
// position. Once the pointer moves past `dragStartThreshold` pixels
// (5 by default), the drag begins. During drag:
//   - the dragging item gets `data-dragging="true"`
//   - a "slot midpoint" test determines which slot the pointer is
//     hovering — the slot that would receive the item on drop
//   - the slot element gets `data-insert-before="true"` (vertical
//     orientation) or similar; previous indicator slots are cleared
//   - pointerup commits the reorder + fires onReorder; pointercancel
//     and Escape revert
//
// Rect caching
// ------------
// Reading getBoundingClientRect on every pointermove triggers style/
// layout recalc and would be O(N) per move at ~120 Hz. Sortable caches
// every item's rect at dragstart, plus the container's rect, and uses
// the cached values during pointer moves. The cache is invalidated on
// commit + on window resize + on scroll of the scroll-parent.
//
// Keyboard fallback (per WAI-ARIA editable-grid pattern)
// ------------------------------------------------------
//   Tab to focus an item
//   Space     -> "pick up" the item (aria-grabbed=true, announced)
//   Arrow ↑↓  -> move pickup position by 1 (vertical orientation)
//   Arrow ←→  -> move pickup position by 1 (horizontal orientation)
//   Home/End  -> top / bottom
//   Space     -> drop (commit)
//   Escape    -> cancel pickup, revert

import { signal as makeSignal, effect } from "@zakkster/lite-signal";

const noop = () => {};
let _idCounter = 0;
const uniqueId = (prefix) => `${prefix}-${++_idCounter}`;
function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

export function createSortable(options = {}) {
    const {
        orientation        = "vertical",      // "vertical" | "horizontal"
        items: initialItems = [],             // string[] of starting keys
        onReorder,                            // (newOrder, info) => void
        onDragStart,                          // (key) => void
        onDragEnd,                            // (key, committed) => void
        applyDOMReorder    = false,           // vanilla mode: primitive moves DOM nodes
        disabled           = false,
        keyboardEnabled    = true,
        dragStartThreshold = 5,               // px before drag begins
        announceLive       = true,            // build an internal aria-live region
    } = options;

    if (orientation !== "vertical" && orientation !== "horizontal") {
        throw new Error(`createSortable: orientation must be "vertical" or "horizontal", got "${orientation}"`);
    }

    // ----- state -----------------------------------------------------
    const _order = makeSignal(Array.isArray(initialItems) ? initialItems.slice() : []);
    const _dragKey = makeSignal(null);        // key currently being dragged (pointer or keyboard)
    const _grabKey = makeSignal(null);        // key currently "picked up" via keyboard
    const _dragMode = makeSignal(null);       // "pointer" | "keyboard" | null
    let _disabled = !!disabled;
    let _destroyed = false;

    let _rootEl = null;
    let _liveRegionEl = null;
    const _items = new Map();                 // key -> { el, handle, disabled, detach }

    // ----- order helpers --------------------------------------------
    function _indexOf(key) {
        const arr = _order();
        for (let i = 0; i < arr.length; i++) if (arr[i] === key) return i;
        return -1;
    }
    function _setOrder(newOrder, info) {
        const cur = _order();
        // identity check: skip if same array contents in same order
        if (cur.length === newOrder.length) {
            let same = true;
            for (let i = 0; i < cur.length; i++) {
                if (cur[i] !== newOrder[i]) { same = false; break; }
            }
            if (same) return false;
        }
        _order.set(newOrder.slice());
        if (applyDOMReorder) _applyDOMReorder(newOrder);
        if (onReorder) {
            try { onReorder(newOrder.slice(), info || { reason: "set" }); } catch { /* swallow */ }
        }
        return true;
    }

    function _applyDOMReorder(newOrder) {
        // The primitive owns the relative order of attached item els
        // among their CURRENT siblings. We walk newOrder and re-append
        // each item el to its parent in order. Non-item siblings stay
        // in place (anchor-relative). This works for the common case
        // of a flat list; nested layouts may need custom handling
        // (consumer should not opt into applyDOMReorder in that case).
        //
        // FOCUS PRESERVATION: appendChild on the focused element
        // implicitly blurs it in every major browser. Without this
        // guard, keyboard pickup mode (Space + arrows) loses focus on
        // the FIRST arrow press, so all subsequent keys go to <body>
        // and the user thinks "only Space works." Snapshot
        // document.activeElement before the appendChild dance; if it
        // was a sortable item, re-focus it after.
        let focusedKey = null;
        if (typeof document !== "undefined") {
            const ae = document.activeElement;
            if (ae && ae._lhSortableKey != null) focusedKey = ae._lhSortableKey;
        }
        for (const key of newOrder) {
            const it = _items.get(key);
            if (!it || !it.el) continue;
            const parent = it.el.parentNode;
            if (parent) parent.appendChild(it.el);
        }
        if (focusedKey != null) {
            const it = _items.get(focusedKey);
            if (it && it.el && document.activeElement !== it.el) {
                // preventScroll keeps the viewport from jumping when
                // the moved item is offscreen during a rapid sequence
                // of keyboard moves.
                try { it.el.focus({ preventScroll: true }); }
                catch { it.el.focus(); }
            }
        }
    }

    // ----- rect cache + slot detection ------------------------------
    // _rectCache stores per-item DOMRect at dragstart. Used to find
    // which slot the pointer is over without re-reading the DOM (which
    // would trigger layout recalc).
    let _rectCache = null;            // Map<key, { rect, midpoint }>
    let _containerRect = null;
    function _buildRectCache() {
        _rectCache = new Map();
        const arr = _order();
        const isV = orientation === "vertical";
        for (const key of arr) {
            const it = _items.get(key);
            // Include disabled items: they are inert as a DRAG SOURCE
            // (you can't pick them up), but they remain valid as DROP
            // NEIGHBORS -- you can drop other items into the gap above
            // or below them. Excluding them from the rect cache used
            // to cause `_slotIndexAt` to fall through past their slot,
            // painting the indicator on the wrong gap and committing
            // the drop one position too far. (Bug fixed v0.7.20.)
            if (!it || !it.el) continue;
            const rect = it.el.getBoundingClientRect();
            const midpoint = isV ? (rect.top + rect.bottom) / 2
                                 : (rect.left + rect.right) / 2;
            _rectCache.set(key, { rect, midpoint });
        }
        if (_rootEl) _containerRect = _rootEl.getBoundingClientRect();
    }
    function _invalidateRectCache() {
        _rectCache = null;
        _containerRect = null;
    }
    function _slotIndexAt(pointerX, pointerY) {
        // Given a pointer coord, return the index in _order where the
        // dragged item would land if dropped. Compares pointer's main-
        // axis coord against cached midpoints.
        if (!_rectCache) return -1;
        const arr = _order();
        const isV = orientation === "vertical";
        const pointerMain = isV ? pointerY : pointerX;
        const dragKey = _dragKey();
        let landingIndex = arr.length;
        for (let i = 0; i < arr.length; i++) {
            const k = arr[i];
            if (k === dragKey) continue;     // skip the dragged item itself
            const cached = _rectCache.get(k);
            if (!cached) continue;
            if (pointerMain < cached.midpoint) {
                landingIndex = i;
                break;
            }
        }
        // adjust if the landing index is AFTER the dragged item's
        // current position: we need to subtract 1 because removing the
        // dragged item shifts later indices down by 1.
        const dragIdx = _indexOf(dragKey);
        if (dragIdx >= 0 && landingIndex > dragIdx) landingIndex--;
        return landingIndex;
    }

    // ----- pointer event handlers -----------------------------------
    let _pointerStart = null;     // { x, y, key, handleEl, pointerId }
    let _draggingFlag = false;    // true once threshold crossed
    let _lastIndicatorSlot = null; // index where indicator was last painted

    function _onPointerDown(e) {
        if (_destroyed || _disabled) return;
        if (e.button !== 0 && e.button !== undefined) return;  // primary only
        // Find which item this event originated from. e.target is the
        // deepest element under the pointer; walk up to find a tagged
        // sortable item (and any registered handle).
        let t = e.target;
        let handleEl = null, itemEl = null, itemKey = null;
        while (t && t !== _rootEl) {
            if (t._lhSortableHandle) handleEl = t;
            if (t._lhSortableKey != null) { itemEl = t; itemKey = t._lhSortableKey; break; }
            t = t.parentElement;
        }
        if (!itemEl) return;
        const itemEntry = _items.get(itemKey);
        if (!itemEntry || itemEntry.disabled) return;

        // If the item has a registered handle, the press must be on it.
        if (itemEntry.handle && !handleEl) return;
        if (itemEntry.handle && handleEl && handleEl !== itemEntry.handle) return;

        // Suppress the synthetic text-selection that the browser starts
        // on mousedown for non-input elements. We only do this when the
        // press target isn't an input/textarea/contenteditable so we
        // don't break those if they happen to be inside a sortable row.
        const target = e.target;
        const tag = target && target.tagName ? target.tagName.toUpperCase() : "";
        const isEditable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
            (target && target.isContentEditable);
        if (!isEditable && e.preventDefault) e.preventDefault();

        _pointerStart = { x: e.clientX, y: e.clientY, key: itemKey, pointerId: e.pointerId };
        _draggingFlag = false;

        // Attach window-level move/up listeners; we won't begin drag
        // until threshold is crossed.
        window.addEventListener("pointermove", _onPointerMove, { passive: false });
        window.addEventListener("pointerup",   _onPointerUp);
        window.addEventListener("pointercancel", _onPointerCancel);
        window.addEventListener("keydown",     _onPointerEscape);
    }

    function _onPointerMove(e) {
        if (!_pointerStart || _destroyed) return;
        if (e.pointerId !== _pointerStart.pointerId) return;

        // Always preventDefault during a pending pointer interaction --
        // before AND after the drag threshold is crossed -- so the
        // browser doesn't start text selection during the pre-threshold
        // ramp (1-4px of motion). The CSS `user-select: none` on items
        // is the right belt; this is the suspenders.
        if (e.cancelable) e.preventDefault();

        if (!_draggingFlag) {
            // Check threshold
            const dx = e.clientX - _pointerStart.x;
            const dy = e.clientY - _pointerStart.y;
            if ((dx * dx + dy * dy) < dragStartThreshold * dragStartThreshold) return;
            _beginDrag(_pointerStart.key);
        }
        // We're dragging -- compute new slot
        const slot = _slotIndexAt(e.clientX, e.clientY);
        _paintInsertIndicator(slot);
    }

    function _onPointerUp(e) {
        if (!_pointerStart) return;
        if (e.pointerId !== _pointerStart.pointerId) return;
        const wasdragging = _draggingFlag;
        let committed = false;
        if (wasdragging) {
            const slot = _slotIndexAt(e.clientX, e.clientY);
            committed = _commitMove(_dragKey(), slot);
        }
        _endDrag(committed);
    }

    function _onPointerCancel() {
        _endDrag(false);
    }

    function _onPointerEscape(e) {
        if (e.key !== "Escape") return;
        if (!_draggingFlag) return;
        e.preventDefault();
        _endDrag(false);    // revert
    }

    function _beginDrag(key) {
        _draggingFlag = true;
        _dragKey.set(key);
        _dragMode.set("pointer");
        _buildRectCache();
        const it = _items.get(key);
        if (it && it.el) setAttr(it.el, "data-dragging", "true");
        _announce(`Picked up item ${_indexOf(key) + 1}`);
        if (onDragStart) try { onDragStart(key); } catch { /* swallow */ }
    }

    function _endDrag(committed) {
        const key = _dragKey();
        // tear down pointer listeners (idempotent)
        window.removeEventListener("pointermove",    _onPointerMove);
        window.removeEventListener("pointerup",      _onPointerUp);
        window.removeEventListener("pointercancel",  _onPointerCancel);
        window.removeEventListener("keydown",        _onPointerEscape);
        _pointerStart = null;
        _draggingFlag = false;
        if (key != null) {
            const it = _items.get(key);
            if (it && it.el) removeAttr(it.el, "data-dragging");
        }
        _clearInsertIndicator();
        _dragKey.set(null);
        _dragMode.set(null);
        _invalidateRectCache();
        if (key != null) {
            if (committed) _announce(`Dropped item at position ${_indexOf(key) + 1}`);
            else _announce("Cancelled drag");
            if (onDragEnd) try { onDragEnd(key, committed); } catch { /* swallow */ }
        }
    }

    function _commitMove(key, toIndex) {
        if (key == null) return false;
        const arr = _order();
        const fromIdx = _indexOf(key);
        if (fromIdx < 0) return false;
        if (toIndex < 0 || toIndex > arr.length - 1) toIndex = arr.length - 1;
        if (toIndex === fromIdx) return false;
        const next = arr.slice();
        next.splice(fromIdx, 1);
        next.splice(toIndex, 0, key);
        return _setOrder(next, { reason: _dragMode() === "keyboard" ? "keyboard" : "drag", from: fromIdx, to: toIndex, key });
    }

    function _paintInsertIndicator(slotIndex) {
        // clear previous
        _clearInsertIndicator();
        if (slotIndex < 0) return;
        const arr = _order();
        const dragKey = _dragKey();
        const remaining = arr.filter(k => k !== dragKey);
        // `slotIndex` is the position in the FINAL order array where
        // the dragged item will land -- equivalently, the splice
        // insertion point into `remaining`. The visual insertion line
        // sits at the gap between remaining[slotIndex-1] and
        // remaining[slotIndex]. We paint it as:
        //   - slotIndex === 0                   -> BEFORE remaining[0]
        //   - 0 < slotIndex < remaining.length  -> BEFORE remaining[slotIndex]
        //   - slotIndex >= remaining.length     -> AFTER  remaining[last]
        //
        // The previous version painted "AFTER remaining[slotIndex]"
        // when slotIndex >= dragIdx, which was off-by-one downward
        // (chasing the indicator made users undershoot by one
        // position, and at slotIndex == dragIdx the indicator
        // suggested motion while commit was a no-op).
        if (remaining.length === 0) return;
        let targetKey, attrName;
        if (slotIndex >= remaining.length) {
            targetKey = remaining[remaining.length - 1];
            attrName  = "data-insert-after";
        } else {
            targetKey = remaining[slotIndex];
            attrName  = "data-insert-before";
        }
        const it = _items.get(targetKey);
        if (it && it.el) {
            setAttr(it.el, attrName, "true");
            _lastIndicatorSlot = { el: it.el, attr: attrName };
        }
    }
    function _clearInsertIndicator() {
        if (_lastIndicatorSlot) {
            removeAttr(_lastIndicatorSlot.el, _lastIndicatorSlot.attr);
            _lastIndicatorSlot = null;
        }
    }

    // ----- keyboard "picked up" mode --------------------------------
    function _onItemKeyDown(e, key) {
        if (_destroyed || _disabled || !keyboardEnabled) return;
        const it = _items.get(key);
        if (!it || it.disabled) return;

        const grabbed = _grabKey();
        if (grabbed == null) {
            // Not yet picked up. Space picks up.
            if (e.key === " " || e.key === "Spacebar") {
                e.preventDefault();
                _grabKey.set(key);
                _dragMode.set("keyboard");
                setAttr(it.el, "aria-grabbed", "true");
                setAttr(it.el, "data-dragging", "true");
                _announce(`Picked up item ${_indexOf(key) + 1}. Use arrows to move, Space to drop, Escape to cancel.`);
                if (onDragStart) try { onDragStart(key); } catch {}
            }
            return;
        }

        // We're in pickup mode. Only the picked-up item responds.
        if (key !== grabbed) return;

        const isV = orientation === "vertical";
        const prevKeys = [isV ? "ArrowUp"   : "ArrowLeft"];
        const nextKeys = [isV ? "ArrowDown" : "ArrowRight"];

        if (prevKeys.includes(e.key)) {
            e.preventDefault();
            _moveBy(grabbed, -1);
        } else if (nextKeys.includes(e.key)) {
            e.preventDefault();
            _moveBy(grabbed, +1);
        } else if (e.key === "Home") {
            e.preventDefault();
            _moveTo(grabbed, 0);
        } else if (e.key === "End") {
            e.preventDefault();
            _moveTo(grabbed, _order().length - 1);
        } else if (e.key === " " || e.key === "Spacebar" || e.key === "Enter") {
            e.preventDefault();
            _endKeyboardGrab(true);
        } else if (e.key === "Escape") {
            e.preventDefault();
            _endKeyboardGrab(false);
        }
    }

    function _moveBy(key, delta) {
        const i = _indexOf(key);
        if (i < 0) return;
        _moveTo(key, i + delta);
    }
    function _moveTo(key, toIndex) {
        const i = _indexOf(key);
        if (i < 0) return;
        const arr = _order();
        const target = Math.max(0, Math.min(arr.length - 1, toIndex));
        if (target === i) return;
        const next = arr.slice();
        next.splice(i, 1);
        next.splice(target, 0, key);
        _setOrder(next, { reason: "keyboard", from: i, to: target, key });
        _announce(`Item now at position ${target + 1}`);
    }
    function _endKeyboardGrab(committed) {
        const key = _grabKey();
        if (key == null) return;
        const it = _items.get(key);
        if (it && it.el) {
            removeAttr(it.el, "aria-grabbed");
            removeAttr(it.el, "data-dragging");
        }
        _grabKey.set(null);
        _dragMode.set(null);
        if (committed) _announce(`Dropped at position ${_indexOf(key) + 1}`);
        else _announce("Cancelled");
        if (onDragEnd) try { onDragEnd(key, committed); } catch {}
    }

    // ----- aria-live announcer --------------------------------------
    function _announce(text) {
        if (!announceLive || !_liveRegionEl) return;
        // Set to empty first to ensure SR re-announces same text
        _liveRegionEl.textContent = "";
        // Use rAF + setTimeout pattern to land in the next frame
        // reliably across browsers
        setTimeout(() => { if (_liveRegionEl) _liveRegionEl.textContent = text; }, 16);
    }

    // ----- public attachments ---------------------------------------
    function attachRoot(el, opts) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        if (!el.id) el.id = uniqueId("lh-sortable");
        setAttr(el, "role", "listbox");
        setAttr(el, "aria-orientation", orientation);
        if (opts && opts.label) setAttr(el, "aria-label", opts.label);
        setAttr(el, "data-orientation", orientation);
        // pointer down listener delegated at root
        el.addEventListener("pointerdown", _onPointerDown);

        if (announceLive) {
            _liveRegionEl = document.createElement("div");
            _liveRegionEl.setAttribute("aria-live", "polite");
            _liveRegionEl.setAttribute("aria-atomic", "true");
            _liveRegionEl.style.cssText = "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";
            el.appendChild(_liveRegionEl);
        }

        return () => {
            el.removeEventListener("pointerdown", _onPointerDown);
            if (_liveRegionEl && _liveRegionEl.parentNode === el) {
                el.removeChild(_liveRegionEl);
            }
            _liveRegionEl = null;
            if (_rootEl === el) _rootEl = null;
        };
    }

    function attachItem(el, key, opts) {
        if (!el || _destroyed) return noop;
        if (key == null) throw new Error("attachItem: key is required");
        const k = String(key);
        const isDisabled = !!(opts && opts.disabled);
        if (!el.id) el.id = uniqueId("lh-sortable-item");
        el._lhSortableKey = k;
        setAttr(el, "role", "option");
        if (isDisabled) setAttr(el, "aria-disabled", "true");

        // If not already in _order, push to the end (consumer's call to
        // build the list incrementally is supported).
        if (_indexOf(k) < 0) {
            const arr = _order().slice();
            arr.push(k);
            _order.set(arr);
        }

        const entry = { el, handle: null, disabled: isDisabled };
        _items.set(k, entry);

        // Per-item keyboard listener (only fires when item is focused)
        const onKey = (e) => _onItemKeyDown(e, k);
        el.addEventListener("keydown", onKey);
        // Make item focusable if it isn't already
        if (!el.hasAttribute("tabindex")) setAttr(el, "tabindex", "0");

        return () => {
            try { delete el._lhSortableKey; } catch {}
            el.removeEventListener("keydown", onKey);
            removeAttr(el, "role");
            removeAttr(el, "aria-grabbed");
            removeAttr(el, "aria-disabled");
            removeAttr(el, "data-dragging");
            removeAttr(el, "data-insert-before");
            removeAttr(el, "data-insert-after");
            _items.delete(k);
            // remove from order
            const arr = _order().filter(x => x !== k);
            _order.set(arr);
        };
    }

    function attachHandle(el, key) {
        if (!el || _destroyed) return noop;
        const k = String(key);
        const entry = _items.get(k);
        if (!entry) {
            throw new Error(`attachHandle: no item attached with key "${k}" -- call attachItem first`);
        }
        el._lhSortableHandle = true;
        entry.handle = el;
        setAttr(el, "data-sortable-handle", "true");
        // Set cursor hint
        if (!el.style.cursor) el.style.cursor = "grab";
        return () => {
            try { delete el._lhSortableHandle; } catch {}
            removeAttr(el, "data-sortable-handle");
            if (entry) entry.handle = null;
        };
    }

    // ----- imperative API -------------------------------------------
    function items() { return _order(); }
    function isDragging() { return _dragKey() != null || _grabKey() != null; }
    function dragKey() { return _dragKey() || _grabKey(); }

    function move(key, toIndex) {
        if (_destroyed) return false;
        const fromIdx = _indexOf(key);
        if (fromIdx < 0) return false;
        const arr = _order();
        const target = Math.max(0, Math.min(arr.length - 1, toIndex | 0));
        if (target === fromIdx) return false;
        const next = arr.slice();
        next.splice(fromIdx, 1);
        next.splice(target, 0, key);
        return _setOrder(next, { reason: "api", from: fromIdx, to: target, key });
    }
    function swap(keyA, keyB) {
        const i = _indexOf(keyA), j = _indexOf(keyB);
        if (i < 0 || j < 0) return false;
        const arr = _order().slice();
        [arr[i], arr[j]] = [arr[j], arr[i]];
        return _setOrder(arr, { reason: "api-swap", a: keyA, b: keyB });
    }
    function setOrder(newOrder) {
        return _setOrder(newOrder, { reason: "set" });
    }
    function insertAt(key, atIndex) {
        if (_indexOf(key) >= 0) return false;     // already present
        const arr = _order().slice();
        const target = Math.max(0, Math.min(arr.length, atIndex | 0));
        arr.splice(target, 0, String(key));
        return _setOrder(arr, { reason: "insert", at: target, key });
    }
    function removeKey(key) {
        const i = _indexOf(key);
        if (i < 0) return false;
        const arr = _order().slice();
        arr.splice(i, 1);
        return _setOrder(arr, { reason: "remove", at: i, key });
    }
    function setDisabled(flag) { _disabled = !!flag; }
    function setItemDisabled(key, flag) {
        const it = _items.get(String(key));
        if (!it) return;
        it.disabled = !!flag;
        if (it.el) {
            if (flag) setAttr(it.el, "aria-disabled", "true");
            else removeAttr(it.el, "aria-disabled");
        }
    }

    // ----- destroy ---------------------------------------------------
    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        // tear down any in-flight drag
        if (_draggingFlag) _endDrag(false);
        if (_grabKey() != null) _endKeyboardGrab(false);
        _items.clear();
        _rootEl = null;
        _liveRegionEl = null;
    }

    return {
        // reactive
        order: () => _order(),
        items,
        dragging: () => _dragKey(),
        grabbed: () => _grabKey(),
        // imperative
        move, swap, setOrder, insertAt, removeKey,
        setDisabled, setItemDisabled,
        isDragging, dragKey,
        // attachments
        attachRoot,
        attachItem,
        attachHandle,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
    };
}
