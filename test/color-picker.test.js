// Tests: color-picker.
//
// Split into two sections:
//   1. Pure conversion math — runs without a DOM. Verifies hex/rgb/hsv/
//      hsl/oklch round-trips and known-fixture-point conversions
//      (white/black/red/green/blue/gray, plus a couple specific OKLCH
//      values from CSS Color 4 examples).
//   2. Primitive behavior — pulls in JSDOM. Verifies attach/detach,
//      reactive paint of CSS custom properties, drag math at known
//      points, setHsv/setRgb/setHex flow, and the commit/valuechange
//      callback dispatch.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import {
    createColorPicker,
    hsvToRgb, rgbToHsv,
    parseHex,
    srgbToLinear, linearToSrgb,
    linearRgbToOklab, oklabToLinearRgb,
    rgbToOklch, oklchToRgb,
    hsvToHsl,
} from "../src/color-picker/index.js";

// ─── 1. Pure conversion math ─────────────────────────────────────────

test("hsvToRgb: known points", () => {
    assert.deepEqual(hsvToRgb(0,   0, 1), [255, 255, 255]);    // white
    assert.deepEqual(hsvToRgb(0,   0, 0), [0,   0,   0]);      // black
    assert.deepEqual(hsvToRgb(0,   1, 1), [255, 0,   0]);      // red
    assert.deepEqual(hsvToRgb(120, 1, 1), [0,   255, 0]);      // green
    assert.deepEqual(hsvToRgb(240, 1, 1), [0,   0,   255]);    // blue
    assert.deepEqual(hsvToRgb(0,   0, 0.5), [128, 128, 128]);  // gray
});

test("rgbToHsv: known points", () => {
    const [h1, s1, v1] = rgbToHsv(255, 0, 0, 0);
    assert.equal(h1, 0);
    assert.equal(s1, 1);
    assert.equal(v1, 1);
    const [h2, s2, v2] = rgbToHsv(0, 255, 0, 0);
    assert.equal(h2, 120);
    assert.equal(s2, 1);
    assert.equal(v2, 1);
});

test("rgbToHsv preserves prevH on grayscale", () => {
    const [h] = rgbToHsv(128, 128, 128, 270);
    assert.equal(h, 270);    // gray has no canonical hue; should keep prev
});

test("hsvToRgb -> rgbToHsv roundtrip for primary points", () => {
    const points = [
        [0,   1,   1],
        [60,  1,   1],
        [120, 1,   1],
        [180, 1,   1],
        [240, 1,   1],
        [300, 1,   1],
        [45,  0.5, 0.8],
        [200, 0.3, 0.9],
    ];
    for (const [h, s, v] of points) {
        const [r, g, b] = hsvToRgb(h, s, v);
        const [h2, s2, v2] = rgbToHsv(r, g, b, h);
        // Allow integer-quantization slop (RGB is 8-bit).
        assert.ok(Math.abs(h - h2) < 2 || Math.abs((h - h2 + 360) % 360) < 2,
            `h roundtrip drift > 2deg: ${h} -> ${h2}`);
        assert.ok(Math.abs(s - s2) < 0.01, `s drift > 0.01: ${s} -> ${s2}`);
        assert.ok(Math.abs(v - v2) < 0.01, `v drift > 0.01: ${v} -> ${v2}`);
    }
});

test("parseHex: all valid formats", () => {
    assert.deepEqual(parseHex("#f00"),      [255, 0, 0, 1]);
    assert.deepEqual(parseHex("f00"),       [255, 0, 0, 1]);
    assert.deepEqual(parseHex("#ff0000"),   [255, 0, 0, 1]);
    assert.deepEqual(parseHex("#7dd3fc"),   [125, 211, 252, 1]);
    assert.deepEqual(parseHex("#ff000080"), [255, 0, 0, 0x80 / 255]);
    // 4-digit form: #rgba
    const four = parseHex("#f008");
    assert.deepEqual(four.slice(0, 3), [255, 0, 0]);
    assert.ok(Math.abs(four[3] - 0x88 / 255) < 1e-6);
});

