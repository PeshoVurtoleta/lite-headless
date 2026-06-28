// demo-health: meta-spec that loads the real demo and asserts the
// invariants that should hold across every release. Catches the
// classes of bugs that slipped past unit tests in v0.13.1 and v0.13.3:
//
//   v0.13.1: boot loader's whenDefined hide-trigger never resolved
//            because element wrappers weren't imported; the loader
//            sat over the page until the 6s hard-timeout fallback.
//            Symptom: blank page for 6s.
//
//   v0.13.3: an invalid CSS value (space between number and unit)
//            collapsed #app to auto height. The 1fr scene row had
//            nothing to expand into.
//            Symptom: header/nav/footer rendered, scene area blank.
//
// Neither was visible to evaluate()-based DOM inspection because
// those queries read through visual overlays. The checks below
// use computed-style + getBoundingClientRect to catch them.

import { test, expect } from "@playwright/test";

const ROUTE = "/demo/index.html";

// The demo is 14k lines / 60+ primitive registrations / hundreds of inline
// reactive blocks. Loading it 4-5 times in parallel through the single-
// process dev server can exceed the global 15s timeout under contention.
// We give every test in this file 45s so they survive worker pressure.
test.describe.configure({ timeout: 45_000 });

test.describe("demo-health: invariants", () => {
    test("page parses with zero JS errors", async ({ page }) => {
        const errs = [];
        page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
        page.on("console", (m) => {
            if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
                errs.push("console.error: " + m.text());
            }
        });
        await page.goto(ROUTE, { waitUntil: "load" });
        await page.waitForTimeout(500);
        // Filter out CapacityError (would indicate registry config regression)
        // and any other real JS errors. Resource 404s from intentional
        // bad-image test cases (picture scene) are filtered above.
        expect(errs, errs.join("\n")).toHaveLength(0);
    });

    test("#app has non-auto, non-zero computed dimensions", async ({ page }) => {
        // This is the v0.13.3 regression check. Invalid CSS values
        // (e.g. "100 dvh" with a space) make the browser drop the
        // property, which makes #app collapse to content auto-size,
        // which makes the 1fr scene row render at 0px tall.
        await page.goto(ROUTE, { waitUntil: "load" });
        await page.waitForTimeout(500);
        const dims = await page.evaluate(() => {
            const app = document.getElementById("app");
            const cs = getComputedStyle(app);
            const r = app.getBoundingClientRect();
            return {
                cssHeight: cs.height,
                cssWidth: cs.width,
                rectHeight: r.height,
                rectWidth: r.width,
            };
        });
        // Must NOT be "auto" (auto means CSS was dropped + fallback)
        expect(dims.cssHeight).not.toBe("auto");
        expect(dims.cssWidth).not.toBe("auto");
        // Must be at least viewport-tall enough for content
        expect(dims.rectHeight).toBeGreaterThan(500);
        expect(dims.rectWidth).toBeGreaterThan(500);
    });

    test("boot-loader removed within 1 second", async ({ page }) => {
        // This is the v0.13.1 regression check. If the customElements
        // .whenDefined trigger fails (missing wrapper imports), the
        // loader hangs for 6 seconds before the hard-timeout fallback
        // hides it. By 1s, the imports should have resolved and the
        // loader should be gone (removed from DOM after fade).
        await page.goto(ROUTE, { waitUntil: "load" });
        await page.waitForTimeout(1000);
        const bootStatus = await page.evaluate(() => {
            const el = document.getElementById("boot-loader");
            if (!el) return { gone: true };
            return {
                gone: false,
                hidden: el.classList.contains("hidden"),
                opacity: parseFloat(getComputedStyle(el).opacity),
            };
        });
        // Either gone from DOM entirely or fully faded out (opacity 0)
        const ok = bootStatus.gone === true ||
                   (bootStatus.hidden === true && bootStatus.opacity < 0.1);
        expect(ok, JSON.stringify(bootStatus)).toBe(true);
    });

    test("no viewport-covering overlay above scene content", async ({ page }) => {
        // Hover the center of the page and confirm the topmost
        // element is something inside the scene, not a fixed overlay.
        // (boot loader and admin theme wallpapers should NOT block clicks)
        await page.goto(ROUTE, { waitUntil: "load" });
        await page.waitForTimeout(700);
        const hit = await page.evaluate(() => {
            // Pick a point inside the scene area, not in the nav/footer
            const el = document.elementFromPoint(500, 400);
            if (!el) return { tag: null };
            // Walk up until we find a meaningful element
            let walk = el;
            const chain = [];
            while (walk && chain.length < 6) {
                chain.push({
                    tag: walk.tagName.toLowerCase(),
                    id: walk.id || null,
                    cls: walk.className && typeof walk.className === "string"
                         ? walk.className.split(/\s+/).filter(Boolean).slice(0, 3).join(",")
                         : null,
                });
                walk = walk.parentElement;
            }
            return { topElement: chain[0], chain };
        });
        // Top element must not be the boot loader
        expect(hit.topElement?.id, JSON.stringify(hit)).not.toBe("boot-loader");
    });
});

test.describe("demo-health: scene navigation", () => {
    // Discover all menu scenes once, then loop. Per-scene assertions
    // run in sequence inside one test() so we share the page state
    // and avoid the cost of N fresh page loads.
    //
    // ~58 scenes × per-iteration browser round-trip. Under --workers=4
    // contention the per-evaluate roundtrip can balloon to 100ms+; we
    // budget 90s and shrink the post-click sleep to 10ms (a click that
    // misses the swap will be caught by the `data-active` assertion
    // a moment later, not silently passed over).
    test("every menu scene navigates + renders non-empty content", async ({ page }) => {
        test.setTimeout(90_000);
        await page.goto(ROUTE, { waitUntil: "load" });
        await page.waitForTimeout(800);
        const sceneKeys = await page.evaluate(() => {
            const lis = document.querySelectorAll(".cat-menu li[data-scene]");
            const out = [];
            for (const li of lis) out.push(li.dataset.scene);
            return out;
        });
        expect(sceneKeys.length, "menu must list scenes").toBeGreaterThan(40);

        for (const key of sceneKeys) {
            // Click via DOM (faster than playwright's .click since we
            // don't need to wait for visibility / pointer events here).
            // Roll the click and the post-swap state read into a single
            // page.evaluate so we save one roundtrip per scene.
            const state = await page.evaluate(async (s) => {
                document.querySelector('.cat-menu li[data-scene="' + s + '"]').click();
                await new Promise(r => setTimeout(r, 10));
                const sec = document.querySelector('section.scene[data-active]');
                if (!sec) return { active: null, height: 0, hasStage: false };
                const r = sec.getBoundingClientRect();
                return {
                    active: sec.dataset.scene,
                    height: r.height,
                    hasStage: !!sec.querySelector('.stage'),
                };
            }, key);

            expect(state.active, "scene " + key + ": expected active").toBe(key);
            expect(state.hasStage, "scene " + key + ": missing .stage").toBe(true);
            // Scene container should be at least roughly half-viewport tall
            expect(state.height, "scene " + key + ": collapsed to " + state.height + "px").toBeGreaterThan(300);
        }
    });
});
