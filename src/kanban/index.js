// @zakkster/lite-headless / kanban / index.js
//
// createKanban(options) -> KanbanHandle
//
// Headless kanban board primitive: a set of columns each containing
// an ordered set of cards. Composes with createSortable for in-column
// drag-to-reorder. Cross-column moves go through `moveCard()` (called
// programmatically OR from a consumer-built drag/drop handler).
//
// DATA MODEL
//
//   columns:    ColumnDef[]   -- { id, title, ...meta }
//   cards:      CardDef[]     -- { id, columnId, ...meta }
//
// `cards` is the canonical source: each card knows which column it
// lives in. The primitive maintains a per-column visible order in
// `_columnOrder[colId]`, and `cardsInColumn(colId)` returns the cards
// in that order. Adding a card without a position appends it.
//
// IN-COLUMN REORDER
//
// Each attached column gets its own internal sortable instance, wired
// to that column's card-order signal. Pointer drag within a column
// updates the column's order via sortable's onReorder callback.
//
// CROSS-COLUMN MOVE
//
// Two options:
//   1. `moveCard(cardId, toColumnId, toIndex)` -- programmatic.
//   2. Consumer builds drag detection at the page level (e.g. HTML5
//      DnD for cross-column, pointer events for in-column) and calls
//      `moveCard()` on drop. The primitive's `attachDropZone(el, colId)`
//      helper wires the HTML5-DnD pattern if the consumer prefers.
//
// All mutations go through onCardMove if provided.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";
import { createSortable } from "../sortable/index.js";

function noop() {}

