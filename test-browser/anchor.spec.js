// anchor browser specs — real IntersectionObserver, real click scroll.

import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/anchor.html";

test.describe("anchor", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.__anchorReady === true);
        await page.waitForTimeout(80);
    });

    test("initial state: alpha link is active (first section visible at top)", async ({ page }) => {
        const state = await page.evaluate(() => {
            const links = document.querySelectorAll("#side a");
            return Array.from(links).map(l => ({
                href: l.getAttribute("href"),
                active: l.hasAttribute("data-active"),
                ariaCurrent: l.getAttribute("aria-current"),
            }));
        });
        expect(state[0]).toEqual({ href: "#sec-alpha", active: true, ariaCurrent: "location" });
        // Others must not be active
        for (let i = 1; i < state.length; i++) {
            expect(state[i].active, "link " + state[i].href).toBe(false);
            expect(state[i].ariaCurrent, "link " + state[i].href).toBe(null);
        }
    });

    test("links and sections have painted markers", async ({ page }) => {
        const counts = await page.evaluate(() => ({
            rootAttr:    document.getElementById("side").hasAttribute("data-anchor-root"),
            linkCount:   document.querySelectorAll("[data-anchor-link]").length,
            sectionCount: document.querySelectorAll("[data-anchor-section]").length,
            sectionKeys: Array.from(document.querySelectorAll("[data-anchor-section]"))
                              .map(s => s.getAttribute("data-anchor-section-key")),
        }));
        expect(counts.rootAttr).toBe(true);
        expect(counts.linkCount).toBe(4);
        expect(counts.sectionCount).toBe(4);
        expect(counts.sectionKeys).toEqual(["sec-alpha", "sec-beta", "sec-gamma", "sec-delta"]);
    });

    test("scrolling brings a later section into view + activates its link", async ({ page }) => {
        // Each section is ~549px tall (500 min-height + 24px padding × 2).
        // sec-gamma sits at y≈1131..1680 in the scroller. Scrolling to
        // 1500 puts beta fully above the viewport top, so gamma becomes
        // the earliest visible section.
        await page.evaluate(() => { document.getElementById("scroller").scrollTop = 1500; });
        await page.waitForFunction(
            () => document.querySelector('a[href="#sec-gamma"]').hasAttribute("data-active"),
            { timeout: 2500 }
        );
        const active = await page.evaluate(() => {
            const links = document.querySelectorAll("#side a");
            return Array.from(links).map(l => ({
                href: l.getAttribute("href"),
                active: l.hasAttribute("data-active"),
            }));
        });
        const activeOne = active.find(l => l.active);
        expect(activeOne.href).toBe("#sec-gamma");
    });

    test("clicking a link scrolls + optimistically activates", async ({ page }) => {
        await page.click('a[href="#sec-delta"]');
        // After click, delta should be active (optimistic) and scroller advanced.
        // Use poll: the data-active attribute is painted by one effect and the
        // activeKey getter reads a separate signal; under worker contention
        // these can settle on different ticks (we've observed data-active set
        // on delta while activeKey still reads the IO-driven previous value
        // for a frame).
        await expect.poll(
            () => page.evaluate(() => document.getElementById("side").activeKey),
            { timeout: 2000, intervals: [50] },
        ).toBe("sec-delta");
        const scrollTop = await page.evaluate(
            () => document.getElementById("scroller").scrollTop,
        );
        expect(scrollTop).toBeGreaterThan(0);
    });

    test("modifier-key click is not intercepted (default browser action runs)", async ({ page }) => {
        // Our handler returns early on modifier-clicks WITHOUT calling
        // preventDefault, so the browser's default link behavior fires.
        //
        // We don't verify via location.hash: macOS reserves Cmd+click on a
        // link for "open in background tab", so even in headless mode the
        // current tab doesn't navigate, leaving the hash empty regardless
        // of whether our handler called preventDefault. Instead we
        // dispatch a real synthetic click event and check defaultPrevented
        // -- if our handler called preventDefault, it would be true; if
        // it returned early (correct behavior for modifier-clicks), it
        // stays false. This tests the handler's actual contract, not a
        // platform-dependent side-effect.
        const defaultPrevented = await page.evaluate(() => {
            const link = document.querySelector('a[href="#sec-gamma"]');
            const ev = new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                button: 0,
                metaKey: true,    // works as a "modifier click" on any OS
            });
            link.dispatchEvent(ev);
            return ev.defaultPrevented;
        });
        expect(defaultPrevented).toBe(false);
    });

    test("activechange event fires on link click", async ({ page }) => {
        const events = await page.evaluate(async () => {
            const host = document.getElementById("side");
            const collected = [];
            host.addEventListener("activechange", (e) => collected.push(e.detail.key));
            document.querySelector('a[href="#sec-beta"]').click();
            await new Promise(r => setTimeout(r, 200));
            return collected;
        });
        expect(events).toContain("sec-beta");
    });

    test("host exposes activeKey + linkCount accessors", async ({ page }) => {
        const a = await page.evaluate(() => {
            const host = document.getElementById("side");
            return { activeKey: host.activeKey, linkCount: host.linkCount };
        });
        expect(a.activeKey).toBe("sec-alpha");
        expect(a.linkCount).toBe(4);
    });
});
