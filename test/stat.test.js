// stat.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createStat } from "../src/stat/index.js";

function mkEl() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
}

// =====================================================================
// Defaults + accessors
// =====================================================================

test("defaults to value=0, label='', unit='', trend=null", () => {
    setupDOM();
    const s = createStat();
    assert.equal(s.value(), 0);
    assert.equal(s.label(), "");
    assert.equal(s.unit(), "");
    assert.equal(s.trend(), null);
    s.destroy();
    teardownDOM();
});

test("default options are honored", () => {
    setupDOM();
    const s = createStat({
        defaultValue: 1234,
        defaultLabel: "Revenue",
        defaultUnit: "$",
        defaultTrend: { direction: "up", value: 12.5 },
    });
    assert.equal(s.value(), 1234);
    assert.equal(s.label(), "Revenue");
    assert.equal(s.unit(), "$");
    assert.deepEqual(s.trend(), { direction: "up", value: 12.5 });
    s.destroy();
    teardownDOM();
});

// =====================================================================
// Value tween
// =====================================================================

test("setValue with animationDuration=0 jumps displayValue immediately", () => {
    setupDOM();
    const s = createStat({ animationDuration: 0 });
    s.setValue(100);
    assert.equal(s.value(), 100);
    assert.equal(s.displayValue(), 100);
    s.destroy();
    teardownDOM();
});

test("setValue with animation: value is set immediately; displayValue tweens", async () => {
    setupDOM();
    const s = createStat({ animationDuration: 100 });
    s.setValue(100);
    assert.equal(s.value(), 100);
    // displayValue should still be near 0 right after setValue (tween hasn't run yet).
    const initialDisplay = s.displayValue();
    assert.ok(initialDisplay < 50);
    // Wait for tween to complete.
    await new Promise(r => setTimeout(r, 250));
    assert.equal(s.displayValue(), 100);
    s.destroy();
    teardownDOM();
});

test("setValue with same value is a no-op (no onValueChange)", () => {
    setupDOM();
    let fires = 0;
    const s = createStat({
        defaultValue: 50,
        onValueChange: () => { fires++; },
    });
    s.setValue(50);   // same -- no fire
    assert.equal(fires, 0);
    s.setValue(100);
    assert.equal(fires, 1);
    s.destroy();
    teardownDOM();
});

test("setValue rejects non-finite values", () => {
    setupDOM();
    const s = createStat({ defaultValue: 50 });
    s.setValue(NaN);
    s.setValue(Infinity);
    s.setValue("not a number");
    assert.equal(s.value(), 50);
    s.destroy();
    teardownDOM();
});

// =====================================================================
// Label + unit + trend
// =====================================================================

test("setLabel updates value", () => {
    setupDOM();
    const s = createStat();
    s.setLabel("Active Users");
    assert.equal(s.label(), "Active Users");
    s.destroy();
    teardownDOM();
});

test("setUnit updates value", () => {
    setupDOM();
    const s = createStat();
    s.setUnit("%");
    assert.equal(s.unit(), "%");
    s.destroy();
    teardownDOM();
});

test("setTrend stores normalized trend; invalid direction clamps to 'flat'", () => {
    setupDOM();
    const s = createStat();
    s.setTrend({ direction: "up", value: 5 });
    assert.deepEqual(s.trend(), { direction: "up", value: 5 });
    s.setTrend({ direction: "sideways", value: 3 });
    assert.deepEqual(s.trend(), { direction: "flat", value: 3 });
    s.setTrend(null);
    assert.equal(s.trend(), null);
    s.destroy();
    teardownDOM();
});

// =====================================================================
// attachRoot
// =====================================================================

test("attachRoot sets role=group + paints trend direction reactively", () => {
    setupDOM();
    const s = createStat({ defaultTrend: { direction: "up", value: 5 } });
    const root = mkEl();
    s.attachRoot(root);
    assert.equal(root.getAttribute("role"), "group");
    assert.equal(root.getAttribute("data-trend-direction"), "up");
    assert.equal(root.getAttribute("data-has-trend"), "");
    s.setTrend({ direction: "down", value: 3 });
    assert.equal(root.getAttribute("data-trend-direction"), "down");
    s.setTrend(null);
    assert.equal(root.hasAttribute("data-trend-direction"), false);
    assert.equal(root.hasAttribute("data-has-trend"), false);
    s.destroy();
    teardownDOM();
});

// =====================================================================
// attach* paint
// =====================================================================

test("attachLabel writes textContent reactively", () => {
    setupDOM();
    const s = createStat({ defaultLabel: "Initial" });
    const el = mkEl();
    s.attachLabel(el);
    assert.equal(el.textContent, "Initial");
    s.setLabel("Updated");
    assert.equal(el.textContent, "Updated");
    s.destroy();
    teardownDOM();
});

test("attachValue writes formatted displayValue + sets aria-live", () => {
    setupDOM();
    const s = createStat({ defaultValue: 1234, animationDuration: 0 });
    const el = mkEl();
    s.attachValue(el);
    assert.equal(el.getAttribute("aria-live"), "polite");
    assert.equal(el.textContent, "1,234");
    s.setValue(5000);
    assert.equal(el.textContent, "5,000");
    s.destroy();
    teardownDOM();
});

test("attachValue uses custom formatter when provided", () => {
    setupDOM();
    const s = createStat({
        defaultValue: 0.85,
        animationDuration: 0,
        formatter: (n) => Math.round(n * 100) + "%",
    });
    const el = mkEl();
    s.attachValue(el);
    assert.equal(el.textContent, "85%");
    s.destroy();
    teardownDOM();
});

test("attachUnit writes textContent reactively", () => {
    setupDOM();
    const s = createStat({ defaultUnit: "$" });
    const el = mkEl();
    s.attachUnit(el);
    assert.equal(el.textContent, "$");
    s.setUnit("EUR");
    assert.equal(el.textContent, "EUR");
    s.destroy();
    teardownDOM();
});

test("attachTrend writes formatted trend + data attributes", () => {
    setupDOM();
    const s = createStat({ defaultTrend: { direction: "up", value: 12.345 } });
    const el = mkEl();
    s.attachTrend(el);
    assert.equal(el.textContent, "+12.3%");
    assert.equal(el.getAttribute("data-trend-direction"), "up");
    assert.equal(el.getAttribute("data-trend-value"), "12.345");
    assert.equal(el.hasAttribute("data-hidden"), false);
    s.setTrend(null);
    assert.equal(el.getAttribute("data-hidden"), "");
    assert.equal(el.textContent, "");
    s.destroy();
    teardownDOM();
});

test("attachTrend uses custom trendFormatter when provided", () => {
    setupDOM();
    const s = createStat({
        defaultTrend: { direction: "up", value: 5 },
        trendFormatter: (t) => `${t.direction.toUpperCase()} by ${t.value}%`,
    });
    const el = mkEl();
    s.attachTrend(el);
    assert.equal(el.textContent, "UP by 5%");
    s.destroy();
    teardownDOM();
});

// =====================================================================
// Lifecycle
// =====================================================================

test("destroy cancels pending tween + detaches", () => {
    setupDOM();
    const s = createStat({ animationDuration: 200 });
    const el = mkEl();
    s.attachValue(el);
    s.setValue(1000);
    s.destroy();
    // No throws when interacting after destroy
    s.setValue(500);
    assert.equal(s.destroyed, true);
    teardownDOM();
});

test("destroy idempotent", () => {
    setupDOM();
    const s = createStat();
    s.destroy();
    s.destroy();
    assert.equal(s.destroyed, true);
    teardownDOM();
});
