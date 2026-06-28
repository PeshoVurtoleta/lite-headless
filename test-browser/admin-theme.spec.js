// Browser specs for v0.8.0 admin-theme primitives: calendar, kanban,
// notification-center. Each test mounts a real wrapper element, drives
// it via host API, and asserts painted attrs + emitted events.

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

async function mountWrapper(page, name, html) {
    await page.goto(BASE + "/test-browser/fixtures/blank.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(async (path) => {
        await import(path);
    }, "/src/" + name + "/element.js");
    await page.evaluate((markup) => {
        document.body.insertAdjacentHTML("beforeend", markup);
    }, html);
    // Let the custom element constructor + MO callback settle.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
}

// ===================== CALENDAR ============================

test.describe("calendar", () => {
    test("renders + auto-attaches discovered day cells", async ({ page }) => {
        await mountWrapper(page, "calendar", `
            <lite-calendar view="2026-06-01">
                <button data-cal-prev>Prev</button>
                <span data-cal-label></span>
                <button data-cal-next>Next</button>
                <div data-cal-grid>
                    <button data-cal-day data-date="2026-6-1">1</button>
                    <button data-cal-day data-date="2026-6-15">15</button>
                </div>
            </lite-calendar>
        `);
        const labelText = await page.locator("lite-calendar [data-cal-label]").textContent();
        expect(labelText).toContain("2026");
        const day1Role = await page.locator('[data-date="2026-6-1"]').getAttribute("role");
        expect(day1Role).toBe("gridcell");
    });

    test("prev / next navigation updates the visible month", async ({ page }) => {
        await mountWrapper(page, "calendar", `
            <lite-calendar view="2026-06-01">
                <button data-cal-prev>Prev</button>
                <span data-cal-label></span>
                <button data-cal-next>Next</button>
                <div data-cal-grid></div>
            </lite-calendar>
        `);
        await page.click('lite-calendar [data-cal-next]');
        const next = await page.locator('lite-calendar [data-cal-label]').textContent();
        expect(next).toContain("July");
        await page.click('lite-calendar [data-cal-prev]');
        await page.click('lite-calendar [data-cal-prev]');
        const prev = await page.locator('lite-calendar [data-cal-label]').textContent();
        expect(prev).toContain("May");
    });

    test("dispatches dateclick + eventclick custom events", async ({ page }) => {
        await mountWrapper(page, "calendar", `
            <lite-calendar view="2026-06-01">
                <div data-cal-grid>
                    <button data-cal-day data-date="2026-6-15">
                        15
                        <span data-cal-event-id="e1">Meeting</span>
                    </button>
                </div>
            </lite-calendar>
        `);
        await page.evaluate(() => {
            const host = document.querySelector("lite-calendar");
            host.addEvent({ id: "e1", start: new Date(2026, 5, 15), title: "Meeting" });
            window.__events = [];
            host.addEventListener("dateclick",  (e) => window.__events.push(["dateclick",  e.detail.date.getDate()]));
            host.addEventListener("eventclick", (e) => window.__events.push(["eventclick", e.detail.event.id]));
        });
        await page.click('[data-cal-event-id="e1"]');
        const ev = await page.locator('[data-cal-event-id="e1"]');
        expect(await ev.getAttribute("role")).toBe("button");
        const events = await page.evaluate(() => window.__events);
        // Event click stopPropagation => no dateclick.
        expect(events).toEqual([["eventclick", "e1"]]);
    });
});

// ===================== KANBAN ============================

