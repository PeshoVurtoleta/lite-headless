// @zakkster/lite-headless / kanban / element.js
//
// <lite-kanban> wrapping createKanban.
//
//   <lite-kanban>
//       <div data-kanban-column="todo" data-kanban-column-title="To Do">
//           <div data-kanban-card-id="c1">Card 1</div>
//           <div data-kanban-card-id="c2">Card 2</div>
//       </div>
//       <div data-kanban-column="doing" data-kanban-column-title="In Progress">
//           <div data-kanban-card-id="c3">Card 3</div>
//       </div>
//   </lite-kanban>
//
// The wrapper discovers columns + cards automatically from the markup.
// On mount it builds the data model from data-* attributes; subsequent
// MO callbacks detect added/removed cards and pipe them through the
// primitive's add/removeCard.
//
// Imperative API on host:
//   host.columns                          -- accessor: ColumnDef[]
//   host.cards                            -- accessor: CardDef[]
//   host.cardsInColumn(colId)             -- query
//   host.getCard(id) / .getColumn(id)
//   host.moveCard(cardId, toColumnId, toIndex, reason?)
//   host.addCard(card) / .removeCard(id) / .updateCard(id, partial)
//   host.addColumn(col) / .removeColumn(id)
//   host._kanbanInstance
//
// Events:
//   cardmove    { detail: { cardId, fromColumnId, toColumnId, newIndex, reason } }
//   cardclick   { detail: { cardId } }

import { define } from "@zakkster/lite-element";
import { createKanban } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQueryAll(host, selector) {
    const all = host.querySelectorAll(selector);
    const out = [];
    for (let i = 0; i < all.length; i++) {
        if (belongsToHost(all[i], host)) out.push(all[i]);
    }
    return out;
}

