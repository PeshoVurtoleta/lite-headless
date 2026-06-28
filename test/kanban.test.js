// kanban.test.js -- createKanban state, mutations, cross-column moves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createKanban } from "../src/kanban/index.js";

function mkEl() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
}

function basicBoard() {
    return createKanban({
        columns: [
            { id: "todo",  title: "To Do" },
            { id: "doing", title: "Doing" },
            { id: "done",  title: "Done" },
        ],
        cards: [
            { id: "c1", columnId: "todo",  title: "Card 1" },
            { id: "c2", columnId: "todo",  title: "Card 2" },
            { id: "c3", columnId: "doing", title: "Card 3" },
            { id: "c4", columnId: "done",  title: "Card 4" },
        ],
    });
}

// =====================================================================
// Construction + data model
// =====================================================================

test("createKanban: empty defaults", () => {
    setupDOM();
    const kb = createKanban();
    assert.deepEqual(kb.columns(), []);
    assert.deepEqual(kb.cards(), []);
    kb.destroy();
    teardownDOM();
});

test("createKanban: seed columns + cards with initial column order", () => {
    setupDOM();
    const kb = basicBoard();
    assert.equal(kb.columns().length, 3);
    assert.equal(kb.cards().length, 4);
    assert.deepEqual(kb.cardsInColumn("todo").map(c => c.id),  ["c1", "c2"]);
    assert.deepEqual(kb.cardsInColumn("doing").map(c => c.id), ["c3"]);
    assert.deepEqual(kb.cardsInColumn("done").map(c => c.id),  ["c4"]);
    kb.destroy();
    teardownDOM();
});

test("getCard / getColumn lookups by id", () => {
    setupDOM();
    const kb = basicBoard();
    assert.equal(kb.getCard("c1").title, "Card 1");
    assert.equal(kb.getCard("nope"), null);
    assert.equal(kb.getColumn("doing").title, "Doing");
    assert.equal(kb.getColumn("nope"), null);
    kb.destroy();
    teardownDOM();
});

// =====================================================================
// Column mutations
// =====================================================================

test("addColumn appends and fires onColumnAdd", () => {
    setupDOM();
    let added = null;
    const kb = createKanban({ onColumnAdd: (id) => { added = id; } });
    kb.addColumn({ id: "todo", title: "To Do" });
    assert.equal(kb.columns().length, 1);
    assert.equal(added, "todo");
    // duplicate id is a no-op
    kb.addColumn({ id: "todo", title: "ignored" });
    assert.equal(kb.columns().length, 1);
    kb.destroy();
    teardownDOM();
});

test("removeColumn removes column + all its cards", () => {
    setupDOM();
    let removed = null;
    const kb = createKanban({
        columns: [{ id: "a", title: "A" }, { id: "b", title: "B" }],
        cards: [
            { id: "c1", columnId: "a", title: "1" },
            { id: "c2", columnId: "a", title: "2" },
            { id: "c3", columnId: "b", title: "3" },
        ],
        onColumnRemove: (id) => { removed = id; },
    });
    kb.removeColumn("a");
    assert.deepEqual(kb.columns().map(c => c.id), ["b"]);
    assert.deepEqual(kb.cards().map(c => c.id), ["c3"]);
    assert.equal(removed, "a");
    kb.destroy();
    teardownDOM();
});

// =====================================================================
// Card mutations
// =====================================================================

test("addCard appends to its column order", () => {
    setupDOM();
    const kb = basicBoard();
    kb.addCard({ id: "c5", columnId: "doing", title: "Card 5" });
    assert.deepEqual(kb.cardsInColumn("doing").map(c => c.id), ["c3", "c5"]);
    kb.destroy();
    teardownDOM();
});

test("addCard with unknown column is rejected", () => {
    setupDOM();
    const kb = basicBoard();
    kb.addCard({ id: "x", columnId: "bogus", title: "X" });
    assert.equal(kb.getCard("x"), null);
    kb.destroy();
    teardownDOM();
});

test("addCard with duplicate id is a no-op", () => {
    setupDOM();
    const kb = basicBoard();
    kb.addCard({ id: "c1", columnId: "doing", title: "Dup" });
    assert.equal(kb.getCard("c1").columnId, "todo");
    kb.destroy();
    teardownDOM();
});

