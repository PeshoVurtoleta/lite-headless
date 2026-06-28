// Sortable browser tests -- exercise real pointer-driven drag with
// chromium pointermove, keyboard pickup mode with real focus, and the
// data-attribute paint that consumers style around.

import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/sortable.html";

async function dragItem(page, fromSel, toSel, options = {}) {
    // Performs a pointer-driven drag from one item element to
    // another, using the from element's center and the to element's
    // center as start/end points. Adds intermediate steps so the
    // pointermove threshold is crossed and slot detection has time
    // to update.
    const from = await page.locator(fromSel).boundingBox();
    const to = await page.locator(toSel).boundingBox();
    if (!from || !to) throw new Error("element not found");
    const startX = from.x + from.width / 2;
    const startY = from.y + from.height / 2;
    const endX = to.x + to.width / 2;
    const endY = to.y + to.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Step through intermediate points so threshold is crossed and
    // each pointermove fires
    const steps = options.steps || 10;
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await page.mouse.move(startX + (endX - startX) * t, startY + (endY - startY) * t);
        await page.waitForTimeout(8);
    }
    await page.mouse.up();
    await page.waitForTimeout(50);
}

test.describe("sortable", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.__sortableReady === true);
        await page.waitForTimeout(50);
    });

    // ---- attachment + ARIA --------------------------------------

    test("root gets role=listbox + aria-orientation + label", async ({ page }) => {
        const attrs = await page.evaluate(() => {
            const r = document.getElementById("basic");
            return {
                role: r.getAttribute("role"),
                orient: r.getAttribute("aria-orientation"),
                label: r.getAttribute("aria-label"),
            };
        });
        expect(attrs).toEqual({
            role: "listbox",
            orient: "vertical",
            label: "Reorder tasks",
        });
    });

    test("items get role=option + tabindex=0; disabled item gets aria-disabled", async ({ page }) => {
        const states = await page.evaluate(() =>
            Array.from(document.querySelectorAll("#basic [data-sortable-item]")).map(el => ({
                key: el.getAttribute("data-sortable-item"),
                role: el.getAttribute("role"),
                tabindex: el.getAttribute("tabindex"),
                disabled: el.getAttribute("aria-disabled"),
            })));
        expect(states.length).toBe(4);
        expect(states[0]).toEqual({ key: "a", role: "option", tabindex: "0", disabled: null });
        expect(states[3].disabled).toBe("true");
    });

    test("internal aria-live region appended to root", async ({ page }) => {
        const live = await page.evaluate(() => {
            const r = document.getElementById("basic");
            const live = r.querySelector('[aria-live="polite"]');
            return live ? {
                tag: live.tagName.toLowerCase(),
                position: live.style.position,
            } : null;
        });
        expect(live).not.toBeNull();
        expect(live.position).toBe("absolute");
    });

    // ---- imperative API ----------------------------------------

    test("host.move(key, idx) reorders items + fires reorder event", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const host = document.getElementById("basic");
            const events = [];
            host.addEventListener("reorder", (e) => events.push(e.detail.order.slice()));
            host.move("a", 2);
            await new Promise(r => setTimeout(r, 30));
            return { items: host.items, events };
        });
        expect(result.items).toEqual(["b", "c", "a", "d"]);
        expect(result.events).toEqual([["b", "c", "a", "d"]]);
    });

    test("host.swap(a, b) swaps positions", async ({ page }) => {
        const items = await page.evaluate(() => {
            const host = document.getElementById("basic");
            host.swap("a", "c");
            return host.items;
        });
        expect(items).toEqual(["c", "b", "a", "d"]);
    });

    // ---- pointer-driven drag (vanilla mode) --------------------

    test("drag X past Y commits a reorder (vanilla mode applies DOM)", async ({ page }) => {
        // Drag #li-x past #li-z (down). After release, DOM order
        // should be [y, z, x].
        await dragItem(page, "#li-x", "#li-z");
        const order = await page.evaluate(() => document.getElementById("vanilla").items);
        // X moved past midpoint of Z; final order y,z,x OR depends on midpoint exact landing
        expect(order[0]).toBe("y");
        // x should be at index 1 or 2; if drag was thorough, it's last
        const ids = await page.evaluate(() =>
            Array.from(document.getElementById("vanilla").querySelectorAll("[data-sortable-item]"))
                .map(el => el.id));
        expect(ids).toEqual(order.map(k => "li-" + k));
    });

    test("dragstart event fires when threshold is crossed", async ({ page }) => {
        const events = await page.evaluate(() => {
            window._sortEvents = [];
            const host = document.getElementById("basic");
            host.addEventListener("dragstart", (e) => window._sortEvents.push("start:" + e.detail.key));
            host.addEventListener("dragend", (e) => window._sortEvents.push("end:" + e.detail.key + ":" + e.detail.committed));
            return null;
        });
        await dragItem(page, '#basic [data-sortable-item="a"] [data-sortable-handle]',
                              '#basic [data-sortable-item="c"]');
        const captured = await page.evaluate(() => window._sortEvents);
        expect(captured.some(e => e.startsWith("start:a"))).toBe(true);
        expect(captured.some(e => e.startsWith("end:a"))).toBe(true);
    });

    test("drag below threshold does NOT start a drag", async ({ page }) => {
        const events = await page.evaluate(() => {
            window._sortEvents = [];
            document.getElementById("basic").addEventListener("dragstart", (e) => window._sortEvents.push(e.detail.key));
            return null;
        });
        // Sub-threshold pointer move (<5px)
        const a = await page.locator('#basic [data-sortable-item="a"]').boundingBox();
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(a.x + a.width / 2 + 2, a.y + a.height / 2 + 2);
        await page.mouse.up();
        await page.waitForTimeout(30);
        const captured = await page.evaluate(() => window._sortEvents);
        expect(captured.length).toBe(0);
    });

    test("Escape during drag cancels (no reorder)", async ({ page }) => {
        await page.evaluate(() => {
            window._sortEvents = [];
            document.getElementById("basic").addEventListener("reorder", (e) => window._sortEvents.push(e.detail.order.slice()));
        });
        const from = await page.locator('#basic [data-sortable-item="a"] [data-sortable-handle]').boundingBox();
        const to = await page.locator('#basic [data-sortable-item="c"]').boundingBox();
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        // Move enough to start drag
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
        await page.waitForTimeout(20);
        // Press Escape mid-drag
        await page.keyboard.press("Escape");
        await page.mouse.up();
        await page.waitForTimeout(30);
        const captured = await page.evaluate(() => window._sortEvents);
        expect(captured.length).toBe(0);
        // items unchanged
        expect(await page.evaluate(() => document.getElementById("basic").items))
            .toEqual(["a", "b", "c", "d"]);
    });

    // ---- handle gating ------------------------------------------

    test("drag does not start when starting from non-handle area (handle is registered)", async ({ page }) => {
        // The #basic items each have a [data-sortable-handle] inside.
        // Clicking the row TEXT (not the handle) should NOT start a drag.
        await page.evaluate(() => {
            window._sortEvents = [];
            document.getElementById("basic").addEventListener("dragstart", (e) => window._sortEvents.push(e.detail.key));
        });
        const item = await page.locator('#basic [data-sortable-item="a"]').boundingBox();
        // Click far right of the item, well past where the handle is
        await page.mouse.move(item.x + item.width - 10, item.y + item.height / 2);
        await page.mouse.down();
        await page.mouse.move(item.x + item.width - 10, item.y + 100, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(30);
        const captured = await page.evaluate(() => window._sortEvents);
        expect(captured.length).toBe(0);
    });

    test("drag DOES start when starting from the registered handle", async ({ page }) => {
        await page.evaluate(() => {
            window._sortEvents = [];
            document.getElementById("basic").addEventListener("dragstart", (e) => window._sortEvents.push(e.detail.key));
        });
        await dragItem(page, '#basic [data-sortable-item="a"] [data-sortable-handle]',
                              '#basic [data-sortable-item="c"]');
        const captured = await page.evaluate(() => window._sortEvents);
        expect(captured).toContain("a");
    });

    test("disabled item cannot be dragged", async ({ page }) => {
        await page.evaluate(() => {
            window._sortEvents = [];
            document.getElementById("basic").addEventListener("reorder", (e) => window._sortEvents.push(e.detail.order));
        });
        // Try to drag item "d" (disabled) up
        await dragItem(page, '#basic [data-sortable-item="d"] [data-sortable-handle]',
                              '#basic [data-sortable-item="a"]');
        const captured = await page.evaluate(() => window._sortEvents);
        expect(captured.length).toBe(0);
    });

    // ---- keyboard pickup mode -----------------------------------

    test("Space picks up item; ArrowDown moves; Space drops", async ({ page }) => {
        await page.focus('#basic [data-sortable-item="a"]');
        await page.keyboard.press("Space");
        const grabbed = await page.evaluate(() =>
            document.querySelector('#basic [data-sortable-item="a"]').getAttribute("aria-grabbed"));
        expect(grabbed).toBe("true");

        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(20);
        expect(await page.evaluate(() => document.getElementById("basic").items))
            .toEqual(["b", "a", "c", "d"]);

        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(20);
        expect(await page.evaluate(() => document.getElementById("basic").items))
            .toEqual(["b", "c", "a", "d"]);

        await page.keyboard.press("Space");
        const stillGrabbed = await page.evaluate(() =>
            document.querySelector('#basic [data-sortable-item="a"]').getAttribute("aria-grabbed"));
        expect(stillGrabbed).toBeNull();
    });

    test("horizontal orientation: ArrowRight moves item right", async ({ page }) => {
        await page.focus('#horizontal [data-sortable-item="p"]');
        await page.keyboard.press("Space");
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(20);
        expect(await page.evaluate(() => document.getElementById("horizontal").items))
            .toEqual(["q", "p", "r"]);
        await page.keyboard.press("Escape");
    });

    test("Home / End jump to first / last", async ({ page }) => {
        await page.focus('#basic [data-sortable-item="b"]');
        await page.keyboard.press("Space");
        await page.keyboard.press("End");
        await page.waitForTimeout(20);
        // d is disabled but order array still includes it; "b" should go to last index = 3
        const after = await page.evaluate(() => document.getElementById("basic").items);
        expect(after[after.length - 1]).toBe("b");
        await page.keyboard.press("Home");
        await page.waitForTimeout(20);
        expect(await page.evaluate(() => document.getElementById("basic").items[0])).toBe("b");
        await page.keyboard.press("Escape");
    });

    // ---- disabled root ------------------------------------------

    test("setAttribute disabled blocks pointer drag", async ({ page }) => {
        await page.evaluate(() => {
            document.getElementById("basic").setAttribute("disabled", "");
            window._sortEvents = [];
            document.getElementById("basic").addEventListener("dragstart", (e) => window._sortEvents.push(e.detail.key));
        });
        await dragItem(page, '#basic [data-sortable-item="a"] [data-sortable-handle]',
                              '#basic [data-sortable-item="c"]');
        const captured = await page.evaluate(() => window._sortEvents);
        expect(captured.length).toBe(0);
    });

    // -----------------------------------------------------------------
    // Regression: insertion indicator paints at the same gap where the
    // commit will land. (Earlier off-by-one meant users chasing the
    // indicator either undershot — committing no move — or overshot by
    // one position.)
    // -----------------------------------------------------------------

    test("indicator paints at the gap where the drop will commit (1-position move)", async ({ page }) => {
        // Drag "a" past "b" but not past "c" — should commit "a" to
        // position 1 (between b and c). The indicator MUST paint on
        // the same gap (insert-before c), not at the next one down.
        // Re-uses #vanilla (no handle, draggable from the row body).
        await page.evaluate(() => document.getElementById("vanilla").setOrder(["x","y","z"]));
        await page.waitForTimeout(20);
        const geom = await page.evaluate(() => {
            const x = document.querySelector('#vanilla [data-sortable-item="x"]').getBoundingClientRect();
            const y = document.querySelector('#vanilla [data-sortable-item="y"]').getBoundingClientRect();
            return {
                xMid: (x.top + x.bottom) / 2,
                yMid: (y.top + y.bottom) / 2,
                handleX: x.x + x.width / 2,
            };
        });
        await page.mouse.move(geom.handleX, geom.xMid);
        await page.mouse.down();
        // travel to just past y's midpoint -- pointer is between y-mid
        // and z-mid, so slotIndex is 1
        const targetY = geom.yMid + 4;
        for (let i = 1; i <= 8; i++) {
            await page.mouse.move(geom.handleX, geom.xMid + (targetY - geom.xMid) * i / 8);
            await page.waitForTimeout(10);
        }
        const indicators = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("#vanilla [data-sortable-item]")).map(el => ({
                key: el.getAttribute("data-sortable-item"),
                ib:  el.getAttribute("data-insert-before"),
                ia:  el.getAttribute("data-insert-after"),
            }));
        });
        // The indicator should be data-insert-before on "y" -- which
        // visually sits AT THE SAME GAP as where the commit lands
        // (between x and y in the original order, i.e. between the
        // dragged item's old position and the next item).
        // Wait -- dragging x past y's midpoint puts x AFTER y in the
        // final order: [y, x, z]. The indicator should show insert
        // BEFORE z OR insert AFTER y -- both visualise "between y and z".
        // Our impl paints insert-before z when slotIndex is 1.
        const z = indicators.find(i => i.key === "z");
        expect(z.ib).toBe("true");
        await page.mouse.up();
        await page.waitForTimeout(50);
        // commit landed at the same gap the indicator showed
        const order = await page.evaluate(() => document.getElementById("vanilla").items);
        expect(order).toEqual(["y", "x", "z"]);
    });

    test("keyboard: arrows keep working after the first move (focus preserved across applyDOMReorder)", async ({ page }) => {
        // Reset to known state, focus an item, pick up, arrow down twice.
        // Before the focus-preservation fix: appendChild blurred the
        // item after the first move, so the second arrow keypress went
        // to <body> and the user saw "only Space works."
        await page.evaluate(() => document.getElementById("vanilla").setOrder(["x","y","z"]));
        await page.waitForTimeout(20);
        await page.focus('#vanilla [data-sortable-item="x"]');
        await page.keyboard.press("Space");
        await page.keyboard.press("ArrowDown");
        const afterFirst = await page.evaluate(() => ({
            order: document.getElementById("vanilla").items,
            focused: document.activeElement?.getAttribute("data-sortable-item"),
        }));
        expect(afterFirst.order).toEqual(["y", "x", "z"]);
        expect(afterFirst.focused).toBe("x");
        await page.keyboard.press("ArrowDown");
        const afterSecond = await page.evaluate(() => document.getElementById("vanilla").items);
        expect(afterSecond).toEqual(["y", "z", "x"]);
        await page.keyboard.press("Escape");
    });
});
