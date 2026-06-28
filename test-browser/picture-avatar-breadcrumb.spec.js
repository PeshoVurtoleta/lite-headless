// Browser tests for picture + avatar + breadcrumb. Image loads use
// weserv.nl as a public CORS-friendly image proxy so we don't depend
// on flaky direct picsum/pravatar uptime in CI.

import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/picture-avatar-breadcrumb.html";

test.describe("picture", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__pabReady === true);
        await page.waitForTimeout(50);
    });

    test("lazy picture: root + img get data-img-state painted", async ({ page }) => {
        const data = await page.evaluate(() => {
            const root = document.querySelector("#pic-lazy [data-pic-root]");
            const img  = document.querySelector("#pic-lazy [data-pic-img]");
            return {
                rootState: root.getAttribute("data-img-state"),
                imgState:  img.getAttribute("data-img-state"),
                ar:        root.getAttribute("data-aspect-ratio"),
                imgLoading: img.getAttribute("loading"),
            };
        });
        // Could be "idle" (not yet intersected) or "loading"/"loaded"
        // depending on viewport. Assert it's one of the valid states.
        expect(["idle", "loading", "loaded"]).toContain(data.rootState);
        expect(data.ar).toBe("16/9");
        expect(data.imgLoading).toBe("lazy");
    });

    test("lazy picture eventually transitions to loaded when in viewport", async ({ page }) => {
        // Scroll the lazy picture into view + wait for load
        await page.locator("#pic-lazy").scrollIntoViewIfNeeded();
        await page.waitForFunction(() =>
            document.querySelector("#pic-lazy [data-pic-root]")
                .getAttribute("data-img-state") === "loaded", { timeout: 8000 });
        const state = await page.evaluate(() =>
            document.querySelector("#pic-lazy [data-pic-root]")
                .getAttribute("data-img-state"));
        expect(state).toBe("loaded");
    });

    test("eager error picture transitions to error", async ({ page }) => {
        await page.waitForFunction(() =>
            document.querySelector("#pic-eager-err [data-pic-root]")
                .getAttribute("data-img-state") === "error", { timeout: 5000 });
        const state = await page.evaluate(() =>
            document.querySelector("#pic-eager-err [data-pic-root]")
                .getAttribute("data-img-state"));
        expect(state).toBe("error");
    });
});

test.describe("avatar", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__pabReady === true);
        await page.waitForTimeout(50);
    });

    test("avatar with name (no src) starts in fallback state", async ({ page }) => {
        const data = await page.evaluate(() => {
            const av = document.getElementById("av-fb1");
            const fb = av.querySelector("[data-avatar-fallback]");
            return {
                state:    av.hasAttribute("data-loaded"),
                role:     av.getAttribute("role"),
                label:    av.getAttribute("aria-label"),
                initials: fb.getAttribute("data-initials"),
                hue:      fb.getAttribute("data-color-hue"),
                hidden:   fb.hasAttribute("hidden"),
            };
        });
        expect(data.state).toBe(false);
        expect(data.role).toBe("img");
        expect(data.label).toBe("Zahary Shinikchiev");
        expect(data.initials).toBe("ZS");
        expect(data.hidden).toBe(false);
        expect(Number(data.hue)).toBeGreaterThanOrEqual(0);
        expect(Number(data.hue)).toBeLessThan(360);
    });

    test("multiple avatars get different hues", async ({ page }) => {
        const hues = await page.evaluate(() => {
            return ["av-fb1", "av-fb2", "av-fb3", "av-fb4"].map(id => {
                const fb = document.querySelector(`#${id} [data-avatar-fallback]`);
                return Number(fb.getAttribute("data-color-hue"));
            });
        });
        const unique = new Set(hues);
        expect(unique.size).toBeGreaterThanOrEqual(3);
    });

    test("avatar initials algorithm works in browser", async ({ page }) => {
        const initials = await page.evaluate(() => {
            return ["av-fb1", "av-fb2", "av-fb3", "av-fb4"].map(id => {
                const fb = document.querySelector(`#${id} [data-avatar-fallback]`);
                return fb.getAttribute("data-initials");
            });
        });
        expect(initials).toEqual(["ZS", "MC", "C", "ZA"]);
    });

    test("avatar with broken src falls back", async ({ page }) => {
        await page.waitForFunction(() =>
            !document.getElementById("av-broken").hasAttribute("data-loaded"),
            { timeout: 5000 });
        const state = await page.evaluate(() =>
            document.getElementById("av-broken").hasAttribute("data-loaded"));
        expect(state).toBe(false);
    });

    test("--hue CSS custom property is set on fallback element", async ({ page }) => {
        const hue = await page.evaluate(() => {
            const fb = document.querySelector("#av-fb1 [data-avatar-fallback]");
            return fb.style.getPropertyValue("--hue");
        });
        expect(hue).toMatch(/^\d+$/);
    });
});

test.describe("breadcrumb", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__pabReady === true);
        await page.waitForTimeout(50);
    });

    test("root gets role=navigation + aria-label", async ({ page }) => {
        const attrs = await page.evaluate(() => {
            const el = document.getElementById("bc");
            return {
                role: el.getAttribute("role"),
                label: el.getAttribute("aria-label"),
            };
        });
        expect(attrs).toEqual({ role: "navigation", label: "Breadcrumb" });
    });

    test("last item is automatically marked current", async ({ page }) => {
        const data = await page.evaluate(() => {
            const items = document.querySelectorAll("#bc [data-bc-item]");
            return Array.from(items).map(el => ({
                key:     el.getAttribute("data-bc-item"),
                current: el.getAttribute("aria-current"),
                data:    el.getAttribute("data-current"),
            }));
        });
        expect(data[0].current).toBeNull();
        expect(data[1].current).toBeNull();
        expect(data[2].current).toBeNull();
        expect(data[3].current).toBe("page");
        expect(data[3].data).toBe("true");
    });

    test("explicit current attribute marks the right item", async ({ page }) => {
        const data = await page.evaluate(() => {
            const items = document.querySelectorAll("#bc-current [data-bc-item]");
            return Array.from(items).map(el => ({
                key: el.getAttribute("data-bc-item"),
                current: el.getAttribute("aria-current"),
            }));
        });
        // "projects" was the explicit current
        const proj = data.find(d => d.key === "projects");
        expect(proj.current).toBe("page");
    });

    test("setCurrent moves the marker", async ({ page }) => {
        await page.click("#b-set-current-other");
        await page.waitForTimeout(50);
        const data = await page.evaluate(() => {
            const items = document.querySelectorAll("#bc-current [data-bc-item]");
            return Array.from(items).map(el => ({
                key: el.getAttribute("data-bc-item"),
                current: el.getAttribute("aria-current"),
            }));
        });
        const other = data.find(d => d.key === "other");
        expect(other.current).toBe("page");
        const proj = data.find(d => d.key === "projects");
        expect(proj.current).toBeNull();
    });

    test("clicking an item fires itemclick event", async ({ page }) => {
        const evt = await page.evaluate(async () => {
            return new Promise(resolve => {
                const bc = document.getElementById("bc");
                bc.addEventListener("itemclick", e => resolve({
                    key: e.detail.key,
                    idx: e.detail.index,
                }), { once: true });
                bc.querySelector("[data-bc-item='projects'] a").click();
            });
        });
        expect(evt).toEqual({ key: "projects", idx: 1 });
    });
});
