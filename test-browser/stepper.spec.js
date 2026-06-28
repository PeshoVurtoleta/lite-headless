// test-browser/stepper.spec.js
//
// Real-browser specs for createStepper. happy-dom verifies the math +
// clamp + step-snap + parse/format (40 unit tests); these specs verify
// the pieces that only work with real DOM event semantics: focus +
// blur producing reformat, real keyboard events (ArrowUp/PageUp), real
// pointerdown-hold-pointerup for auto-repeat, real wheel events,
// disabled at construction, and the readout-only path where there is
// no input to write to.

import { test, expect } from "@playwright/test";

test.describe("stepper", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/test-browser/fixtures/stepper.html");
        await page.waitForFunction(() => window.__stepperReady === true);
        await page.waitForTimeout(50);
    });

    test("initial value attribute -> primitive value + input display", async ({ page }) => {
        const state = await page.evaluate(() => ({
            value: document.getElementById("s1").value,
            display: document.querySelector("#s1 input").value,
            valuenow: document.querySelector("#s1 input").getAttribute("aria-valuenow"),
            valuemin: document.querySelector("#s1 input").getAttribute("aria-valuemin"),
            valuemax: document.querySelector("#s1 input").getAttribute("aria-valuemax"),
        }));
        expect(state.value).toBe(3);
        expect(state.display).toBe("3");
        expect(state.valuenow).toBe("3");
        expect(state.valuemin).toBe("0");
        expect(state.valuemax).toBe("10");
    });

    test("click increment fires +step and updates display", async ({ page }) => {
        await page.click("#s1 button[data-increment]");
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => ({
            value: document.getElementById("s1").value,
            display: document.querySelector("#s1 input").value,
        }));
        expect(state.value).toBe(4);
        expect(state.display).toBe("4");
    });

    test("keyboard ArrowUp on focused input increments", async ({ page }) => {
        await page.focus("#s1 input");
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => document.getElementById("s1").value);
        expect(state).toBe(4);
    });

    test("keyboard ArrowDown decrements", async ({ page }) => {
        await page.focus("#s1 input");
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => document.getElementById("s1").value);
        expect(state).toBe(2);
    });

    test("PageUp adds largeStep (5)", async ({ page }) => {
        await page.focus("#s1 input");
        await page.keyboard.press("PageUp");
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => document.getElementById("s1").value);
        expect(state).toBe(8);   // 3 + 5
    });

    test("Home jumps to min, End jumps to max", async ({ page }) => {
        await page.focus("#s1 input");
        await page.keyboard.press("Home");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("s1").value)).toBe(0);
        await page.keyboard.press("End");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("s1").value)).toBe(10);
    });

    test("click increment at max stays at max (silent clamp)", async ({ page }) => {
        await page.evaluate(() => document.getElementById("s1").setValue(10));
        await page.waitForTimeout(30);
        await page.click("#s1 button[data-increment]");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("s1").value)).toBe(10);
    });

    test("typing + blur reformats with precision (12.5 typed -> displayed as 12.5)", async ({ page }) => {
        const input = await page.$("#s2 input");
        await input.click({ clickCount: 3 });
        await page.keyboard.type("33.7");
        await input.evaluate(el => el.blur());
        await page.waitForTimeout(50);
        const state = await page.evaluate(() => ({
            value: document.getElementById("s2").value,
            display: document.querySelector("#s2 input").value,
        }));
        expect(state.value).toBeCloseTo(33.7, 2);
        expect(state.display).toBe("33.7");
    });

    test("typing out-of-range value clamps on blur", async ({ page }) => {
        const input = await page.$("#s2 input");
        await input.click({ clickCount: 3 });
        await page.keyboard.type("9999");
        await input.evaluate(el => el.blur());
        await page.waitForTimeout(50);
        const state = await page.evaluate(() => document.getElementById("s2").value);
        expect(state).toBe(100);   // clamped to max
    });

    test("typing snaps to step granularity on blur (step 0.1: 33.78 -> 33.8)", async ({ page }) => {
        const input = await page.$("#s2 input");
        await input.click({ clickCount: 3 });
        await page.keyboard.type("33.78");
        await input.evaluate(el => el.blur());
        await page.waitForTimeout(50);
        const state = await page.evaluate(() => document.getElementById("s2").value);
        expect(state).toBeCloseTo(33.8, 2);
    });

    test("hold-to-repeat: pointerdown + 600ms hold + pointerup yields multiple increments", async ({ page }) => {
        // s1 starts at 3. Default repeatDelay=400ms, repeatInterval=50ms.
        // 600ms hold = 1 immediate + ~4 repeats = ~5 increments total.
        await page.evaluate(() => document.getElementById("s1").setValue(0));
        await page.waitForTimeout(20);

        const btn = await page.$("#s1 button[data-increment]");
        const box = await btn.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(600);
        await page.mouse.up();
        await page.waitForTimeout(30);

        const value = await page.evaluate(() => document.getElementById("s1").value);
        // 1 immediate + (200ms post-delay / 50ms) = 1 + 4 = 5 minimum.
        // Headless chromium timing slop means we accept 3-8 range.
        expect(value).toBeGreaterThanOrEqual(3);
        expect(value).toBeLessThanOrEqual(10);  // capped at max anyway
    });

    test("readout-only stepper renders value into <output>", async ({ page }) => {
        const state = await page.evaluate(() => ({
            value: document.getElementById("s3").value,
            readout: document.querySelector("#s3 output").textContent,
        }));
        expect(state.value).toBe(3);
        expect(state.readout).toBe("3");
    });

    test("readout-only stepper: increment updates output text", async ({ page }) => {
        await page.click("#s3 button[data-increment]");
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => ({
            value: document.getElementById("s3").value,
            readout: document.querySelector("#s3 output").textContent,
        }));
        expect(state.value).toBe(4);
        expect(state.readout).toBe("4");
    });

    test("disabled-at-construction: input + buttons reject interaction", async ({ page }) => {
        // Verify the disabled attribute is reflected on the rendered controls.
        // (Playwright refuses to click disabled buttons by default -- that
        // refusal IS the proof of correctness for the button. We still use
        // force:true to confirm that *even if* a synthetic click sneaks
        // through, the primitive's _disabled guard short-circuits before
        // increment() runs.)
        const incDisabled = await page.$eval("#s4 button[data-increment]", el => el.hasAttribute("disabled"));
        expect(incDisabled).toBe(true);
        await page.click("#s4 button[data-increment]", { force: true });
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("s4").value)).toBe(0);

        // The input also reports disabled and won't accept typed input.
        const inputDisabled = await page.$eval("#s4 input", el => el.disabled);
        expect(inputDisabled).toBe(true);
    });

    test("valuechange CustomEvent fires with detail.value + detail.reason", async ({ page }) => {
        await page.evaluate(() => {
            window.__events = [];
            document.getElementById("s1").addEventListener("valuechange", (e) => {
                window.__events.push({ value: e.detail.value, reason: e.detail.reason });
            });
        });
        await page.click("#s1 button[data-increment]");
        await page.waitForTimeout(30);
        const events = await page.evaluate(() => window.__events);
        expect(events.length).toBeGreaterThan(0);
        expect(events[events.length - 1].value).toBe(4);
        expect(events[events.length - 1].reason).toBe("increment");
    });

    test("aria-valuenow updates as value changes", async ({ page }) => {
        await page.click("#s1 button[data-increment]");
        await page.click("#s1 button[data-increment]");
        await page.waitForTimeout(30);
        const valuenow = await page.evaluate(() =>
            document.querySelector("#s1 input").getAttribute("aria-valuenow")
        );
        expect(valuenow).toBe("5");
    });
});
