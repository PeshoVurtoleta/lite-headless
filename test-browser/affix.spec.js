// affix browser specs — real IntersectionObserver, real sentinel injection.

import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/affix.html";

test.describe("affix", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.__affixReady === true);
        // Give IO one frame to deliver initial entries
        await page.waitForTimeout(50);
    });

    test("initial state: target has data-affix-root, sentinel injected before target", async ({ page }) => {
        const state = await page.evaluate(() => {
            const target = document.getElementById("pin");
            const sentinel = target.parentElement.querySelector("[data-affix-sentinel]");
            return {
                hasRoot: target.hasAttribute("data-affix-root"),
                sentinelExists: !!sentinel,
                sentinelBefore: sentinel ? sentinel.nextElementSibling === target : false,
                sentinelAriaHidden: sentinel ? sentinel.getAttribute("aria-hidden") : null,
            };
        });
        expect(state).toEqual({
            hasRoot: true,
            sentinelExists: true,
            sentinelBefore: true,
            sentinelAriaHidden: "true",
        });
    });

    test("initial pin state: not pinned (sentinel is in view at top)", async ({ page }) => {
        const pinned = await page.evaluate(() => {
            return document.getElementById("pin").hasAttribute("data-pinned");
        });
        expect(pinned).toBe(false);
    });

    test("scrolling past the sentinel pins the target", async ({ page }) => {
        // The sentinel sits where the target naturally lives, before the
        // 200px filler-top. Scrolling >250px should put the sentinel
        // out of view, triggering pin.
        await page.evaluate(() => { document.getElementById("scroller").scrollTop = 300; });
        await page.waitForFunction(
            () => document.getElementById("pin").hasAttribute("data-pinned"),
            { timeout: 2000 }
        );
        const pinned = await page.evaluate(() =>
            document.getElementById("pin").hasAttribute("data-pinned")
        );
        expect(pinned).toBe(true);
    });

    test("scrolling back releases the pin", async ({ page }) => {
        const sc = await page.evaluateHandle(() => document.getElementById("scroller"));
        await page.evaluate(() => { document.getElementById("scroller").scrollTop = 400; });
        await page.waitForFunction(
            () => document.getElementById("pin").hasAttribute("data-pinned"),
            { timeout: 2000 }
        );
        await page.evaluate(() => { document.getElementById("scroller").scrollTop = 0; });
        await page.waitForFunction(
            () => !document.getElementById("pin").hasAttribute("data-pinned"),
            { timeout: 2000 }
        );
        const pinned = await page.evaluate(() =>
            document.getElementById("pin").hasAttribute("data-pinned")
        );
        expect(pinned).toBe(false);
    });

    test("affixchange event fires on pin transition", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const host = document.getElementById("pin");
            const sc = document.getElementById("scroller");
            const events = [];
            host.addEventListener("affixchange", (e) => events.push(e.detail.pinned));
            sc.scrollTop = 400;
            // Wait long enough for IO to fire
            await new Promise(r => setTimeout(r, 500));
            return events;
        });
        // Pinned (true) was dispatched at least once
        expect(result).toContain(true);
    });

    test("host exposes isPinned + offsetTop accessors", async ({ page }) => {
        const a = await page.evaluate(() => {
            const host = document.getElementById("pin");
            return { isPinned: host.isPinned, offsetTop: host.offsetTop };
        });
        expect(a).toEqual({ isPinned: false, offsetTop: 0 });
    });
});
