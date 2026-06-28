// Carousel browser tests -- exercise scroll-driven index detection
// (IntersectionObserver + uniform-width fast path), keyboard nav,
// autoplay interaction, and the cascade-guarded reactive `index`
// attribute round-trip.

import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/carousel.html";

test.describe("carousel", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.__carouselReady === true);
        // give role observers a tick to wire all slides + indicators
        await page.waitForTimeout(50);
    });

    // ---- attachment + ARIA --------------------------------------

    test("root gets role=region + aria-roledescription=carousel + label", async ({ page }) => {
        expect(await page.evaluate(() => {
            const c = document.getElementById("basic");
            return {
                role: c.getAttribute("role"),
                roleDesc: c.getAttribute("aria-roledescription"),
                label: c.getAttribute("aria-label"),
            };
        })).toEqual({
            role: "region",
            roleDesc: "carousel",
            label: "Demo carousel",
        });
    });

    test("slides get role=group + aria-roledescription=slide + 'N of M' label", async ({ page }) => {
        const labels = await page.evaluate(() =>
            Array.from(document.querySelectorAll("#basic [data-carousel-slide]"))
                .map(s => ({
                    role: s.getAttribute("role"),
                    roleDesc: s.getAttribute("aria-roledescription"),
                    label: s.getAttribute("aria-label"),
                })));
        expect(labels.length).toBe(4);
        expect(labels[0].role).toBe("group");
        expect(labels[0].roleDesc).toBe("slide");
        expect(labels.map(l => l.label)).toEqual([
            "1 of 4", "2 of 4", "3 of 4", "4 of 4",
        ]);
    });

    test("indicators auto-infer index from sibling order", async ({ page }) => {
        const labels = await page.evaluate(() =>
            Array.from(document.querySelectorAll("#basic [data-carousel-indicator]"))
                .map(el => el.getAttribute("aria-label")));
        expect(labels).toEqual(["Slide 1", "Slide 2", "Slide 3", "Slide 4"]);
    });

    test("initial state: slide 0 active, indicator 0 selected", async ({ page }) => {
        const state = await page.evaluate(() => ({
            slide0: document.querySelector("#basic [data-carousel-slide]:nth-child(1)").hasAttribute("data-active"),
            slide1: document.querySelector("#basic [data-carousel-slide]:nth-child(2)").hasAttribute("data-active"),
            ind0: document.querySelectorAll("#basic [data-carousel-indicator]")[0].getAttribute("aria-selected"),
            ind1: document.querySelectorAll("#basic [data-carousel-indicator]")[1].getAttribute("aria-selected"),
            ind0Tabindex: document.querySelectorAll("#basic [data-carousel-indicator]")[0].getAttribute("tabindex"),
            ind1Tabindex: document.querySelectorAll("#basic [data-carousel-indicator]")[1].getAttribute("tabindex"),
        }));
        expect(state.slide0).toBe(true);
        expect(state.slide1).toBe(false);
        expect(state.ind0).toBe("true");
        expect(state.ind1).toBe("false");
        expect(state.ind0Tabindex).toBe("0");
        expect(state.ind1Tabindex).toBe("-1");
    });

    // ---- click navigation ---------------------------------------

    test("Next button advances slide", async ({ page }) => {
        await page.click("#basic [data-carousel-next]");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("basic").index)).toBe(1);
    });

    test("Prev button goes back", async ({ page }) => {
        await page.evaluate(() => document.getElementById("basic").go(2));
        await page.waitForTimeout(80);
        await page.click("#basic [data-carousel-prev]");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("basic").index)).toBe(1);
    });

    test("Indicator click goes to that slide", async ({ page }) => {
        await page.click("#basic [data-carousel-indicator]:nth-child(3)");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("basic").index)).toBe(2);
    });

    // ---- keyboard ------------------------------------------------

    test("ArrowRight on focused viewport advances slide", async ({ page }) => {
        await page.focus("#basic [data-carousel-viewport]");
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("basic").index)).toBe(1);
    });

    test("ArrowLeft on focused viewport goes back", async ({ page }) => {
        await page.evaluate(() => document.getElementById("basic").go(2));
        // go(target) issues a scrollTo; the index signal updates from
        // IntersectionObserver only once the new slide is visible. Under
        // worker contention that can take >80ms, leaving the test pressing
        // ArrowLeft while still at index 0.
        await expect.poll(
            () => page.evaluate(() => document.getElementById("basic").index),
            { timeout: 2000, intervals: [50] },
        ).toBe(2);
        // Wait a tick past the SCROLL_LOCK_MS so a stray late IO update
        // can't fire after the keypress and snap index back to 0.
        await page.waitForTimeout(550);
        // locator.press is atomic focus+press; safer than focus()+press()
        // under contention where they may interleave.
        await page.locator("#basic [data-carousel-viewport]").press("ArrowLeft");
        await expect.poll(
            () => page.evaluate(() => document.getElementById("basic").index),
            { timeout: 2000, intervals: [50] },
        ).toBe(1);
    });

    test("Home jumps to first slide; End to last", async ({ page }) => {
        await page.evaluate(() => document.getElementById("basic").go(2));
        await page.waitForTimeout(80);
        await page.focus("#basic [data-carousel-viewport]");
        await page.keyboard.press("Home");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("basic").index)).toBe(0);
        await page.keyboard.press("End");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("basic").index)).toBe(3);
    });

    // ---- scroll-driven detection (IntersectionObserver path) ----

    test("scrolling viewport updates index (IntersectionObserver path)", async ({ page }) => {
        // Scroll to slide 2 (index 1)
        const idx = await page.evaluate(async () => {
            const viewport = document.querySelector("#basic [data-carousel-viewport]");
            const slide1 = viewport.children[1];
            viewport.scrollTo({ left: slide1.offsetLeft, behavior: "instant" });
            // wait for IO to fire
            await new Promise(r => setTimeout(r, 200));
            return document.getElementById("basic").index;
        });
        expect(idx).toBe(1);
    });

    // ---- autoplay ------------------------------------------------

    test("autoplay advances slides automatically", async ({ page }) => {
        // The #auto carousel has 200ms interval. Move mouse far from the
        // carousel so hover-pause doesn't suppress autoplay (playwright's
        // default mouse position can be inside the viewport on small pages).
        //
        // Don't pin `start` to 0: under worker contention, the page-boot +
        // first-read roundtrip can exceed 200ms, by which time autoplay has
        // already ticked once. Capture whatever the starting value is and
        // poll for *any* advance from it.
        await page.mouse.move(0, 0);
        const start = await page.evaluate(() => document.getElementById("auto").index);
        await expect.poll(
            () => page.evaluate(() => document.getElementById("auto").index),
            { timeout: 3000, intervals: [100] },
        ).not.toBe(start);
    });

    test("autoplay pauses on hover (autoplayBehavior: pause)", async ({ page }) => {
        // Move mouse over autoplay carousel
        const box = await page.locator("#auto").boundingBox();
        await page.mouse.move(box.x + 10, box.y + 10);
        await page.waitForTimeout(50);
        const a = await page.evaluate(() => document.getElementById("auto").index);
        // Wait 500ms with hover -- index should NOT advance (or advance very little)
        await page.waitForTimeout(500);
        const b = await page.evaluate(() => document.getElementById("auto").index);
        // tolerance: at most 1 step due to autoplay tick fired BEFORE pause
        expect(b - a).toBeLessThanOrEqual(0);
        // move mouse away
        await page.mouse.move(0, 0);
    });

    test("Play/Pause button toggles autoplay", async ({ page }) => {
        // Move mouse away to ensure not hovering
        await page.mouse.move(0, 0);
        await page.waitForTimeout(50);
        // Initially playing
        expect(await page.evaluate(() => document.getElementById("auto").playing)).toBe(true);
        await page.click("#auto [data-carousel-play-pause]");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("auto").playing)).toBe(false);
        expect(await page.evaluate(() =>
            document.querySelector("#auto [data-carousel-play-pause]").getAttribute("aria-pressed"))).toBe("false");
        await page.click("#auto [data-carousel-play-pause]");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("auto").playing)).toBe(true);
    });

    test("Play/Pause aria-label updates with state", async ({ page }) => {
        await page.mouse.move(0, 0);
        await page.waitForTimeout(50);
        const label1 = await page.evaluate(() =>
            document.querySelector("#auto [data-carousel-play-pause]").getAttribute("aria-label"));
        expect(label1).toBe("Pause carousel");
        await page.click("#auto [data-carousel-play-pause]");
        await page.waitForTimeout(30);
        const label2 = await page.evaluate(() =>
            document.querySelector("#auto [data-carousel-play-pause]").getAttribute("aria-label"));
        expect(label2).toBe("Play carousel");
    });

    test("autoplaying carousel has aria-live=off on viewport", async ({ page }) => {
        const live = await page.evaluate(() =>
            document.querySelector("#auto [data-carousel-viewport]").getAttribute("aria-live"));
        expect(live).toBe("off");
    });

    test("paused carousel has aria-live=polite on viewport", async ({ page }) => {
        await page.mouse.move(0, 0);
        await page.click("#auto [data-carousel-play-pause]");
        await page.waitForTimeout(30);
        const live = await page.evaluate(() =>
            document.querySelector("#auto [data-carousel-viewport]").getAttribute("aria-live"));
        expect(live).toBe("polite");
    });

    // ---- loop ----------------------------------------------------

    test("loop wraps from last to first", async ({ page }) => {
        // #auto has 3 slides and loop=true
        await page.mouse.move(0, 0);                // ensure not hovering
        await page.click("#auto [data-carousel-play-pause]");  // pause first
        await page.waitForTimeout(30);
        await page.evaluate(() => document.getElementById("auto").go(2));
        await page.waitForTimeout(80);
        await page.evaluate(() => document.getElementById("auto").next());
        await page.waitForTimeout(80);
        expect(await page.evaluate(() => document.getElementById("auto").index)).toBe(0);
    });

    // ---- cascade guard ------------------------------------------

    test("indexchange event fires exactly once per click (v0.7.12 cascade fix)", async ({ page }) => {
        const events = await page.evaluate(async () => {
            const host = document.getElementById("basic");
            const captured = [];
            const listener = (e) => captured.push({ index: e.detail.index, reason: e.detail.reason });
            host.addEventListener("indexchange", listener);
            document.querySelector("#basic [data-carousel-next]").click();
            await new Promise(r => setTimeout(r, 80));
            host.removeEventListener("indexchange", listener);
            return captured;
        });
        expect(events.length).toBe(1);
        expect(events[0].index).toBe(1);
    });

    test("indexchange event fires exactly once when index attribute changes externally", async ({ page }) => {
        const events = await page.evaluate(async () => {
            const host = document.getElementById("basic");
            const captured = [];
            const listener = (e) => captured.push({ index: e.detail.index, reason: e.detail.reason });
            host.addEventListener("indexchange", listener);
            host.setAttribute("index", "2");
            await new Promise(r => setTimeout(r, 80));
            host.removeEventListener("indexchange", listener);
            return captured;
        });
        expect(events.length).toBe(1);
        expect(events[0].index).toBe(2);
        expect(events[0].reason).toBe("attribute");
    });

    // ---- uniform-slide-width fast path --------------------------

    test("fast path: scrolling updates index via rAF + scrollLeft math", async ({ page }) => {
        const idx = await page.evaluate(async () => {
            const viewport = document.querySelector("#fast [data-carousel-viewport]");
            const slide1 = viewport.children[1];
            viewport.scrollTo({ left: slide1.offsetLeft, behavior: "instant" });
            // wait for rAF
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            return document.getElementById("fast").index;
        });
        expect(idx).toBe(1);
    });
});