test("removeCard removes from list + order", () => {
    setupDOM();
    const kb = basicBoard();
    kb.removeCard("c1");
    assert.equal(kb.getCard("c1"), null);
    assert.deepEqual(kb.cardsInColumn("todo").map(c => c.id), ["c2"]);
    kb.destroy();
    teardownDOM();
});

test("updateCard merges partial; columnId field is preserved", () => {
    setupDOM();
    const kb = basicBoard();
    kb.updateCard("c1", { title: "New title", columnId: "doing" });
    const c1 = kb.getCard("c1");
    assert.equal(c1.title, "New title");
    assert.equal(c1.columnId, "todo");   // moveCard is the only way to change columnId
    kb.destroy();
    teardownDOM();
});

// =====================================================================
// moveCard (intra-column reorder + cross-column transfer)
// =====================================================================

test("moveCard intra-column reorders within source column", () => {
    setupDOM();
    let moveArgs = null;
    const kb = createKanban({
        columns: [{ id: "a", title: "A" }],
        cards: [
            { id: "c1", columnId: "a", title: "1" },
            { id: "c2", columnId: "a", title: "2" },
            { id: "c3", columnId: "a", title: "3" },
        ],
        onCardMove: (cardId, fromCol, toCol, idx, reason) => {
            moveArgs = { cardId, fromCol, toCol, idx, reason };
        },
    });
    // c1 -> index 2 (end)
    kb.moveCard("c1", "a", 2);
    assert.deepEqual(kb.cardsInColumn("a").map(c => c.id), ["c2", "c3", "c1"]);
    assert.deepEqual(moveArgs, { cardId: "c1", fromCol: "a", toCol: "a", idx: 2, reason: "api" });
    kb.destroy();
    teardownDOM();
});

test("moveCard cross-column transfers ownership", () => {
    setupDOM();
    const kb = basicBoard();
    kb.moveCard("c1", "doing", 0);
    assert.equal(kb.getCard("c1").columnId, "doing");
    assert.deepEqual(kb.cardsInColumn("todo").map(c => c.id), ["c2"]);
    assert.deepEqual(kb.cardsInColumn("doing").map(c => c.id), ["c1", "c3"]);
    kb.destroy();
    teardownDOM();
});

test("moveCard with toIndex > length clamps to end", () => {
    setupDOM();
    const kb = basicBoard();
    kb.moveCard("c1", "done", 999);
    assert.deepEqual(kb.cardsInColumn("done").map(c => c.id), ["c4", "c1"]);
    kb.destroy();
    teardownDOM();
});

test("moveCard with toIndex < 0 clamps to start", () => {
    setupDOM();
    const kb = basicBoard();
    kb.moveCard("c4", "todo", -5);
    assert.deepEqual(kb.cardsInColumn("todo").map(c => c.id), ["c4", "c1", "c2"]);
    kb.destroy();
    teardownDOM();
});

test("moveCard with unknown card or column is a no-op", () => {
    setupDOM();
    const kb = basicBoard();
    kb.moveCard("nope", "todo", 0);
    kb.moveCard("c1", "nope", 0);
    assert.deepEqual(kb.cardsInColumn("todo").map(c => c.id), ["c1", "c2"]);
    kb.destroy();
    teardownDOM();
});

// =====================================================================
// Element attach + paint
// =====================================================================

test("attachColumn sets role + data-kanban-column-id (role inherited from sortable's listbox semantics)", () => {
    setupDOM();
    const kb = basicBoard();
    const el = mkEl();
    kb.attachColumn(el, "todo");
    // sortable sets role=listbox; kanban accepts this because kanban
    // columns are focusable card lists with keyboard pick-up semantics.
    assert.equal(el.getAttribute("role"), "listbox");
    assert.equal(el.getAttribute("data-kanban-column-id"), "todo");
    kb.destroy();
    teardownDOM();
});

test("attachCard sets role + data-kanban-card-id + click handler", () => {
    setupDOM();
    let clicked = null;
    const kb = createKanban({
        columns: [{ id: "a", title: "A" }],
        cards: [{ id: "c1", columnId: "a", title: "1" }],
        onCardClick: (id) => { clicked = id; },
    });
    const colEl = mkEl();
    const cardEl = mkEl();
    kb.attachColumn(colEl, "a");
    kb.attachCard(cardEl, "c1");
    // sortable assigns role=option to its items.
    assert.equal(cardEl.getAttribute("role"), "option");
    assert.equal(cardEl.getAttribute("data-kanban-card-id"), "c1");
    assert.equal(cardEl.getAttribute("tabindex"), "0");
    cardEl.click();
    assert.equal(clicked, "c1");
    kb.destroy();
    teardownDOM();
});

