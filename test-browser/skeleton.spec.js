// Browser tests for skeleton primitive

import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/skeleton.html";

test.describe("skeleton", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__skeletonReady === true);
        await page.waitForTimeout(50);
    });

    test("initial state: all three skeletons are loading", async ({ page }) => {
        const data = await page.evaluate(() => ({
            single:    document.getElementById("sk-single").hasAttribute("data-loading"),
            multi:     document.getElementById("sk-multi").hasAttribute("data-loading"),
            flash:     document.getElementById("sk-flash").hasAttribute("data-loading"),
            singleBusy: document.getElementById("sk-single").getAttribute("aria-busy"),
        }));
        expect(data.single).toBe(true);
        expect(data.multi).toBe(true);
        expect(data.flash).toBe(true);
        expect(data.singleBusy).toBe("true");
    });

    test("single skeleton reveal button flips to ready", async ({ page }) => {
        await page.click("#b-single-reveal");
        await page.waitForTimeout(50);
        const data = await page.evaluate(() => ({
            state: document.getElementById("sk-single").hasAttribute("data-loading"),
            busy:  document.getElementById("sk-single").getAttribute("aria-busy"),
            placeholderHidden: document.querySelector('#sk-single [data-skeleton]:not([data-loading])') !== null,
        }));
        expect(data.state).toBe(false);
        expect(data.busy).toBe("false");
        expect(data.placeholderHidden).toBe(true);
    });

    test("conceal button returns single to loading", async ({ page }) => {
        await page.click("#b-single-reveal");
        await page.waitForTimeout(50);
        await page.click("#b-single-conceal");
        await page.waitForTimeout(50);
        const state = await page.evaluate(() => document.getElementById("sk-single").hasAttribute("data-loading"));
        expect(state).toBe(true);
    });

    test("multi-source: needs all three resolves before revealing", async ({ page }) => {
        await page.click("#b-multi-user");
        await page.waitForTimeout(30);
        let state = await page.evaluate(() => document.getElementById("sk-multi").hasAttribute("data-loading"));
        expect(state).toBe(true);   // still pending posts + followers

        await page.click("#b-multi-posts");
        await page.waitForTimeout(30);
        state = await page.evaluate(() => document.getElementById("sk-multi").hasAttribute("data-loading"));
        expect(state).toBe(true);   // still pending followers

        await page.click("#b-multi-followers");
        await page.waitForTimeout(30);
        state = await page.evaluate(() => document.getElementById("sk-multi").hasAttribute("data-loading"));
        expect(state).toBe(false);
    });

    test("pendingSources is reflected to host accessor", async ({ page }) => {
        const initial = await page.evaluate(() =>
            document.getElementById("sk-multi").pendingSources.slice().sort());
        expect(initial).toEqual(["followers", "posts", "user"]);

        await page.click("#b-multi-user");
        await page.waitForTimeout(30);
        const afterOne = await page.evaluate(() =>
            document.getElementById("sk-multi").pendingSources.slice().sort());
        expect(afterOne).toEqual(["followers", "posts"]);
    });

    test("reset puts multi back to loading + reinstates pendingSources", async ({ page }) => {
        // Resolve all
        await page.click("#b-multi-user");
        await page.click("#b-multi-posts");
        await page.click("#b-multi-followers");
        await page.waitForTimeout(30);
        let state = await page.evaluate(() => document.getElementById("sk-multi").hasAttribute("data-loading"));
        expect(state).toBe(false);

        await page.click("#b-multi-reset");
        await page.waitForTimeout(30);
        const after = await page.evaluate(() => ({
            state:    document.getElementById("sk-multi").hasAttribute("data-loading"),
            pending:  document.getElementById("sk-multi").pendingSources.slice().sort(),
        }));
        expect(after.state).toBe(true);
        expect(after.pending).toEqual(["followers", "posts", "user"]);
    });

    test("minVisibleMs defers reveal when called immediately after construct", async ({ page }) => {
        // The fixture's flash skeleton was constructed at page load, which
        // could be well over 200ms ago by now. Construct a fresh skeleton
        // in-page so we control _mountedAt precisely.
        const result = await page.evaluate(async () => {
            const { createSkeleton } = await import("/src/skeleton/index.js");
            const sk = createSkeleton({ minVisibleMs: 300 });
            const root = document.createElement("div");
            document.body.appendChild(root);
            sk.attachRoot(root);
            sk.setReady(true);
            const immediate = root.hasAttribute("data-loading");
            await new Promise(r => setTimeout(r, 360));
            const afterWait = root.hasAttribute("data-loading");
            sk.destroy();
            root.remove();
            return { immediate, afterWait };
        });
        expect(result.immediate).toBe(true);   // deferred by guard
        expect(result.afterWait).toBe(false);      // timer fired
    });

    test("conceal cancels a pending reveal (minVisibleMs timer)", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { createSkeleton } = await import("/src/skeleton/index.js");
            const sk = createSkeleton({ minVisibleMs: 300 });
            const root = document.createElement("div");
            document.body.appendChild(root);
            sk.attachRoot(root);
            sk.setReady(true);
            sk.conceal();
            await new Promise(r => setTimeout(r, 360));
            const state = root.hasAttribute("data-loading");
            sk.destroy();
            root.remove();
            return state;
        });
        expect(result).toBe(true);
    });

    test("reveal + conceal events fire on edge transitions", async ({ page }) => {
        // Initial log says "events: -"; reveal/conceal prepend
        await page.click("#b-single-reveal");
        await page.waitForTimeout(30);
        await page.click("#b-single-conceal");
        await page.waitForTimeout(30);
        const log = await page.evaluate(() => document.getElementById("log").textContent);
        expect(log).toMatch(/single conceal/);
        expect(log).toMatch(/single reveal/);
    });

    test("aria-busy + aria-hidden are correctly painted on attached elements", async ({ page }) => {
        const initial = await page.evaluate(() => {
            const root = document.getElementById("sk-single");
            const ph   = root.querySelector("[data-skeleton]");
            const ct   = root.querySelector("[data-skeleton-content]");
            return {
                rootBusy:    root.getAttribute("aria-busy"),
                contentHidden: ct.getAttribute("aria-hidden"),
                placeholderHidden: ph.getAttribute("aria-hidden"),
            };
        });
        expect(initial.rootBusy).toBe("true");
        expect(initial.contentHidden).toBe("true");
        expect(initial.placeholderHidden).toBe(null);   // visible while loading

        await page.click("#b-single-reveal");
        await page.waitForTimeout(50);
        const ready = await page.evaluate(() => {
            const root = document.getElementById("sk-single");
            const ph   = root.querySelector("[data-skeleton]");
            const ct   = root.querySelector("[data-skeleton-content]");
            return {
                rootBusy:    root.getAttribute("aria-busy"),
                contentHidden: ct.getAttribute("aria-hidden"),
                placeholderHidden: ph.getAttribute("aria-hidden"),
            };
        });
        expect(ready.rootBusy).toBe("false");
        expect(ready.contentHidden).toBe(null);   // visible when ready
        expect(ready.placeholderHidden).toBe("true");
    });
});