define("lite-kanban", (host, scope) => {
    const enableHtml5Dnd = host.hasAttribute("html5-dnd");
    // The wrapper auto-reparents card elements when the primitive's
    // state moves them between columns. This is what makes drag-and-
    // drop "just work" for consumers who place cards declaratively.
    // Set the `unmanaged-dom` attribute to opt out (your own render
    // path owns DOM reparenting).
    const managedDom = !host.hasAttribute("unmanaged-dom");

    // Track attached column + card elements so we can detach properly on
    // DOM removal. Declared up front so the onCardMove callback can use
    // them to find the target column container.
    const _colAttached = new Map();    // colId -> { el, off, body }
    const _cardAttached = new Map();   // cardId -> { el, off, dndOff }

    function reparentCardForMove(cardId, toColumnId, newIndex) {
        if (!managedDom) return;
        const cardEntry = _cardAttached.get(cardId);
        if (!cardEntry || !cardEntry.el) return;
        const colEntry = _colAttached.get(toColumnId);
        if (!colEntry || !colEntry.el) return;
        // Pick a sensible "card container" inside the column: the first
        // child element that already holds cards, else the column root.
        // This keeps user header markup (titles, counts) intact while
        // still moving the card to the right list area.
        let container = colEntry.body || colEntry.el;
        // Find all peer card elements currently in this container; we
        // place the moved card relative to them by index.
        // belongsToHost guard: without it, a nested <lite-kanban> inside
        // a card template would have its sub-task cards counted as
        // peers of the parent column, corrupting clampedIdx and
        // moving cards into the wrong slot. The rest of the file
        // already uses this pattern (lines 143, 173); add it here too.
        const cardEl = cardEntry.el;
        const peers = [];
        const all = container.querySelectorAll("[data-kanban-card-id]");
        for (let i = 0; i < all.length; i++) {
            if (!belongsToHost(all[i], host)) continue;
            if (all[i] === cardEl) continue;
            peers.push(all[i]);
        }
        const clampedIdx = Math.max(0, Math.min(newIndex == null ? peers.length : newIndex, peers.length));
        // insertBefore is the native primitive; clampedIdx === peers.length
        // means append.
        const refNode = peers[clampedIdx] || null;
        if (cardEl.parentNode === container && cardEl.nextSibling === refNode) return;
        container.insertBefore(cardEl, refNode);
    }

    const kb = createKanban({
        // When html5-dnd is enabled, skip the per-card sortable
        // attachment. Sortable's pointerdown handler calls
        // preventDefault() which suppresses text selection BUT also
        // blocks the browser from initiating a native HTML5 drag.
        // Without disabling sortable, cross-column drag silently
        // fails because dragstart never fires. The HTML5 drop handler
        // (attachDropZone) already computes within-column target
        // index from pointer Y, so we lose no functionality.
        inColumnSortable: !enableHtml5Dnd,
        onCardMove: (cardId, fromColumnId, toColumnId, newIndex, reason) => {
            // Reparent FIRST so DOM matches state by the time consumers
            // hear the event. Skip when the engine is catching up to a
            // DOM change that has already happened (reason === "dom-sync")
            // -- the card is already in its new column container.
            if (reason !== "dom-sync") {
                reparentCardForMove(cardId, toColumnId, newIndex);
            }
            host.dispatchEvent(new CustomEvent("cardmove", {
                detail: { cardId, fromColumnId, toColumnId, newIndex, reason },
                bubbles: true,
            }));
        },
        onCardClick: (cardId) => {
            host.dispatchEvent(new CustomEvent("cardclick", {
                detail: { cardId }, bubbles: true,
            }));
        },
    });

    function syncMarkup() {
        // Columns
        const colEls = scopedQueryAll(host, "[data-kanban-column]");
        const seenCols = new Set();
        for (let i = 0; i < colEls.length; i++) {
            const el = colEls[i];
            const colId = el.getAttribute("data-kanban-column");
            if (!colId) continue;
            seenCols.add(colId);
            if (_colAttached.has(colId)) {
                if (_colAttached.get(colId).el !== el) {
                    // Element identity changed for this columnId; re-attach.
                    _colAttached.get(colId).off();
                    _colAttached.delete(colId);
                } else continue;
            }
            // Register column in the data model.
            if (!kb.getColumn(colId)) {
                kb.addColumn({
                    id: colId,
                    title: el.getAttribute("data-kanban-column-title") || colId,
                });
            }
            const off = kb.attachColumn(el, colId);
            // Find the card-body container inside the column. The
            // wrapper convention is `[data-kanban-cards]`; if absent,
            // fall back to the column root (cards live as direct
            // children). Body is used for managed-DOM reparenting; the
            // drop zone always binds to the column root so drops on
            // chrome (header, padding) still register.
            let body = null;
            const inner = el.querySelector("[data-kanban-cards]");
            if (inner && belongsToHost(inner, host)) body = inner;
            // Optional HTML5 DnD drop-zone wiring on the column root.
            let dndOff = null;
            if (enableHtml5Dnd) {
                dndOff = kb.attachDropZone(el, colId);
            }
            _colAttached.set(colId, {
                el,
                body,
                off: () => { if (dndOff) dndOff(); off(); },
            });
        }
        // Detach removed columns.
        for (const [colId, entry] of _colAttached) {
            if (!seenCols.has(colId)) {
                entry.off();
                _colAttached.delete(colId);
            }
        }

        // Cards. Each card must be a descendant of its column container.
        const cardEls = scopedQueryAll(host, "[data-kanban-card-id]");
        const seenCards = new Set();
        for (let i = 0; i < cardEls.length; i++) {
            const el = cardEls[i];
            const cardId = el.getAttribute("data-kanban-card-id");
            if (!cardId) continue;
            seenCards.add(cardId);
            // Determine the column from the closest ancestor.
            const colEl = el.closest("[data-kanban-column]");
            if (!colEl || !belongsToHost(colEl, host)) continue;
            const colId = colEl.getAttribute("data-kanban-column");
            if (!colId) continue;

            // Reconcile data model with DOM. Three cases:
            //
            //   (a) New card we haven't seen -> addCard.
            //   (b) Known card whose DOM column matches engine state
            //       -> nothing to sync; identity check below skips re-attach.
            //   (c) Known card whose DOM column DIFFERS from engine state
            //       -> the card was reparented by something other than our
            //          managed moveCard path (manual DOM edit, framework
            //          re-render, third-party DnD). The engine doesn't know
            //          about it. Tell it now via moveCard with reason
            //          "dom-sync". The wrapper's onCardMove handler checks
            //          this reason and SKIPS its reparent step, because
            //          the DOM is already where it needs to be.
            const knownCard = kb.getCard(cardId);
            if (!knownCard) {
                kb.addCard({
                    id: cardId,
                    columnId: colId,
                    title: el.getAttribute("data-kanban-card-title") || "",
                });
            } else if (knownCard.columnId !== colId) {
                // Append to the target column. Engine order will reflect
                // append-order; if the consumer needs DOM order to be the
                // source of truth, they should rebuild via setCards or
                // remove-then-add. For most uses, append-then-render works
                // since the consumer drives the DOM layout anyway.
                kb.moveCard(cardId, colId, undefined, "dom-sync");
            }

            const prev = _cardAttached.get(cardId);
            if (prev) {
                if (prev.el === el) continue;
                prev.off();
                _cardAttached.delete(cardId);
            }
            const off = kb.attachCard(el, cardId);
            let dndOff = null;
            if (enableHtml5Dnd) {
                dndOff = kb.attachDraggable(el, cardId);
            }
            _cardAttached.set(cardId, {
                el,
                off: () => { if (dndOff) dndOff(); off(); },
            });
        }
        // Detach removed cards.
        for (const [cardId, entry] of _cardAttached) {
            if (!seenCards.has(cardId)) {
                entry.off();
                kb.removeCard(cardId);
                _cardAttached.delete(cardId);
            }
        }
    }
    syncMarkup();

    const mo = new MutationObserver(syncMarkup);
    mo.observe(host, { childList: true, subtree: true });

    // Imperative surface
    host._kanbanInstance = kb;
    host.cardsInColumn = (id) => kb.cardsInColumn(id);
    host.getCard       = (id) => kb.getCard(id);
    host.getColumn     = (id) => kb.getColumn(id);
    host.moveCard      = (cardId, toCol, toIdx, reason) => kb.moveCard(cardId, toCol, toIdx, reason);
    host.addCard       = (card) => kb.addCard(card);
    host.removeCard    = (id) => kb.removeCard(id);
    host.updateCard    = (id, p) => kb.updateCard(id, p);
    host.addColumn     = (col) => kb.addColumn(col);
    host.removeColumn  = (id) => kb.removeColumn(id);
    Object.defineProperty(host, "columns", { get: () => kb.columns(), configurable: true });
    Object.defineProperty(host, "cards",   { get: () => kb.cards(),   configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        for (const entry of _cardAttached.values()) { try { entry.off(); } catch {} }
        for (const entry of _colAttached.values())  { try { entry.off(); } catch {} }
        _cardAttached.clear();
        _colAttached.clear();
        kb.destroy();
    });
});