test.describe("kanban", () => {
    test("auto-discovers columns + cards from markup", async ({ page }) => {
        await mountWrapper(page, "kanban", `
            <lite-kanban>
                <div data-kanban-column="todo" data-kanban-column-title="To Do">
                    <div data-kanban-card-id="c1">Buy milk</div>
                    <div data-kanban-card-id="c2">Walk dog</div>
                </div>
                <div data-kanban-column="doing" data-kanban-column-title="Doing">
                    <div data-kanban-card-id="c3">Code review</div>
                </div>
            </lite-kanban>
        `);
        const todoRole = await page.locator('[data-kanban-column-id="todo"]').getAttribute("role");
        expect(todoRole).toBe("listbox");   // sortable's listbox role
        const c1Role = await page.locator('[data-kanban-card-id="c1"]').getAttribute("role");
        expect(c1Role).toBe("option");
        const cards = await page.evaluate(() => document.querySelector("lite-kanban").cards.length);
        expect(cards).toBe(3);
    });

    test("moveCard programmatic API updates column ownership", async ({ page }) => {
        await mountWrapper(page, "kanban", `
            <lite-kanban>
                <div data-kanban-column="a">
                    <div data-kanban-card-id="c1">A1</div>
                </div>
                <div data-kanban-column="b">
                </div>
            </lite-kanban>
        `);
        await page.evaluate(() => {
            const host = document.querySelector("lite-kanban");
            window.__moves = [];
            host.addEventListener("cardmove", (e) => window.__moves.push(e.detail));
            host.moveCard("c1", "b", 0);
        });
        const col = await page.evaluate(() => document.querySelector("lite-kanban").getCard("c1").columnId);
        expect(col).toBe("b");
        const moves = await page.evaluate(() => window.__moves);
        expect(moves.length).toBe(1);
        expect(moves[0].toColumnId).toBe("b");
        expect(moves[0].fromColumnId).toBe("a");
    });

    test("HTML5 DnD drop dispatches cardmove with reason='drop'", async ({ page }) => {
        await mountWrapper(page, "kanban", `
            <lite-kanban html5-dnd>
                <div data-kanban-column="a" style="display:block;width:200px;height:200px;">
                    <div data-kanban-card-id="c1" style="display:block;width:200px;height:50px;">A1</div>
                </div>
                <div data-kanban-column="b" style="display:block;width:200px;height:200px;">
                </div>
            </lite-kanban>
        `);
        const result = await page.evaluate(() => {
            const moves = [];
            const host = document.querySelector("lite-kanban");
            host.addEventListener("cardmove", (e) => moves.push(e.detail));
            const colB = document.querySelector('[data-kanban-column="b"]');
            const dt = new DataTransfer();
            dt.setData("text/x-kanban-card-id", "c1");
            colB.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
            colB.dispatchEvent(new DragEvent("dragover",  { dataTransfer: dt, bubbles: true, clientY: 50 }));
            colB.dispatchEvent(new DragEvent("drop",      { dataTransfer: dt, bubbles: true, clientY: 50 }));
            return { moves, columnOfC1: host.getCard("c1").columnId };
        });
        expect(result.columnOfC1).toBe("b");
        expect(result.moves.length).toBe(1);
        expect(result.moves[0].toColumnId).toBe("b");
        expect(result.moves[0].reason).toBe("drop");
    });
});

// ===================== NOTIFICATION CENTER ============================

test.describe("notification-center", () => {
    test("unread badge reflects unreadCount; click marks read", async ({ page }) => {
        await mountWrapper(page, "notification-center", `
            <lite-notification-center>
                <span data-nc-badge></span>
                <button data-nc-mark-all-read>Mark all read</button>
                <button data-nc-clear-all>Clear all</button>
                <div data-nc-list>
                    <article data-nc-id="n1" data-nc-title="A" data-nc-kind="info" style="display:block;padding:10px;">Notification A</article>
                    <article data-nc-id="n2" data-nc-title="B" data-nc-kind="error" style="display:block;padding:10px;">Notification B</article>
                </div>
            </lite-notification-center>
        `);
        const initialBadge = await page.locator("[data-nc-badge]").textContent();
        expect(initialBadge).toBe("2");
        const unreadAttr = await page.locator('[data-nc-id="n1"]').getAttribute("data-nc-unread");
        expect(unreadAttr).toBe("");
        await page.locator('[data-nc-id="n1"]').click();
        const afterBadge = await page.locator("[data-nc-badge]").textContent();
        expect(afterBadge).toBe("1");
        const readAttr = await page.locator('[data-nc-id="n1"]').getAttribute("data-nc-read");
        expect(readAttr).toBe("");
    });

    test("mark-all-read and clear-all buttons fire correctly", async ({ page }) => {
        await mountWrapper(page, "notification-center", `
            <lite-notification-center>
                <span data-nc-badge></span>
                <button data-nc-mark-all-read>Mark all</button>
                <button data-nc-clear-all>Clear</button>
                <div data-nc-list>
                    <article data-nc-id="n1" data-nc-title="A" style="display:block;padding:10px;">A</article>
                    <article data-nc-id="n2" data-nc-title="B" style="display:block;padding:10px;">B</article>
                </div>
            </lite-notification-center>
        `);
        await page.click("[data-nc-mark-all-read]");
        let count = await page.evaluate(() => document.querySelector("lite-notification-center").unreadCount);
        expect(count).toBe(0);
        await page.click("[data-nc-clear-all]");
        let total = await page.evaluate(() => document.querySelector("lite-notification-center").notifications.length);
        expect(total).toBe(0);
    });
});