export function createKanban(options = {}) {
    const {
        columns: initialColumns = [],
        cards: initialCards = [],
        onCardMove,           // (cardId, fromColumnId, toColumnId, newIndex, reason) => void
        onCardClick,          // (cardId, ev) => void
        onColumnAdd,          // (columnId) => void
        onColumnRemove,       // (columnId) => void
        sortableOptions = {}, // forwarded to per-column createSortable
        inColumnSortable = true, // when false, attachCard SKIPS the per-card
                                 // sortable attachment. Required for HTML5
                                 // DnD mode: sortable's pointerdown handler
                                 // calls preventDefault() to suppress text
                                 // selection, which ALSO blocks native HTML5
                                 // drag from initiating. Result: cross-column
                                 // drag silently fails because dragstart never
                                 // fires. When using attachDraggable +
                                 // attachDropZone for HTML5 DnD, the drop
                                 // handler computes within-column target
                                 // index from pointer Y anyway, so disabling
                                 // sortable loses no functionality.
    } = options;

    let _destroyed = false;
    const _cleanups = [];
    function addCleanup(fn) { if (fn) _cleanups.push(fn); }

    // ----- internal state -------------------------------------------------
    //
    // _columns is a signal of the ColumnDef[] in display order.
    // _cards is a signal of all CardDef[] (unordered; per-column order
    // lives in _columnOrder).
    // _columnOrder[colId] is an array of cardId[] giving the ordered
    // contents of that column.

    const _columns = makeSignal(initialColumns.slice());
    const _cards = makeSignal(initialCards.slice());
    const _columnOrder = new Map();    // colId -> string[] of cardIds

    // Seed initial column order from initialCards.
    for (const card of initialCards) {
        const col = card.columnId;
        if (col == null) continue;
        if (!_columnOrder.has(col)) _columnOrder.set(col, []);
        _columnOrder.get(col).push(card.id);
    }
    // Reactive accessor for the order of a column (used by sortable).
    const _columnOrderSig = new Map();   // colId -> signal of cardId[]
    function ensureColumnOrderSig(colId) {
        let sig = _columnOrderSig.get(colId);
        if (!sig) {
            sig = makeSignal(_columnOrder.get(colId) ? _columnOrder.get(colId).slice() : []);
            _columnOrderSig.set(colId, sig);
        }
        return sig;
    }

    // ----- public accessors ----------------------------------------------

    function columns() { return _columns(); }
    function cards()   { return _cards(); }
    function getCard(id) {
        const arr = _cards();
        for (let i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
        return null;
    }
    function getColumn(id) {
        const arr = _columns();
        for (let i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
        return null;
    }
    function cardsInColumn(colId) {
        const order = _columnOrder.get(colId);
        if (!order || !order.length) return [];
        const out = [];
        for (let i = 0; i < order.length; i++) {
            const c = getCard(order[i]);
            if (c) out.push(c);
        }
        return out;
    }

    // Reactive variant for use inside an effect. Reads the column-order
    // signal so the effect re-runs when sortable updates it.
    function cardsInColumnReactive(colId) {
        const sig = ensureColumnOrderSig(colId);
        const order = sig();
        const out = [];
        for (let i = 0; i < order.length; i++) {
            const c = getCard(order[i]);
            if (c) out.push(c);
        }
        return out;
    }

    // ----- mutations ------------------------------------------------------

    function addColumn(col) {
        if (_destroyed || !col || !col.id) return;
        const cur = _columns();
        for (let i = 0; i < cur.length; i++) if (cur[i].id === col.id) return;
        _columns.set(cur.concat([col]));
        if (!_columnOrder.has(col.id)) _columnOrder.set(col.id, []);
        ensureColumnOrderSig(col.id);
        if (onColumnAdd) onColumnAdd(col.id);
    }

    function removeColumn(colId) {
        if (_destroyed || colId == null) return;
        const cur = _columns();
        let idx = -1;
        for (let i = 0; i < cur.length; i++) {
            if (cur[i].id === colId) { idx = i; break; }
        }
        if (idx === -1) return;
        // Remove all cards in this column.
        const orphans = _columnOrder.get(colId) || [];
        _columnOrder.delete(colId);
        _columnOrderSig.delete(colId);
        const next = cur.slice();
        next.splice(idx, 1);
        _columns.set(next);
        if (orphans.length) {
            const remaining = _cards().filter(c => !orphans.includes(c.id));
            _cards.set(remaining);
        }
        // Tear down the column's sortable if attached.
        const attached = _columnAttached.get(colId);
        if (attached) {
            try { attached.off(); } catch {}
            _columnAttached.delete(colId);
        }
        if (onColumnRemove) onColumnRemove(colId);
    }

    function addCard(card) {
        if (_destroyed || !card || !card.id || card.columnId == null) return;
        // Dedup by id.
        const cur = _cards();
        for (let i = 0; i < cur.length; i++) if (cur[i].id === card.id) return;
        // Make sure the target column exists.
        const colExists = _columnOrder.has(card.columnId);
        if (!colExists) return;
        _cards.set(cur.concat([card]));
        const order = _columnOrder.get(card.columnId).slice();
        order.push(card.id);
        _columnOrder.set(card.columnId, order);
        ensureColumnOrderSig(card.columnId).set(order);
    }

    function removeCard(cardId) {
        if (_destroyed || cardId == null) return;
        const card = getCard(cardId);
        if (!card) return;
        _cards.set(_cards().filter(c => c.id !== cardId));
        const order = _columnOrder.get(card.columnId);
        if (order) {
            const next = order.filter(id => id !== cardId);
            _columnOrder.set(card.columnId, next);
            ensureColumnOrderSig(card.columnId).set(next);
        }
    }

    function updateCard(cardId, partial) {
        if (_destroyed || cardId == null || !partial) return;
        const cur = _cards();
        let idx = -1;
        for (let i = 0; i < cur.length; i++) {
            if (cur[i].id === cardId) { idx = i; break; }
        }
        if (idx === -1) return;
        // Reject columnId changes through updateCard (use moveCard for that).
        const next = cur.slice();
        const merged = Object.assign({}, cur[idx], partial, {
            id: cardId,
            columnId: cur[idx].columnId,
        });
        next[idx] = merged;
        _cards.set(next);
    }

    // Move a card to a target column at a target index. If toColumnId is
    // the card's current column, this is an intra-column reorder. If
    // different, this is a cross-column transfer. toIndex < 0 or > length
    // is clamped.
    function moveCard(cardId, toColumnId, toIndex, reason) {
        if (_destroyed || cardId == null || toColumnId == null) return;
        const card = getCard(cardId);
        if (!card) return;
        if (!_columnOrder.has(toColumnId)) return;
        const fromColumnId = card.columnId;
        // Remove from source order
        const fromOrder = _columnOrder.get(fromColumnId) || [];
        const nextFrom = fromOrder.filter(id => id !== cardId);
        // Determine target order (whether same or different column)
        let nextTo;
        if (toColumnId === fromColumnId) {
            nextTo = nextFrom.slice();
        } else {
            nextTo = (_columnOrder.get(toColumnId) || []).slice();
        }
        const clampedIdx = Math.max(0, Math.min(toIndex == null ? nextTo.length : toIndex, nextTo.length));
        nextTo.splice(clampedIdx, 0, cardId);
        // Commit
        _columnOrder.set(toColumnId, nextTo);
        ensureColumnOrderSig(toColumnId).set(nextTo);
        if (toColumnId !== fromColumnId) {
            _columnOrder.set(fromColumnId, nextFrom);
            ensureColumnOrderSig(fromColumnId).set(nextFrom);
            // Update the card's columnId in the cards list.
            const cur = _cards();
            const cardIdx = cur.findIndex(c => c.id === cardId);
            if (cardIdx !== -1) {
                const updated = Object.assign({}, cur[cardIdx], { columnId: toColumnId });
                const next = cur.slice();
                next[cardIdx] = updated;
                _cards.set(next);
            }
        }
        if (onCardMove) {
            onCardMove(cardId, fromColumnId, toColumnId, clampedIdx, reason || "api");
        }
    }

    // ----- attach: column container --------------------------------------
    //
    // Each column attaches one container element. The container becomes
    // the sortable root for in-column reorder. The wrapper consumer
    // attaches card elements separately via attachCard().

    const _columnAttached = new Map();   // colId -> { el, sortable, off }

    function attachColumn(el, colId) {
        if (!el || _destroyed) return noop;
        if (!_columnOrder.has(colId)) {
            // Auto-register the column if not yet present (lets consumer
            // attach columns declaratively without prior addColumn).
            _columnOrder.set(colId, []);
            ensureColumnOrderSig(colId);
        }
        const prev = _columnAttached.get(colId);
        if (prev) {
            try { prev.off(); } catch {}
        }
        ensureId(el, "lh-kanban-col");
        setAttr(el, "role", "list");
        setAttr(el, "data-kanban-column-id", String(colId));

        const sortable = createSortable(Object.assign({
            items: _columnOrder.get(colId).slice(),
            applyDOMReorder: false,
            onReorder: (newOrder, info) => {
                _columnOrder.set(colId, newOrder.slice());
                ensureColumnOrderSig(colId).set(newOrder.slice());
                if (onCardMove && info && info.reason === "drag") {
                    // Find which card moved (compare with previous state via the
                    // primitive's pre-reorder snapshot; sortable provides reason
                    // but not the specific key, so we diff here.
                    // In practice, intra-column reorder reports the key via
                    // info.key when sortable supplies it; fall back to scanning.
                    const movedKey = info.key || null;
                    if (movedKey) {
                        const newIdx = newOrder.indexOf(movedKey);
                        onCardMove(movedKey, colId, colId, newIdx, "drag");
                    }
                }
            },
        }, sortableOptions));
        sortable.attachRoot(el);

        const off = () => {
            sortable.destroy();
            el.removeAttribute("role");
            el.removeAttribute("data-kanban-column-id");
            _columnAttached.delete(colId);
        };
        _columnAttached.set(colId, { el, sortable, off });
        addCleanup(off);
        return off;
    }

    // ----- attach: card ---------------------------------------------------
    //
    // Cards attach to a specific column's sortable. The card element
    // gets data attributes for state + a click handler. Pointer drag
    // is handled by the column's sortable instance.

    const _cardAttached = new Map();   // cardEl -> { cardId, sortableOff, paintOff, off }

    function attachCard(el, cardId) {
        if (!el || _destroyed || cardId == null) return noop;
        const card = getCard(cardId);
        if (!card) return noop;
        const colId = card.columnId;
        const columnEntry = _columnAttached.get(colId);
        if (!columnEntry) return noop;     // column not yet attached

        const prev = _cardAttached.get(el);
        if (prev) { try { prev.off(); } catch {} }

        ensureId(el, "lh-kanban-card");
        setAttr(el, "data-kanban-card-id", String(cardId));
        setAttr(el, "role", "listitem");
        if (!el.hasAttribute("tabindex")) setAttr(el, "tabindex", "0");

        const sortableOff = inColumnSortable
            ? columnEntry.sortable.attachItem(el, String(cardId))
            : noop;

        const onClick = (ev) => {
            if (onCardClick) onCardClick(cardId, ev);
        };
        el.addEventListener("click", onClick);

        // Paint effect: track the card's current column for paint reactivity
        // (so the same element ref stays painted correctly even after a
        // cross-column move that re-uses the same DOM).
        let _lastColId = colId;
        const paintOff = effect(() => {
            const c = getCard(cardId);
            if (!c) return;
            if (c.columnId !== _lastColId) {
                setAttr(el, "data-kanban-card-column", String(c.columnId));
                _lastColId = c.columnId;
            } else if (!el.hasAttribute("data-kanban-card-column")) {
                setAttr(el, "data-kanban-card-column", String(c.columnId));
            }
        });

        const off = () => {
            try { sortableOff(); } catch {}
            paintOff();
            el.removeEventListener("click", onClick);
            el.removeAttribute("data-kanban-card-id");
            el.removeAttribute("data-kanban-card-column");
            el.removeAttribute("role");
            _cardAttached.delete(el);
        };
        _cardAttached.set(el, { cardId, off });
        addCleanup(off);
        return off;
    }

    // ----- attach: handle (drag origin within a card) --------------------

    function attachHandle(cardEl, handleEl) {
        if (!cardEl || !handleEl || _destroyed) return noop;
        const entry = _cardAttached.get(cardEl);
        if (!entry) return noop;
        const card = getCard(entry.cardId);
        if (!card) return noop;
        const columnEntry = _columnAttached.get(card.columnId);
        if (!columnEntry) return noop;
        const off = columnEntry.sortable.attachHandle(handleEl);
        addCleanup(off);
        return off;
    }

    // ----- attach: HTML5 drop zone (optional cross-column receiver) ------
    //
    // Wires the column container to accept HTML5 drag-and-drop drops
    // from another column. The consumer is responsible for marking
    // card elements as draggable=true and writing the cardId to
    // dataTransfer on dragstart. This wrapper handles dragover (prevent
    // default to allow drop), dragenter / dragleave for visual hover
    // state, and drop (parses cardId, computes target index from
    // pointer y, calls moveCard).
    //
    // This is opt-in. Consumers who use sortable's pointer-based drag
    // for cross-column (via custom logic) should NOT also attachDropZone.

    function attachDropZone(el, colId) {
        if (!el || _destroyed) return noop;
        // Track which card currently has data-kanban-drop-target so we
        // can clear it on the next dragover/leave/drop without scanning
        // the whole column tree each time.
        let _markedCard = null;
        let _markedEnd  = false;
        function clearIndicator() {
            if (_markedCard) { _markedCard.removeAttribute("data-kanban-drop-target"); _markedCard = null; }
            if (_markedEnd)  { el.removeAttribute("data-kanban-drop-at-end"); _markedEnd = false; }
        }
        function paintIndicator(clientY) {
            // Compute insertion position the same way the drop handler
            // does, then paint a marker so the user sees WHERE the card
            // will land. This is the sortable-style drop indicator.
            const positions = [];
            for (const [cardEl, entry] of _cardAttached) {
                const c = getCard(entry.cardId);
                if (!c || c.columnId !== colId) continue;
                if (!el.contains(cardEl)) continue;
                const rect = cardEl.getBoundingClientRect();
                positions.push({ el: cardEl, mid: rect.top + rect.height / 2 });
            }
            positions.sort((a, b) => a.mid - b.mid);
            let targetEl = null;
            for (let i = 0; i < positions.length; i++) {
                if (clientY < positions[i].mid) { targetEl = positions[i].el; break; }
            }
            // Already-marked? Avoid attribute thrash.
            if (targetEl === _markedCard && (targetEl !== null || _markedEnd === (positions.length > 0))) {
                if (targetEl !== null) return;
                if (_markedEnd) return;
            }
            // Clear previous and paint new.
            if (_markedCard && _markedCard !== targetEl) {
                _markedCard.removeAttribute("data-kanban-drop-target");
                _markedCard = null;
            }
            if (targetEl) {
                if (_markedEnd) { el.removeAttribute("data-kanban-drop-at-end"); _markedEnd = false; }
                targetEl.setAttribute("data-kanban-drop-target", "");
                _markedCard = targetEl;
            } else if (positions.length > 0) {
                // Drop would land at the end of the column.
                if (!_markedEnd) { el.setAttribute("data-kanban-drop-at-end", ""); _markedEnd = true; }
            } else {
                // Empty column -- mark the column itself.
                if (!_markedEnd) { el.setAttribute("data-kanban-drop-at-end", ""); _markedEnd = true; }
            }
        }
        const onDragEnter = (ev) => {
            ev.preventDefault();
            toggleAttr(el, "data-kanban-drop-active", true);
        };
        const onDragOver = (ev) => {
            // preventDefault is REQUIRED to allow the drop event to fire.
            ev.preventDefault();
            if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
            paintIndicator(ev.clientY);
        };
        const onDragLeave = (ev) => {
            // dragleave fires when entering child elements too; check
            // relatedTarget to confirm we actually left the container.
            if (!el.contains(ev.relatedTarget)) {
                toggleAttr(el, "data-kanban-drop-active", false);
                clearIndicator();
            }
        };
        const onDrop = (ev) => {
            ev.preventDefault();
            toggleAttr(el, "data-kanban-drop-active", false);
            clearIndicator();
            const cardId = ev.dataTransfer && ev.dataTransfer.getData("text/x-kanban-card-id");
            if (!cardId) return;
            // Compute target index from pointer y vs card midpoints.
            const targetIdx = _dropIndexFromPointer(el, colId, ev.clientY);
            moveCard(cardId, colId, targetIdx, "drop");
        };
        el.addEventListener("dragenter", onDragEnter);
        el.addEventListener("dragover",  onDragOver);
        el.addEventListener("dragleave", onDragLeave);
        el.addEventListener("drop",      onDrop);
        const off = () => {
            el.removeEventListener("dragenter", onDragEnter);
            el.removeEventListener("dragover",  onDragOver);
            el.removeEventListener("dragleave", onDragLeave);
            el.removeEventListener("drop",      onDrop);
            el.removeAttribute("data-kanban-drop-active");
            clearIndicator();
        };
        addCleanup(off);
        return off;
    }

    function _dropIndexFromPointer(columnEl, colId, clientY) {
        // Find card elements in this column from our registry whose DOM
        // parents are this column container.
        const order = _columnOrder.get(colId) || [];
        if (order.length === 0) return 0;
        // Walk registered card elements; collect those inside columnEl.
        const positions = [];
        for (const [el, entry] of _cardAttached) {
            const c = getCard(entry.cardId);
            if (!c || c.columnId !== colId) continue;
            if (!columnEl.contains(el)) continue;
            const rect = el.getBoundingClientRect();
            positions.push({ id: entry.cardId, mid: rect.top + rect.height / 2 });
        }
        positions.sort((a, b) => a.mid - b.mid);
        for (let i = 0; i < positions.length; i++) {
            if (clientY < positions[i].mid) return i;
        }
        return positions.length;
    }

    // Helper for consumers to wire a card as HTML5-draggable.
    function attachDraggable(cardEl, cardId) {
        if (!cardEl || cardId == null) return noop;
        cardEl.setAttribute("draggable", "true");
        const onDragStart = (ev) => {
            if (ev.dataTransfer) {
                ev.dataTransfer.setData("text/x-kanban-card-id", String(cardId));
                ev.dataTransfer.effectAllowed = "move";
            }
            toggleAttr(cardEl, "data-kanban-card-dragging", true);
        };
        const onDragEnd = () => {
            toggleAttr(cardEl, "data-kanban-card-dragging", false);
        };
        cardEl.addEventListener("dragstart", onDragStart);
        cardEl.addEventListener("dragend",   onDragEnd);
        const off = () => {
            cardEl.removeEventListener("dragstart", onDragStart);
            cardEl.removeEventListener("dragend",   onDragEnd);
            cardEl.removeAttribute("draggable");
            cardEl.removeAttribute("data-kanban-card-dragging");
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
        _columnAttached.clear();
        _cardAttached.clear();
        _columnOrder.clear();
        _columnOrderSig.clear();
    }

    return {
        // reactive
        columns, cards,
        cardsInColumn,
        cardsInColumnReactive,
        // queries
        getCard, getColumn,
        // mutations
        addColumn, removeColumn,
        addCard, removeCard, updateCard,
        moveCard,
        // attach
        attachColumn, attachCard, attachHandle,
        attachDropZone, attachDraggable,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
        // introspection (tests)
        _columnAttached: () => _columnAttached,
        _cardAttached: () => _cardAttached,
        _columnOrder: () => _columnOrder,
    };
}
