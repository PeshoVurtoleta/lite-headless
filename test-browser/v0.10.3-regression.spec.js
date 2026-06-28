// Regression specs for the two v0.10.3 bug fixes.
//
//   1. drawer/element.js: followQueue keeps the role observer's
//      `follow(node)` calls made during the synchronous initial pass
//      from being dropped (the `roles` variable is undefined at that
//      point).
//
//   2. kanban/element.js: when a card is reparented in the DOM by some
//      path OTHER than moveCard() (manual DOM edit, framework re-
//      render, third-party DnD), the wrapper now calls kb.moveCard
//      with reason "dom-sync" so the engine catches up.

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

async function mountWrapper(page, name, html) {
    await page.goto(BASE + "/test-browser/fixtures/blank.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(async (path) => { await import(path); }, "/src/" + name + "/element.js");
    await page.evaluate((markup) => { document.body.insertAdjacentHTML("beforeend", markup); }, html);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
}

// ──────────────────────────────────────────────────────────────────────
// Bug 1: drawer roles.follow closure trap
// ──────────────────────────────────────────────────────────────────────

test.describe("drawer follow-queue", () => {
    test("close button injected AFTER mount + open still works", async ({ page }) => {
        await mountWrapper(page, "drawer", `
            <lite-drawer side="right">
                <button data-drawer-trigger>Open</button>
                <aside data-drawer-content>
                    <h2 data-drawer-title>Filters</h2>
                </aside>
            </lite-drawer>
        `);
        // Open the drawer FIRST. Content portals to document.body.
        await page.click("[data-drawer-trigger]");
        await page.waitForTimeout(50);

        // NOW inject a close button into the portaled content. The role
        // observer must be following the portaled element for this to
        // be discovered.
        await page.evaluate(() => {
            const content = document.querySelector("[data-drawer-content]");
            const btn = document.createElement("button");
            btn.setAttribute("data-drawer-close", "");
            btn.id = "late-close";
            btn.textContent = "x";
            content.appendChild(btn);
        });
        await page.waitForTimeout(80);

        // Click the late-injected close button. If follow() was dropped
        // during the initial pass, this button is silently un-wired and
        // the drawer stays open.
        await page.click("#late-close");
        await page.waitForTimeout(50);
        const open = await page.locator("lite-drawer").getAttribute("open");
        expect(open).toBeNull();   // drawer is closed
    });

    test("title injected AFTER portal updates aria-labelledby", async ({ page }) => {
        await mountWrapper(page, "drawer", `
            <lite-drawer side="right">
                <button data-drawer-trigger>Open</button>
                <aside data-drawer-content>
                    <p>Body</p>
                </aside>
            </lite-drawer>
        `);
        await page.click("[data-drawer-trigger]");
        await page.waitForTimeout(50);
        await page.evaluate(() => {
            const content = document.querySelector("[data-drawer-content]");
            const h = document.createElement("h2");
            h.setAttribute("data-drawer-title", "");
            h.textContent = "Late Title";
            content.prepend(h);
        });
        await page.waitForTimeout(80);
        const labelledBy = await page.evaluate(() => {
            const c = document.querySelector("[data-drawer-content]");
            return c ? c.getAttribute("aria-labelledby") : null;
        });
        expect(labelledBy).not.toBeNull();
    });
});

// ──────────────────────────────────────────────────────────────────────
// Bug 2: kanban DOM-movement desync
// ──────────────────────────────────────────────────────────────────────

test.describe("kanban dom-sync reconcile", () => {
    test("manually reparenting a card updates engine columnId", async ({ page }) => {
        await mountWrapper(page, "kanban", `
            <lite-kanban id="kb-test">
                <div data-kanban-column="todo">
                    <div data-kanban-cards>
                        <div data-kanban-card-id="c1">A</div>
                    </div>
                </div>
                <div data-kanban-column="done">
                    <div data-kanban-cards></div>
                </div>
            </lite-kanban>
        `);
        await page.waitForTimeout(50);

        // Engine snapshot: c1 is in todo.
        const before = await page.evaluate(() => {
            const kb = document.getElementById("kb-test")._kanbanInstance;
            return kb.getCard("c1").columnId;
        });
        expect(before).toBe("todo");

        // Externally reparent c1 from todo to done -- bypassing moveCard.
        await page.evaluate(() => {
            const card = document.querySelector('[data-kanban-card-id="c1"]');
            const done = document.querySelector('[data-kanban-column="done"] [data-kanban-cards]');
            done.appendChild(card);
        });
        await page.waitForTimeout(80);    // MO + syncMarkup tick

        // Engine should now reflect the move via dom-sync reconcile.
        const after = await page.evaluate(() => {
            const kb = document.getElementById("kb-test")._kanbanInstance;
            return kb.getCard("c1").columnId;
        });
        expect(after).toBe("done");
    });

    test("dom-sync does NOT trigger a second reparent (idempotent)", async ({ page }) => {
        await mountWrapper(page, "kanban", `
            <lite-kanban id="kb-test2">
                <div data-kanban-column="todo">
                    <div data-kanban-cards>
                        <div data-kanban-card-id="c1">A</div>
                        <div data-kanban-card-id="c2">B</div>
                    </div>
                </div>
                <div data-kanban-column="done">
                    <div data-kanban-cards></div>
                </div>
            </lite-kanban>
        `);
        await page.waitForTimeout(50);

        // Listen for cardmove events. Should fire exactly once for the
        // single external reparent (with reason "dom-sync"), not echo
        // back to itself.
        const moves = await page.evaluate(() => {
            const moves = [];
            const host = document.getElementById("kb-test2");
            host.addEventListener("cardmove", (e) => moves.push(e.detail));
            const card = document.querySelector('[data-kanban-card-id="c1"]');
            const done = document.querySelector('[data-kanban-column="done"] [data-kanban-cards]');
            done.appendChild(card);
            return new Promise(resolve => setTimeout(() => resolve(moves), 100));
        });
        expect(moves.length).toBe(1);
        expect(moves[0].cardId).toBe("c1");
        expect(moves[0].toColumnId).toBe("done");
        expect(moves[0].reason).toBe("dom-sync");
    });
});
