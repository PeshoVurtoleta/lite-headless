// test-browser/split-panels.spec.js
//
// Real-browser specs for createSplitPanels. happy-dom verifies the math +
// state machine (23 unit tests); these specs verify the pieces that only
// work with real layout: pointer drag against a real-rect container,
// grid-template-columns updating from the CSS custom properties, focus +
// keyboard nav, and pointer capture.

import { test, expect } from "@playwright/test";

test.describe("split-panels", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/test-browser/fixtures/split-panels.html");
        await page.waitForFunction(() => window.__splitReady === true);
        await page.waitForTimeout(50);
    });

    test("initial CSS custom properties written to container", async ({ page }) => {
        const props = await page.evaluate(() => {
            const c = document.getElementById("split-h");
            return {
                p0: c.style.getPropertyValue("--lh-panel-0-pct"),
                p1: c.style.getPropertyValue("--lh-panel-1-pct"),
                p2: c.style.getPropertyValue("--lh-panel-2-pct"),
                orientation: c.getAttribute("data-orientation"),
            };
        });
        expect(parseFloat(props.p0)).toBeCloseTo(25, 2);
        expect(parseFloat(props.p1)).toBeCloseTo(50, 2);
        expect(parseFloat(props.p2)).toBeCloseTo(25, 2);
        expect(props.orientation).toBe("horizontal");
    });

    test("CSS grid track widths follow the custom properties", async ({ page }) => {
        // The container is 800px wide, gaps are 6px each (2 handles = 12px).
        // 788 / 100 * 25 = 197 -> panel 0 should be ~197px wide.
        const widths = await page.$$eval("#split-h > .panel", els =>
            els.map(e => Math.round(e.getBoundingClientRect().width))
        );
        // ~197 / ~394 / ~197 with a few px of rounding
        expect(widths[0]).toBeGreaterThanOrEqual(190);
        expect(widths[0]).toBeLessThanOrEqual(205);
        expect(widths[1]).toBeGreaterThanOrEqual(385);
        expect(widths[1]).toBeLessThanOrEqual(400);
    });

    test("drag handle 0 right by ~100px moves the layout", async ({ page }) => {
        const startPanels = await page.evaluate(() => document.getElementById("split-h").layout.slice());
        const handleRect = await page.$eval("#split-h > .handle", el => {
            const r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        await page.mouse.move(handleRect.x, handleRect.y);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) {
            await page.mouse.move(handleRect.x + i * 10, handleRect.y);
        }
        await page.mouse.up();
        await page.waitForTimeout(50);

        const endPanels = await page.evaluate(() => document.getElementById("split-h").layout.slice());
        // +100px on an 800px-wide container is +12.5%, all of which goes
        // from panel 1 to panel 0.
        expect(endPanels[0]).toBeCloseTo(startPanels[0] + 12.5, 1);
        expect(endPanels[1]).toBeCloseTo(startPanels[1] - 12.5, 1);
        expect(endPanels[2]).toBeCloseTo(startPanels[2], 2);
    });

    test("data-resizing on container during drag, removed on release", async ({ page }) => {
        const handle = await page.$("#split-h > .handle");
        const r = await handle.boundingBox();

        await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
        await page.mouse.down();
        // Check during drag
        const duringResizing = await page.$eval("#split-h", el => el.hasAttribute("data-resizing"));
        const duringDragging = await page.$eval("#split-h > .handle", el => el.hasAttribute("data-dragging"));
        expect(duringResizing).toBe(true);
        expect(duringDragging).toBe(true);
        await page.mouse.up();
        await page.waitForTimeout(50);

        const afterResizing = await page.$eval("#split-h", el => el.hasAttribute("data-resizing"));
        const afterDragging = await page.$eval("#split-h > .handle", el => el.hasAttribute("data-dragging"));
        expect(afterResizing).toBe(false);
        expect(afterDragging).toBe(false);
    });

    test("keyboard ArrowRight on focused handle increments left panel", async ({ page }) => {
        await page.$eval("#split-h > .handle", el => el.focus());
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(30);
        const layout = await page.evaluate(() => document.getElementById("split-h").layout.slice());
        expect(layout[0]).toBeCloseTo(30, 2);   // 25 + 5
        expect(layout[1]).toBeCloseTo(45, 2);   // 50 - 5
    });

    test("collapsible panel snaps to 0 when dragged past threshold", async ({ page }) => {
        // panel 0 has min:10 and collapsible. snapThreshold:0.5 -> snap
        // happens when proposed size < 5%.
        const handleRect = await page.$eval("#split-h > .handle", el => {
            const r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        await page.mouse.move(handleRect.x, handleRect.y);
        await page.mouse.down();
        // Drag far left (panel 0 currently 25%, container 800px = 200px).
        // Moving handle left 200px puts panel 0 at 0%.
        await page.mouse.move(handleRect.x - 200, handleRect.y);
        await page.mouse.up();
        await page.waitForTimeout(50);
        const layout = await page.evaluate(() => document.getElementById("split-h").layout.slice());
        expect(layout[0]).toBe(0);
    });

    test("vertical orientation uses ArrowUp/Down for keyboard", async ({ page }) => {
        await page.$eval("#split-v > .handle", el => el.focus());
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(30);
        const layout = await page.evaluate(() => document.getElementById("split-v").layout.slice());
        // panel 0 started at 60, ArrowDown adds 5
        expect(layout[0]).toBeCloseTo(65, 2);
        expect(layout[1]).toBeCloseTo(35, 2);
    });

    test("MutationObserver picks up dynamically appended panel", async ({ page }) => {
        const initialLen = await page.evaluate(() => document.getElementById("split-h").layout.length);
        expect(initialLen).toBe(3);

        await page.evaluate(() => {
            const c = document.getElementById("split-h");
            const h = document.createElement("div");
            h.className = "handle"; h.setAttribute("data-handle", "");
            const p = document.createElement("div");
            p.className = "panel"; p.setAttribute("data-panel", "");
            p.textContent = "Dynamically added";
            c.appendChild(h);
            c.appendChild(p);
        });
        await page.waitForTimeout(80);   // observer microtask + reconcile
        const newLen = await page.evaluate(() => document.getElementById("split-h").layout.length);
        expect(newLen).toBe(4);
    });

    test("layoutchange CustomEvent dispatched on drag", async ({ page }) => {
        await page.evaluate(() => {
            window.__layoutChanges = [];
            document.getElementById("split-h").addEventListener("layoutchange", (e) => {
                window.__layoutChanges.push({ reason: e.detail.reason, layout: e.detail.layout.slice() });
            });
        });
        const handleRect = await page.$eval("#split-h > .handle", el => {
            const r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        await page.mouse.move(handleRect.x, handleRect.y);
        await page.mouse.down();
        await page.mouse.move(handleRect.x + 30, handleRect.y);
        await page.mouse.up();
        await page.waitForTimeout(50);
        const changes = await page.evaluate(() => window.__layoutChanges);
        expect(changes.length).toBeGreaterThan(0);
        expect(changes[changes.length - 1].reason).toBe("drag");
    });
});
