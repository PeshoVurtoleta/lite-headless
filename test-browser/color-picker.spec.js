// Browser specs: color-picker.
//
// Pointer-drag math is the part that JSDOM can't fully exercise --
// getBoundingClientRect returns zeros under JSDOM without layout. Real
// Chromium gives us layout + real DragEvent semantics.

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

async function mountWrapper(page, name, html) {
    await page.goto(BASE + "/test-browser/fixtures/blank.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(async (path) => { await import(path); }, "/src/" + name + "/element.js");
    await page.evaluate((markup) => { document.body.insertAdjacentHTML("beforeend", markup); }, html);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
}

test.describe("color-picker", () => {
    test("attribute value initializes hex; matches host.hex", async ({ page }) => {
        await mountWrapper(page, "color-picker", `
            <lite-color-picker id="cp" value="#7dd3fc"></lite-color-picker>
        `);
        const hex = await page.evaluate(() => document.getElementById("cp").hex);
        expect(hex).toBe("#7dd3fc");
    });

    test("host.setHex flows to value attribute (mirror)", async ({ page }) => {
        await mountWrapper(page, "color-picker", `
            <lite-color-picker id="cp" value="#7dd3fc"></lite-color-picker>
        `);
        await page.evaluate(() => document.getElementById("cp").setHex("#00ff00"));
        await page.waitForTimeout(20);
        const attr = await page.evaluate(() => document.getElementById("cp").getAttribute("value"));
        expect(attr).toBe("#00ff00");
    });

    test("area pointerdown sets saturation+brightness from pixel position", async ({ page }) => {
        await mountWrapper(page, "color-picker", `
            <lite-color-picker id="cp" value="#000000">
                <div id="area" data-color-area style="width: 200px; height: 200px; background: red;"></div>
            </lite-color-picker>
        `);
        // Click at center of the area (100, 100 inside a 200x200) -> s=0.5, v=0.5
        const box = await page.locator("#area").boundingBox();
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.waitForTimeout(50);
        const state = await page.evaluate(() => {
            const cp = document.getElementById("cp");
            return { s: cp.saturation, v: cp.brightness };
        });
        expect(state.s).toBeCloseTo(0.5, 1);
        expect(state.v).toBeCloseTo(0.5, 1);
    });

    test("hue slider pointerdown sets hue from pixel position", async ({ page }) => {
        await mountWrapper(page, "color-picker", `
            <lite-color-picker id="cp" value="#ff0000">
                <div id="hue" data-color-hue-slider style="width: 360px; height: 20px;"></div>
            </lite-color-picker>
        `);
        const box = await page.locator("#hue").boundingBox();
        // Click at 50% -> hue should be 180
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.waitForTimeout(50);
        const hue = await page.evaluate(() => document.getElementById("cp").hue);
        expect(hue).toBeCloseTo(180, 0);
    });

    test("swatch click sets the color + fires commit", async ({ page }) => {
        await mountWrapper(page, "color-picker", `
            <lite-color-picker id="cp" value="#000000">
                <button id="sw1" data-color-swatch data-color="#7dd3fc">cyan</button>
            </lite-color-picker>
        `);
        const got = await page.evaluate(() => {
            return new Promise(resolve => {
                const cp = document.getElementById("cp");
                let commitDetail = null;
                cp.addEventListener("commit", e => { commitDetail = e.detail; });
                document.getElementById("sw1").click();
                setTimeout(() => resolve({ hex: cp.hex, commit: commitDetail }), 30);
            });
        });
        expect(got.hex).toBe("#7dd3fc");
        expect(got.commit).not.toBeNull();
        expect(got.commit.reason).toBe("swatch");
    });

    test("CSS custom properties paint on attached elements", async ({ page }) => {
        await mountWrapper(page, "color-picker", `
            <lite-color-picker id="cp" value="#ff8800">
                <div id="area" data-color-area></div>
                <div id="handle" data-color-area-handle></div>
                <div id="hue" data-color-hue-slider></div>
            </lite-color-picker>
        `);
        const props = await page.evaluate(() => {
            const root = document.getElementById("cp");
            const handle = document.getElementById("handle");
            const hue = document.getElementById("hue");
            return {
                rootHex: root.style.getPropertyValue("--color-hex"),
                handleX: handle.style.getPropertyValue("--x"),
                handleY: handle.style.getPropertyValue("--y"),
                hueP:    hue.style.getPropertyValue("--hue-pct"),
            };
        });
        expect(props.rootHex).toBe("#ff8800");
        // #ff8800 -> h ~32, s=1, v=1 -> handle at (1, 0)
        expect(parseFloat(props.handleX)).toBeCloseTo(1, 1);
        expect(parseFloat(props.handleY)).toBeCloseTo(0, 1);
        expect(parseFloat(props.hueP)).toBeCloseTo(32 / 360, 1);
    });

    test("late-injected swatch is auto-discovered", async ({ page }) => {
        await mountWrapper(page, "color-picker", `
            <lite-color-picker id="cp" value="#000000"></lite-color-picker>
        `);
        await page.evaluate(() => {
            const btn = document.createElement("button");
            btn.id = "lateSw";
            btn.setAttribute("data-color-swatch", "");
            btn.setAttribute("data-color", "#00ff00");
            document.getElementById("cp").appendChild(btn);
        });
        await page.waitForTimeout(50);
        await page.click("#lateSw");
        await page.waitForTimeout(30);
        const hex = await page.evaluate(() => document.getElementById("cp").hex);
        expect(hex).toBe("#00ff00");
    });
});