test("attachCard before its column is a no-op", () => {
    setupDOM();
    const kb = basicBoard();
    const el = mkEl();
    const off = kb.attachCard(el, "c1");   // column "todo" not attached yet
    assert.equal(el.hasAttribute("data-kanban-card-id"), false);
    off();   // no-throw
    kb.destroy();
    teardownDOM();
});

test("attachColumn off() detaches", () => {
    setupDOM();
    const kb = basicBoard();
    const el = mkEl();
    const off = kb.attachColumn(el, "todo");
    assert.equal(el.hasAttribute("role"), true);
    off();
    assert.equal(el.hasAttribute("role"), false);
    assert.equal(el.hasAttribute("data-kanban-column-id"), false);
    kb.destroy();
    teardownDOM();
});

// =====================================================================
// HTML5 drag/drop helpers
// =====================================================================

// HTML5 DnD requires a real DataTransfer; happy-dom doesn't ship one.
// These exercise the API contract via the synchronous side-effects we
// can observe (attribute mutations from the dragstart/dragend handlers).
// End-to-end DnD is covered in test-browser/kanban.spec.js.

test("attachDraggable sets draggable=true and toggles dragging attribute", () => {
    setupDOM();
    if (typeof globalThis.DataTransfer === "undefined") {
        // Skip cleanly when the test runtime doesn't expose DataTransfer.
        teardownDOM();
        return;
    }
    const kb = basicBoard();
    const el = mkEl();
    kb.attachDraggable(el, "c1");
    assert.equal(el.getAttribute("draggable"), "true");
    const dt = new DataTransfer();
    el.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true }));
    assert.equal(el.getAttribute("data-kanban-card-dragging"), "");
    el.dispatchEvent(new DragEvent("dragend", { dataTransfer: dt, bubbles: true }));
    assert.equal(el.hasAttribute("data-kanban-card-dragging"), false);
    kb.destroy();
    teardownDOM();
});

test("attachDropZone wires drag listeners (full drop covered in browser tests)", () => {
    setupDOM();
    if (typeof globalThis.DataTransfer === "undefined") {
        teardownDOM();
        return;
    }
    let moved = null;
    const kb = createKanban({
        columns: [{ id: "a", title: "A" }, { id: "b", title: "B" }],
        cards: [{ id: "c1", columnId: "a", title: "1" }],
        onCardMove: (cardId, fromCol, toCol, idx, reason) => {
            moved = { cardId, fromCol, toCol, idx, reason };
        },
    });
    const aEl = mkEl();
    const bEl = mkEl();
    kb.attachColumn(aEl, "a");
    kb.attachColumn(bEl, "b");
    kb.attachDropZone(bEl, "b");
    const dt = new DataTransfer();
    dt.setData("text/x-kanban-card-id", "c1");
    bEl.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, clientY: 0 }));
    bEl.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, clientY: 0 }));
    assert.equal(kb.getCard("c1").columnId, "b");
    assert.equal(moved.cardId, "c1");
    assert.equal(moved.fromCol, "a");
    assert.equal(moved.toCol, "b");
    assert.equal(moved.reason, "drop");
    kb.destroy();
    teardownDOM();
});

// =====================================================================
// Lifecycle
// =====================================================================

test("destroy is idempotent + prevents further mutations", () => {
    setupDOM();
    const kb = basicBoard();
    kb.destroy();
    kb.destroy();
    kb.addCard({ id: "x", columnId: "todo", title: "X" });
    kb.moveCard("c1", "done", 0);
    assert.equal(kb.destroyed, true);
    teardownDOM();
});

test("destroy detaches all attached column + card elements", () => {
    setupDOM();
    const kb = basicBoard();
    const colEl = mkEl();
    const cardEl = mkEl();
    kb.attachColumn(colEl, "todo");
    kb.attachCard(cardEl, "c1");
    kb.destroy();
    assert.equal(colEl.hasAttribute("role"), false);
    assert.equal(cardEl.hasAttribute("data-kanban-card-id"), false);
    teardownDOM();
});
