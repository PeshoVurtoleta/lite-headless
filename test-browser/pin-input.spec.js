// Browser tests for pin-input primitive
import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/pin-input.html";

test.describe("pin-input", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__pinReady === true);
        await page.waitForTimeout(50);
    });

    test("initial state: 6 input boxes wired with correct attrs", async ({ page }) => {
        const data = await page.evaluate(() => {
            const inputs = document.querySelectorAll("#pin-numeric [data-pin-input]");
            return {
                count: inputs.length,
                firstAttrs: {
                    inputmode: inputs[0].getAttribute("inputmode"),
                    autocomplete: inputs[0].getAttribute("autocomplete"),
                    maxlength: inputs[0].getAttribute("maxlength"),
                    aria: inputs[0].getAttribute("aria-label"),
                },
                lastAttrs: {
                    autocomplete: inputs[5].getAttribute("autocomplete"),  // null for non-first
                    aria: inputs[5].getAttribute("aria-label"),
                },
                rootState: document.querySelector("#pin-numeric").getAttribute("data-pin-state"),
            };
        });
        expect(data.count).toBe(6);
        expect(data.firstAttrs.inputmode).toBe("numeric");
        expect(data.firstAttrs.autocomplete).toBe("one-time-code");
        expect(data.firstAttrs.maxlength).toBe("1");
        expect(data.firstAttrs.aria).toBe("Digit 1 of 6");
        expect(data.lastAttrs.autocomplete).toBe(null);
        expect(data.lastAttrs.aria).toBe("Digit 6 of 6");
        expect(data.rootState).toBe("incomplete");
    });

    test("typing digits one-by-one advances focus", async ({ page }) => {
        // Click first box to focus it
        await page.locator("#pin-numeric [data-pin-index='0']").click();
        await page.keyboard.type("1");
        await page.waitForTimeout(50);
        let focused = await page.evaluate(() => document.activeElement.getAttribute("data-pin-index"));
        expect(focused).toBe("1");

        await page.keyboard.type("2");
        await page.waitForTimeout(50);
        focused = await page.evaluate(() => document.activeElement.getAttribute("data-pin-index"));
        expect(focused).toBe("2");

        // Type remaining digits
        await page.keyboard.type("3456");
        await page.waitForTimeout(100);

        const state = await page.evaluate(() => ({
            value: document.getElementById("pin-numeric").value,
            complete: document.getElementById("pin-numeric").isComplete,
            rootState: document.querySelector("#pin-numeric").getAttribute("data-pin-state"),
        }));
        expect(state.value).toBe("123456");
        expect(state.complete).toBe(true);
        expect(state.rootState).toBe("complete");
    });

    test("non-digit keys are blocked in numeric mode", async ({ page }) => {
        await page.locator("#pin-numeric [data-pin-index='0']").click();
        await page.keyboard.type("a");
        await page.waitForTimeout(50);
        const value = await page.evaluate(() => document.getElementById("pin-numeric").value);
        expect(value).toBe("");
    });

    test("Backspace on filled box clears it + stays focused", async ({ page }) => {
        await page.evaluate(() => document.getElementById("pin-numeric").setValue("12345"));
        await page.waitForTimeout(80);
        await page.locator("#pin-numeric [data-pin-index='4']").focus();
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(50);
        const state = await page.evaluate(() => ({
            value: document.getElementById("pin-numeric").value,
            focusedIdx: document.activeElement.getAttribute("data-pin-index"),
        }));
        expect(state.value).toBe("1234");
        expect(state.focusedIdx).toBe("4");
    });

    test("Backspace on empty box moves to previous + clears it", async ({ page }) => {
        await page.evaluate(() => document.getElementById("pin-numeric").setValue("12"));
        await page.waitForTimeout(80);
        await page.locator("#pin-numeric [data-pin-index='2']").focus();
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(50);
        const state = await page.evaluate(() => ({
            value: document.getElementById("pin-numeric").value,
            focusedIdx: document.activeElement.getAttribute("data-pin-index"),
        }));
        expect(state.value).toBe("1");
        expect(state.focusedIdx).toBe("1");
    });

    test("ArrowLeft / ArrowRight navigate without writing", async ({ page }) => {
        await page.locator("#pin-numeric [data-pin-index='2']").click();
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(30);
        let focused = await page.evaluate(() => document.activeElement.getAttribute("data-pin-index"));
        expect(focused).toBe("1");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(30);
        focused = await page.evaluate(() => document.activeElement.getAttribute("data-pin-index"));
        expect(focused).toBe("3");
        const value = await page.evaluate(() => document.getElementById("pin-numeric").value);
        expect(value).toBe("");
    });

    test("Home / End jump to first / last box", async ({ page }) => {
        await page.locator("#pin-numeric [data-pin-index='3']").click();
        await page.keyboard.press("Home");
        await page.waitForTimeout(30);
        let focused = await page.evaluate(() => document.activeElement.getAttribute("data-pin-index"));
        expect(focused).toBe("0");
        await page.keyboard.press("End");
        await page.waitForTimeout(30);
        focused = await page.evaluate(() => document.activeElement.getAttribute("data-pin-index"));
        expect(focused).toBe("5");
    });

    test("complete CustomEvent fires once on incomplete -> complete edge", async ({ page }) => {
        const events = [];
        await page.exposeFunction("recordEvent", (v) => events.push(v));
        await page.evaluate(() => {
            document.getElementById("pin-numeric").addEventListener("complete", (e) => {
                window.recordEvent(e.detail.value);
            });
        });
        await page.evaluate(() => document.getElementById("pin-numeric").setValue("123456"));
        await page.waitForTimeout(80);
        expect(events).toEqual(["123456"]);

        // Clearing + setting again should fire AGAIN
        await page.evaluate(() => document.getElementById("pin-numeric").clear());
        await page.waitForTimeout(30);
        await page.evaluate(() => document.getElementById("pin-numeric").setValue("654321"));
        await page.waitForTimeout(50);
        expect(events).toEqual(["123456", "654321"]);
    });

    test("programmatic setValue fills DOM inputs + state.complete", async ({ page }) => {
        await page.click("#b-numeric-fill");
        await page.waitForTimeout(80);
        const data = await page.evaluate(() => {
            const inputs = document.querySelectorAll("#pin-numeric [data-pin-input]");
            return {
                values: Array.from(inputs).map(i => i.value),
                state: document.querySelector("#pin-numeric").getAttribute("data-pin-state"),
            };
        });
        expect(data.values).toEqual(["1", "2", "3", "4", "5", "6"]);
        expect(data.state).toBe("complete");
    });

    test("clear button resets DOM + state", async ({ page }) => {
        await page.click("#b-numeric-fill");
        await page.waitForTimeout(50);
        await page.click("#b-numeric-clear");
        await page.waitForTimeout(50);
        const data = await page.evaluate(() => {
            const inputs = document.querySelectorAll("#pin-numeric [data-pin-input]");
            return {
                values: Array.from(inputs).map(i => i.value),
                state: document.querySelector("#pin-numeric").getAttribute("data-pin-state"),
            };
        });
        expect(data.values).toEqual(["", "", "", "", "", ""]);
        expect(data.state).toBe("incomplete");
    });

    test("alphanumeric mode accepts letters + digits", async ({ page }) => {
        await page.locator("#pin-alpha [data-pin-index='0']").click();
        await page.keyboard.type("A1B2");
        await page.waitForTimeout(80);
        const data = await page.evaluate(() => ({
            value: document.getElementById("pin-alpha").value,
            complete: document.getElementById("pin-alpha").isComplete,
        }));
        expect(data.value).toBe("A1B2");
        expect(data.complete).toBe(true);
    });
});