test("parseHex: invalid input returns null", () => {
    assert.equal(parseHex("not-a-color"), null);
    assert.equal(parseHex("#gg"), null);
    assert.equal(parseHex("#12345"), null);
    assert.equal(parseHex(""), null);
    assert.equal(parseHex(null), null);
});

test("srgbToLinear / linearToSrgb roundtrip", () => {
    for (const c of [0, 0.04045, 0.5, 0.75, 1]) {
        const l = srgbToLinear(c);
        const back = linearToSrgb(l);
        assert.ok(Math.abs(back - c) < 1e-6, `roundtrip drift @ c=${c}: ${back}`);
    }
});

test("oklab <-> linear sRGB roundtrip", () => {
    const inputs = [
        [0.1, 0.4, 0.8],
        [0.5, 0.5, 0.5],
        [1, 0.5, 0.2],
    ];
    for (const [r, g, b] of inputs) {
        const [L, a, bb] = linearRgbToOklab(r, g, b);
        const [r2, g2, b2] = oklabToLinearRgb(L, a, bb);
        assert.ok(Math.abs(r - r2) < 1e-6);
        assert.ok(Math.abs(g - g2) < 1e-6);
        assert.ok(Math.abs(b - b2) < 1e-6);
    }
});

test("rgbToOklch: known values from CSS Color 4 spec", () => {
    // sRGB red: 255,0,0
    const [L1, C1, h1] = rgbToOklch(255, 0, 0);
    // CSS Color 4 references: red ~ oklch(0.628 0.258 29.234)
    assert.ok(Math.abs(L1 - 0.628) < 0.01, `L=${L1}`);
    assert.ok(Math.abs(C1 - 0.258) < 0.01, `C=${C1}`);
    assert.ok(Math.abs(h1 - 29.234) < 0.1, `h=${h1}`);
});

test("oklchToRgb roundtrip from rgbToOklch", () => {
    const cases = [
        [255, 128, 64],
        [50, 200, 100],
        [125, 211, 252],
        [0, 0, 0],
        [255, 255, 255],
    ];
    for (const [r, g, b] of cases) {
        const [L, C, h] = rgbToOklch(r, g, b);
        const [r2, g2, b2] = oklchToRgb(L, C, h);
        assert.ok(Math.abs(r - r2) <= 1, `r roundtrip ${r} -> ${r2}`);
        assert.ok(Math.abs(g - g2) <= 1, `g roundtrip ${g} -> ${g2}`);
        assert.ok(Math.abs(b - b2) <= 1, `b roundtrip ${b} -> ${b2}`);
    }
});

test("hsvToHsl: black, white, gray", () => {
    const [, sBlack, lBlack] = hsvToHsl(0, 0, 0);
    assert.equal(sBlack, 0);
    assert.equal(lBlack, 0);
    const [, sWhite, lWhite] = hsvToHsl(0, 0, 1);
    assert.equal(sWhite, 0);
    assert.equal(lWhite, 1);
    const [, sGray, lGray] = hsvToHsl(0, 0, 0.5);
    assert.equal(sGray, 0);
    assert.equal(lGray, 0.5);
});

// ─── 2. Primitive behavior ───────────────────────────────────────────

test("defaults: with no opts, color is white (h=0,s=1,v=1 -- red, actually)", () => {
    setupDOM();
    const cp = createColorPicker();
    // Default seeds h=0, s=1, v=1, a=1 -> pure red
    assert.equal(cp.hue(), 0);
    assert.equal(cp.saturation(), 1);
    assert.equal(cp.brightness(), 1);
    assert.equal(cp.alpha(), 1);
    assert.equal(cp.hex(), "#ff0000");
    cp.destroy();
    teardownDOM();
});

