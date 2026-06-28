// backtop browser specs — real scroll, real visibility paint.

import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/backtop.html";

test.describe("backtop", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.__backtopReady === true);
    });

    test("initial state: button hidden, scrolledY = 0", async ({ page }) => {
        const state = await page.evaluate(() => {
            const btn = document.querySelector("[data-backtop-button]");
            const sc = document.getElementById("scroller");
            return {
                btnHidden: btn.hasAttribute("hidden"),
                btnVisibleAttr: btn.hasAttribute("data-visible"),
                scrollTop: sc.scrollTop,
            };
        });
        expect(state).toEqual({
            btnHidden: true,
            btnVisibleAttr: false,
            scrollTop: 0,
        });
    });

    test("scrolling past threshold paints data-visible + removes hidden", async ({ page }) => {
        await page.evaluate(() => {
            document.getElementById("scroller").scrollTop = 150;
        });
        // Wait for the rAF-throttled paint
        await page.waitForFunction(
            () => document.querySelector("[data-backtop-button]").hasAttribute("data-visible"),
            { timeout: 1000 }
        );
        const state = await page.evaluate(() => {
            const btn = document.querySelector("[data-backtop-button]");
            return {
                hidden: btn.hasAttribute("hidden"),
                visible: btn.hasAttribute("data-visible"),
            };
        });
        expect(state).toEqual({ hidden: false, visible: true });
    });

    test("scrolling back below threshold re-hides", async ({ page }) => {
        // scroll past, then back
        await page.evaluate(() => { document.getElementById("scroller").scrollTop = 200; });
        await page.waitForFunction(
            () => document.querySelector("[data-backtop-button]").hasAttribute("data-visible"),
            { timeout: 1000 }
        );
        await page.evaluate(() => { document.getElementById("scroller").scrollTop = 50; });
        await page.waitForFunction(
            () => document.querySelector("[data-backtop-button]").hasAttribute("hidden"),
            { timeout: 1000 }
        );
        const visible = await page.evaluate(() =>
            document.querySelector("[data-backtop-button]").hasAttribute("data-visible")
        );
        expect(visible).toBe(false);
    });

    test("clicking the button scrolls back to top", async ({ page }) => {
        await page.evaluate(() => { document.getElementById("scroller").scrollTop = 400; });
        await page.waitForFunction(
            () => document.querySelector("[data-backtop-button]").hasAttribute("data-visible"),
            { timeout: 1000 }
        );
        await page.click("[data-backtop-button]");
        // Smooth scroll may take a moment. Poll until done.
        await page.waitForFunction(
            () => document.getElementById("scroller").scrollTop < 10,
            { timeout: 2000 }
        );
        const top = await page.evaluate(() => document.getElementById("scroller").scrollTop);
        expect(top).toBeLessThan(10);
    });

    test("host exposes isVisible + threshold accessors", async ({ page }) => {
        const accessors = await page.evaluate(() => {
            const host = document.getElementById("bt");
            return {
                isVisibleInitial: host.isVisible,
                threshold: host.threshold,
            };
        });
        expect(accessors).toEqual({
            isVisibleInitial: false,
            threshold: 100,
        });
    });

    test("backtop event fires on click", async ({ page }) => {
        const event = await page.evaluate(async () => {
            const host = document.getElementById("bt");
            const sc = document.getElementById("scroller");
            sc.scrollTop = 200;
            await new Promise(r => requestAnimationFrame(r));
            return new Promise((resolve) => {
                host.addEventListener("backtop", (e) => resolve({ reason: e.detail.reason }), { once: true });
                document.querySelector("[data-backtop-button]").click();
            });
        });
        expect(event).toEqual({ reason: "click" });
    });
});
