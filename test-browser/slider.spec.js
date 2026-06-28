// test-browser/slider.spec.js
// Real pointer-drag against a real track rect. happy-dom can't simulate
// layout, so the slider unit tests had to stub getBoundingClientRect via
// Object.defineProperty. These tests cover the same paths with a real DOM.

import { test, expect } from "@playwright/test";

test.describe("slider", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/test-browser/fixtures/slider.html");
    });

    test("clicking the track moves the thumb to that position", async ({ page }) => {
        const track = page.locator("#single-track");
        const box = await track.boundingBox();
        if (!box) throw new Error("no track box");

        // click at 25% of the track width
        const x = box.x + box.width * 0.25;
        const y = box.y + box.height / 2;
        await page.mouse.click(x, y);

        // value should be ~25 (clicking at 25% of [0, 100])
        const readout = await page.locator("#single-readout").textContent();
        const value = parseInt(readout, 10);
        expect(value).toBeGreaterThanOrEqual(24);
        expect(value).toBeLessThanOrEqual(26);
    });

    test("dragging the thumb updates value continuously", async ({ page }) => {
        const thumb = page.locator("#single-thumb");
        const track = page.locator("#single-track");
        const thumbBox = await thumb.boundingBox();
        const trackBox = await track.boundingBox();
        if (!thumbBox || !trackBox) throw new Error("no boxes");

        // Drag from initial (50%) to 80%
        const startX = thumbBox.x + thumbBox.width / 2;
        const startY = thumbBox.y + thumbBox.height / 2;
        const endX   = trackBox.x + trackBox.width * 0.80;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        // intermediate steps so pointermove fires multiple times
        for (let i = 1; i <= 10; i++) {
            const t = i / 10;
            await page.mouse.move(startX + (endX - startX) * t, startY);
        }
        await page.mouse.up();

        const value = parseInt(await page.locator("#single-readout").textContent(), 10);
        expect(value).toBeGreaterThanOrEqual(79);
        expect(value).toBeLessThanOrEqual(81);
    });

    test("thumb gets data-dragging while pointer is down", async ({ page }) => {
        const thumb = page.locator("#single-thumb");
        const box = await thumb.boundingBox();
        if (!box) throw new Error("no box");

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await expect(thumb).toHaveAttribute("data-dragging", "");
        await page.mouse.up();
        await expect(thumb).not.toHaveAttribute("data-dragging", "");
    });

    test("range slider: minStepsBetweenThumbs prevents crossing", async ({ page }) => {
        // Drag thumb-0 (value=20) rightward past thumb-1 (value=80).
        // With minStepsBetweenThumbs=5, thumb-0 must stop at 75 (80-5).
        const t0 = page.locator("#range-thumb-0");
        const track = page.locator("#range-track");
        const t0Box = await t0.boundingBox();
        const trackBox = await track.boundingBox();
        if (!t0Box || !trackBox) throw new Error("no boxes");

        const startX = t0Box.x + t0Box.width / 2;
        const y = t0Box.y + t0Box.height / 2;
        // try to drag to 95% of the track (would set value to 95)
        const endX = trackBox.x + trackBox.width * 0.95;

        await page.mouse.move(startX, y);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) {
            const t = i / 10;
            await page.mouse.move(startX + (endX - startX) * t, y);
        }
        await page.mouse.up();

        const readout = await page.locator("#range-readout").textContent();
        const [lo, hi] = readout.split(",").map((s) => parseInt(s.trim(), 10));
        // Lower thumb should be clamped to 75 (the gap of 5 below thumb-1 at 80)
        expect(lo).toBe(75);
        expect(hi).toBe(80);
    });

    test("keyboard ArrowRight increments by step (focus first)", async ({ page }) => {
        // tab into the slider thumb. The single-track's thumb is the second
        // focusable; #single-track itself isn't tabbable.
        await page.locator("#single-thumb").focus();
        await page.keyboard.press("ArrowRight");
        const value = parseInt(await page.locator("#single-readout").textContent(), 10);
        expect(value).toBe(51);
    });
});