test("defaultHex seeds the internal HSV state", () => {
    setupDOM();
    const cp = createColorPicker({ defaultHex: "#7dd3fc" });
    assert.equal(cp.hex(), "#7dd3fc");
    const rgb = cp.rgb();
    assert.equal(rgb.r, 125);
    assert.equal(rgb.g, 211);
    assert.equal(rgb.b, 252);
    cp.destroy();
    teardownDOM();
});

test("setHue clamps to [0, 360) with wraparound", () => {
    setupDOM();
    const cp = createColorPicker();
    cp.setHue(720);
    assert.equal(cp.hue(), 0);
    cp.setHue(-30);
    assert.equal(cp.hue(), 330);
    cp.destroy();
    teardownDOM();
});

test("setSaturation/setBrightness clamp to [0, 1]", () => {
    setupDOM();
    const cp = createColorPicker();
    cp.setSaturation(1.5);
    assert.equal(cp.saturation(), 1);
    cp.setSaturation(-0.2);
    assert.equal(cp.saturation(), 0);
    cp.setBrightness(2);
    assert.equal(cp.brightness(), 1);
    cp.destroy();
    teardownDOM();
});

test("setHex parses + sets; returns true on success", () => {
    setupDOM();
    const cp = createColorPicker();
    assert.equal(cp.setHex("#00ff00"), true);
    assert.equal(cp.hex(), "#00ff00");
    assert.equal(cp.setHex("not-a-color"), false);
    // Color unchanged after invalid input
    assert.equal(cp.hex(), "#00ff00");
    cp.destroy();
    teardownDOM();
});

test("setOklch updates RGB; roundtrip via cp.oklch()", () => {
    setupDOM();
    const cp = createColorPicker();
    cp.setOklch({ l: 0.628, c: 0.258, h: 29.234 });
    const rgb = cp.rgb();
    // OKLCH red maps back to roughly sRGB red (255, 0, 0)
    assert.ok(Math.abs(rgb.r - 255) <= 1);
    assert.ok(Math.abs(rgb.g - 0)   <= 2);
    assert.ok(Math.abs(rgb.b - 0)   <= 2);
    cp.destroy();
    teardownDOM();
});

test("onValueChange fires with reason on each setter", () => {
    setupDOM();
    const reasons = [];
    const cp = createColorPicker({
        onValueChange: (state, reason) => { reasons.push(reason); },
    });
    cp.setHue(120);
    cp.setSaturation(0.5);
    cp.setBrightness(0.3);
    cp.setAlpha(0.8);
    assert.deepEqual(reasons, ["setHue", "setSaturation", "setBrightness", "setAlpha"]);
    cp.destroy();
    teardownDOM();
});

test("onValueChange does NOT fire when setter is a no-op", () => {
    setupDOM();
    const reasons = [];
    const cp = createColorPicker({
        defaultHex: "#ff0000",
        onValueChange: (state, reason) => { reasons.push(reason); },
    });
    cp.setHue(0);             // already 0
    cp.setSaturation(1);      // already 1
    cp.setBrightness(1);      // already 1
    assert.equal(reasons.length, 0);
    cp.destroy();
    teardownDOM();
});

test("alpha:false disables alpha mutations", () => {
    setupDOM();
    const cp = createColorPicker({ alpha: false });
    cp.setAlpha(0.5);
    assert.equal(cp.alpha(), 1);    // unchanged
    cp.destroy();
    teardownDOM();
});

test("attachRoot paints --color-hex / --color-h / --color-r / etc.", () => {
    setupDOM();
    const cp = createColorPicker({ defaultHex: "#7dd3fc" });
    const root = document.createElement("div");
    document.body.appendChild(root);
    cp.attachRoot(root);
    // The effect runs once synchronously on attach.
    assert.equal(root.style.getPropertyValue("--color-hex"), "#7dd3fc");
    assert.equal(root.style.getPropertyValue("--color-r"), "125");
    assert.equal(root.style.getPropertyValue("--color-g"), "211");
    assert.equal(root.style.getPropertyValue("--color-b"), "252");
    cp.destroy();
    teardownDOM();
});

