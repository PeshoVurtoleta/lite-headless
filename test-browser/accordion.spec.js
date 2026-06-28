// test-browser/accordion.spec.js
//
// Real-browser specs for createAccordion. The 28 unit tests cover the
// math + state transitions; these specs verify behavior that requires
// real DOM event delivery, real focus, real `attributeChangedCallback`
// for the controlled-attribute flow, and dynamic-insertion via
// MutationObserver.

import { test, expect } from "@playwright/test";

test.describe("accordion", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/test-browser/fixtures/accordion.html");
        await page.waitForFunction(() => window.__accordionReady === true);
        await page.waitForTimeout(50);
    });

    test("initial ARIA: aria-expanded + role + aria-controls + aria-labelledby", async ({ page }) => {
        const state = await page.evaluate(() => {
            const trigA = document.querySelector('#single [data-accordion-trigger="a"]');
            const panelA = document.querySelector('#single [data-accordion-panel="a"]');
            return {
                trigExpanded: trigA.getAttribute("aria-expanded"),
                trigControls: trigA.getAttribute("aria-controls"),
                panelRole: panelA.getAttribute("role"),
                panelLabelledBy: panelA.getAttribute("aria-labelledby"),
                rootType: document.getElementById("single").getAttribute("data-accordion-type"),
            };
        });
        expect(state.trigExpanded).toBe("true");
        expect(state.trigControls).toBeTruthy();
        expect(state.panelRole).toBe("region");
        expect(state.panelLabelledBy).toBeTruthy();
        expect(state.rootType).toBe("single");
    });

    test("single mode: click on closed trigger opens it, closes the previous", async ({ page }) => {
        await page.click('#single [data-accordion-trigger="b"]');
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => ({
            value: document.getElementById("single").value,
            a: document.querySelector('#single [data-accordion-trigger="a"]').getAttribute("aria-expanded"),
            b: document.querySelector('#single [data-accordion-trigger="b"]').getAttribute("aria-expanded"),
            aPanel: document.querySelector('#single [data-accordion-panel="a"]').hasAttribute("data-open"),
            bPanel: document.querySelector('#single [data-accordion-panel="b"]').hasAttribute("data-open"),
        }));
        expect(state.value).toBe("b");
        expect(state.a).toBe("false");
        expect(state.b).toBe("true");
        expect(state.aPanel).toBe(false);
        expect(state.bPanel).toBe(true);
    });

    test("collapsible:true single: click on OPEN trigger closes it (value -> null)", async ({ page }) => {
        await page.click('#single [data-accordion-trigger="a"]');
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("single").value)).toBeNull();
    });

    test("collapsible:false single: click on OPEN trigger is a no-op", async ({ page }) => {
        await page.click('#nc [data-accordion-trigger="a"]');
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("nc").value)).toBe("a");
    });

    test("disabled trigger refuses click", async ({ page }) => {
        const before = await page.evaluate(() => document.getElementById("single").value);
        await page.click('#single [data-accordion-trigger="c"]', { force: true });
        await page.waitForTimeout(30);
        const after = await page.evaluate(() => document.getElementById("single").value);
        expect(after).toBe(before);
    });

    test("multiple mode: click adds + click again removes", async ({ page }) => {
        // initial value="x" -> ["x"]
        await page.click('#multi [data-accordion-trigger="y"]');
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("multi").value)).toEqual(["x", "y"]);

        await page.click('#multi [data-accordion-trigger="x"]');
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("multi").value)).toEqual(["y"]);
    });

    test("multiple mode: host attribute serialized as comma-separated", async ({ page }) => {
        await page.click('#multi [data-accordion-trigger="y"]');
        await page.click('#multi [data-accordion-trigger="z"]');
        await page.waitForTimeout(30);
        const attr = await page.evaluate(() => document.getElementById("multi").getAttribute("value"));
        expect(attr).toBe("x,y,z");
    });

    test("external setAttribute('value', 'a,c') drives multi mode", async ({ page }) => {
        await page.evaluate(() => document.getElementById("multi").setAttribute("value", "y,z"));
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => ({
            value: document.getElementById("multi").value,
            xExp: document.querySelector('#multi [data-accordion-trigger="x"]').getAttribute("aria-expanded"),
            yExp: document.querySelector('#multi [data-accordion-trigger="y"]').getAttribute("aria-expanded"),
            zExp: document.querySelector('#multi [data-accordion-trigger="z"]').getAttribute("aria-expanded"),
        }));
        expect(state.value).toEqual(["y", "z"]);
        expect(state.xExp).toBe("false");
        expect(state.yExp).toBe("true");
        expect(state.zExp).toBe("true");
    });

    test("ArrowDown on focused trigger moves focus to next enabled", async ({ page }) => {
        await page.focus('#single [data-accordion-trigger="a"]');
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(30);
        const focused = await page.evaluate(() => document.activeElement.getAttribute("data-accordion-trigger"));
        expect(focused).toBe("b");
    });

    test("ArrowDown skips disabled trigger + wraps to first", async ({ page }) => {
        // a -> b -> wrap (skip disabled c) -> a
        await page.focus('#single [data-accordion-trigger="a"]');
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(30);
        const focused = await page.evaluate(() => document.activeElement.getAttribute("data-accordion-trigger"));
        expect(focused).toBe("a");
    });

    test("ArrowUp wraps from first to last (and skips disabled)", async ({ page }) => {
        await page.focus('#single [data-accordion-trigger="a"]');
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(30);
        // c is disabled, so previous from a wraps to b (last enabled)
        const focused = await page.evaluate(() => document.activeElement.getAttribute("data-accordion-trigger"));
        expect(focused).toBe("b");
    });

    test("Home + End jump to first + last enabled", async ({ page }) => {
        await page.focus('#single [data-accordion-trigger="b"]');
        await page.keyboard.press("Home");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.activeElement.getAttribute("data-accordion-trigger"))).toBe("a");
        await page.keyboard.press("End");
        await page.waitForTimeout(30);
        // c disabled, so End is b
        expect(await page.evaluate(() => document.activeElement.getAttribute("data-accordion-trigger"))).toBe("b");
    });

    test("Enter on focused trigger activates (native button)", async ({ page }) => {
        await page.focus('#single [data-accordion-trigger="b"]');
        await page.keyboard.press("Enter");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("single").value)).toBe("b");
    });

    test("valuechange CustomEvent fires with detail.value + detail.reason", async ({ page }) => {
        await page.evaluate(() => {
            window.__evt = null;
            document.getElementById("single").addEventListener("valuechange", (e) => {
                window.__evt = { value: e.detail.value, reason: e.detail.reason };
            });
        });
        await page.click('#single [data-accordion-trigger="b"]');
        await page.waitForTimeout(30);
        const evt = await page.evaluate(() => window.__evt);
        expect(evt.value).toBe("b");
        expect(evt.reason).toBe("click");
    });

    test("setDisabled at runtime on open single key closes it (auto-fallback)", async ({ page }) => {
        await page.evaluate(() => document.getElementById("single").setDisabled("a", true));
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("single").value)).toBeNull();
    });

    test("dynamic item insertion: appending a new item wires it automatically", async ({ page }) => {
        await page.evaluate(() => {
            const root = document.getElementById("single");
            const item = document.createElement("div");
            item.setAttribute("data-accordion-item", "extra");
            item.innerHTML =
                '<button data-accordion-trigger="extra" type="button">Extra</button>' +
                '<div data-accordion-panel="extra"><div>extra content</div></div>';
            root.appendChild(item);
        });
        await page.waitForTimeout(80);   // mutation observer microtask
        await page.click('#single [data-accordion-trigger="extra"]');
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("single").value)).toBe("extra");
    });

    test("transition lock: rapid clicks during animation are dropped", async ({ page }) => {
        // Inject a real CSS transition. The fixture's CSS uses 0ms for
        // test speed; this spec needs a measurable duration so the lock
        // actually arms (it auto-detects from computed transition-
        // duration; ms <= 0 = no lock).
        await page.evaluate(() => {
            const style = document.createElement("style");
            style.textContent =
                '[data-accordion-panel] { transition: grid-template-rows 200ms ease !important; }';
            document.head.appendChild(style);
        });
        await page.waitForTimeout(100);

        // Start from null (closed) so the first click below is an open.
        // Then wait WELL past the 200ms lock so the next click isn't
        // pre-gated. Generous because worker contention can stretch
        // browser-tick delivery in unpredictable ways.
        await page.evaluate(() => document.getElementById("single").setValue(null));
        await page.waitForTimeout(400);

        // Rapid-fire 5 clicks. The FIRST opens; the next four hit the
        // transition lock and are dropped. Final state should be "a"
        // (the first click), not whatever click-5 would have produced
        // if all 5 had run (would be null in collapsible mode:
        // open/close/open/close/open).
        //
        // We dispatch all five clicks inside one synchronous
        // page.evaluate. If we used five separate playwright RPC
        // calls, each can take 30-100ms under worker contention,
        // stretching the burst past the 200ms transition lock window
        // and letting click 4 or 5 actually run.
        await page.evaluate(() => {
            const t = document.querySelector('#single [data-accordion-trigger="a"]');
            for (let i = 0; i < 5; i++) t.click();
        });
        await page.waitForTimeout(50);   // still inside the 200ms lock window

        const midValue = await page.evaluate(() => document.getElementById("single").value);
        // The user-visible bug was rapid clicks producing flicker, i.e.
        // the value cycling open/close several times. With the lock,
        // value must stay at "a" through the burst.
        expect(midValue).toBe("a");

        // Wait past the lock; the next click should be honored again.
        await page.waitForTimeout(260);
        await page.evaluate(() => document.querySelector('#single [data-accordion-trigger="a"]').click());
        await page.waitForTimeout(50);
        const after = await page.evaluate(() => document.getElementById("single").value);
        // In collapsible mode, this click toggles "a" closed -> null.
        expect(after).toBeNull();
    });

    test("transition lock: programmatic setValue is NOT guarded", async ({ page }) => {
        // Even with a transition active, programmatic API is authoritative.
        await page.evaluate(() => {
            const style = document.createElement("style");
            style.textContent =
                '[data-accordion-panel] { transition: grid-template-rows 200ms ease !important; }';
            document.head.appendChild(style);
        });
        await page.waitForTimeout(30);
        // Click "a" to start its transition
        await page.click('#single [data-accordion-trigger="a"]');
        await page.waitForTimeout(20);
        // While transitioning, setValue should still work
        await page.evaluate(() => document.getElementById("single").setValue("b"));
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("single").value)).toBe("b");
    });

    test("valuechange event fires exactly once per click (v0.7.12 cascade fix)", async ({ page }) => {
        // Pre-v0.7.12, the sequence setValue(null) -> 300ms wait -> click
        // triggered a cascade where the useAttr effect re-entered twice
        // during the click's onValueChange, dispatching THREE valuechange
        // CustomEvents per single click (with intermediate stale `detail`
        // values). Final primitive.value was correct but event-driven
        // consumers got confused.
        //
        // The fix is a re-entrance flag in the wrapper that suppresses
        // the useAttr effect while we're inside our own setAttribute.
        await page.evaluate(() => document.getElementById("single").setValue(null));
        await page.waitForTimeout(50);

        const events = await page.evaluate(async () => {
            const host = document.getElementById("single");
            const captured = [];
            const listener = (e) => captured.push({ value: e.detail.value, reason: e.detail.reason });
            host.addEventListener("valuechange", listener);
            document.querySelector('#single [data-accordion-trigger="a"]')
                .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            await new Promise(r => setTimeout(r, 50));
            host.removeEventListener("valuechange", listener);
            return captured;
        });

        // Exactly one event with reason "click" and value "a"
        expect(events.length).toBe(1);
        expect(events[0].reason).toBe("click");
        expect(events[0].value).toBe("a");
        expect(await page.evaluate(() => document.getElementById("single").value)).toBe("a");
    });

    test("valuechange event fires exactly once when value attribute changes externally", async ({ page }) => {
        // External setAttribute (consumer-driven, route sync, etc.)
        // should produce exactly one valuechange event with reason
        // "attribute". The cascade guard must NOT block legitimate
        // external attribute writes -- only our own self-mirror writes.
        const events = await page.evaluate(async () => {
            const host = document.getElementById("single");
            const captured = [];
            const listener = (e) => captured.push({ value: e.detail.value, reason: e.detail.reason });
            host.addEventListener("valuechange", listener);
            host.setAttribute("value", "b");
            await new Promise(r => setTimeout(r, 50));
            host.removeEventListener("valuechange", listener);
            return captured;
        });
        expect(events.length).toBe(1);
        expect(events[0].reason).toBe("attribute");
        expect(events[0].value).toBe("b");
    });
});