test("attachArea + attachAreaHandle paint --x / --y per saturation/brightness", () => {
    setupDOM();
    const cp = createColorPicker({ defaultHex: "#ff0000" });
    const area = document.createElement("div");
    const handle = document.createElement("div");
    document.body.appendChild(area);
    document.body.appendChild(handle);
    cp.attachArea(area);
    cp.attachAreaHandle(handle);
    // Red is s=1, v=1 -> handle at (1, 0)
    assert.equal(handle.style.getPropertyValue("--x"), "1.0000");
    assert.equal(handle.style.getPropertyValue("--y"), "0.0000");
    cp.setBrightness(0.5);
    assert.equal(handle.style.getPropertyValue("--y"), "0.5000");
    cp.setSaturation(0.25);
    assert.equal(handle.style.getPropertyValue("--x"), "0.2500");
    cp.destroy();
    teardownDOM();
});

test("attachHueSlider paints --hue-pct", () => {
    setupDOM();
    const cp = createColorPicker();
    const rail = document.createElement("div");
    document.body.appendChild(rail);
    cp.attachHueSlider(rail);
    cp.setHue(180);
    assert.equal(rail.style.getPropertyValue("--hue-pct"), "0.5000");
    cp.setHue(90);
    assert.equal(rail.style.getPropertyValue("--hue-pct"), "0.2500");
    cp.destroy();
    teardownDOM();
});

test("attachAlphaSlider mirrors --color-hex + --alpha", () => {
    setupDOM();
    const cp = createColorPicker({ defaultHex: "#7dd3fc" });
    const rail = document.createElement("div");
    document.body.appendChild(rail);
    cp.attachAlphaSlider(rail);
    cp.setAlpha(0.5);
    assert.equal(rail.style.getPropertyValue("--alpha"), "0.5000");
    assert.equal(rail.style.getPropertyValue("--color-hex"), "#7dd3fc");
    cp.destroy();
    teardownDOM();
});

test("attachSwatch click sets the color and fires both events", () => {
    setupDOM();
    const valueReasons = [];
    const commitReasons = [];
    const cp = createColorPicker({
        onValueChange: (_, reason) => valueReasons.push(reason),
        onCommit:      (_, reason) => commitReasons.push(reason),
    });
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    cp.attachSwatch(btn, "#00aaff");
    btn.click();
    assert.equal(cp.hex(), "#00aaff");
    assert.ok(valueReasons.includes("swatch"));
    assert.deepEqual(commitReasons, ["swatch"]);
    cp.destroy();
    teardownDOM();
});

test("destroy is idempotent + clears all attached elements", () => {
    setupDOM();
    const cp = createColorPicker();
    const root = document.createElement("div");
    const area = document.createElement("div");
    document.body.appendChild(root);
    document.body.appendChild(area);
    cp.attachRoot(root);
    cp.attachArea(area);
    cp.destroy();
    cp.destroy();    // should not throw
    assert.equal(cp.destroyed, true);
    // Custom props cleared
    assert.equal(root.style.getPropertyValue("--color-hex"), "");
    assert.equal(area.style.getPropertyValue("--saturation"), "");
    teardownDOM();
});

test("attach detach off() removes the data marker", () => {
    setupDOM();
    const cp = createColorPicker();
    const area = document.createElement("div");
    document.body.appendChild(area);
    const off = cp.attachArea(area);
    assert.equal(area.hasAttribute("data-color-area"), true);
    off();
    assert.equal(area.hasAttribute("data-color-area"), false);
    cp.destroy();
    teardownDOM();
});

test("setRgb preserves hue when transitioning through grayscale", () => {
    setupDOM();
    const cp = createColorPicker({ defaultHsv: { h: 200, s: 1, v: 1 } });
    // Move to gray
    cp.setRgb({ r: 128, g: 128, b: 128 });
    assert.equal(cp.saturation(), 0);
    // Hue preserved
    assert.equal(cp.hue(), 200);
    cp.destroy();
    teardownDOM();
});
