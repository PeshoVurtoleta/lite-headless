// test-browser/tabs.spec.js
//
// Real-browser specs for createTabs. The 28 unit tests cover the math +
// state machine; these specs verify behavior that only works with real
// DOM event delivery + real focus + the controlled-attribute flow that
// only fires when the browser's attributeChangedCallback runs.

import { test, expect } from "@playwright/test";

test.describe("tabs", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/test-browser/fixtures/tabs.html");
        await page.waitForFunction(() => window.__tabsReady === true);
        await page.waitForTimeout(50);
    });

    test("initial ARIA state: roles, aria-selected, controls, labelledby", async ({ page }) => {
        const state = await page.evaluate(() => ({
            tablistRole: document.querySelector("#auto [data-tablist]").getAttribute("role"),
            tablistOrient: document.querySelector("#auto [data-tablist]").getAttribute("aria-orientation"),
            tabs: Array.from(document.querySelectorAll("#auto [data-tab]")).map(t => ({
                key: t.dataset.tab,
                role: t.getAttribute("role"),
                selected: t.getAttribute("aria-selected"),
                controls: t.getAttribute("aria-controls"),
                tabindex: t.getAttribute("tabindex"),
                disabled: t.hasAttribute("disabled"),
            })),
        }));
        expect(state.tablistRole).toBe("tablist");
        expect(state.tablistOrient).toBe("horizontal");
        expect(state.tabs[0].selected).toBe("true");
        expect(state.tabs[0].tabindex).toBe("0");
        expect(state.tabs[1].selected).toBe("false");
        expect(state.tabs[1].tabindex).toBe("-1");
        expect(state.tabs[2].disabled).toBe(true);
        // panels labelled by their tabs
        expect(state.tabs[0].controls).toBeTruthy();
    });

    test("click activates tab + reveals panel + hides others", async ({ page }) => {
        await page.click('#auto [data-tab="settings"]');
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => ({
            value: document.getElementById("auto").value,
            overviewHidden: document.querySelector('#auto [data-panel="overview"]').hasAttribute("hidden"),
            settingsHidden: document.querySelector('#auto [data-panel="settings"]').hasAttribute("hidden"),
        }));
        expect(state.value).toBe("settings");
        expect(state.overviewHidden).toBe(true);
        expect(state.settingsHidden).toBe(false);
    });

    test("automatic mode: ArrowRight on focused tab activates the next one", async ({ page }) => {
        await page.focus('#auto [data-tab="overview"]');
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("auto").value)).toBe("settings");
    });

    test("automatic mode: ArrowRight skips disabled tabs and wraps", async ({ page }) => {
        // current: overview. ArrowRight should land on settings, ArrowRight
        // again should wrap past disabled "billing" back to "overview".
        await page.focus('#auto [data-tab="overview"]');
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("auto").value)).toBe("overview");
    });

    test("automatic mode: Home jumps to first, End jumps to last enabled", async ({ page }) => {
        await page.click('#auto [data-tab="settings"]');
        await page.focus('#auto [data-tab="settings"]');
        await page.keyboard.press("Home");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("auto").value)).toBe("overview");
        await page.focus('#auto [data-tab="overview"]');
        await page.keyboard.press("End");
        await page.waitForTimeout(30);
        // billing is disabled, so End should land on settings (last enabled)
        expect(await page.evaluate(() => document.getElementById("auto").value)).toBe("settings");
    });

    test("manual mode: ArrowRight moves focus but does NOT activate", async ({ page }) => {
        await page.focus('#manual [data-tab="a"]');
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => ({
            value: document.getElementById("manual").value,
            focused: document.activeElement.dataset.tab,
        }));
        expect(state.value).toBe("a");           // value unchanged
        expect(state.focused).toBe("b");         // focus moved
    });

    test("manual mode: Enter on focused tab activates", async ({ page }) => {
        await page.focus('#manual [data-tab="a"]');
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("manual").value)).toBe("b");
    });

    test("manual mode: Space on focused tab activates", async ({ page }) => {
        await page.focus('#manual [data-tab="a"]');
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press(" ");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("manual").value)).toBe("b");
    });

    test("vertical orientation: ArrowDown advances + ignores ArrowRight", async ({ page }) => {
        await page.focus('#vert [data-tab="one"]');
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(30);
        // horizontal key on vertical tablist should be ignored
        expect(await page.evaluate(() => document.getElementById("vert").value)).toBe("one");

        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("vert").value)).toBe("two");
    });

    test("aria-orientation reflects orientation option", async ({ page }) => {
        const orient = await page.evaluate(() =>
            document.querySelector("#vert [data-tablist]").getAttribute("aria-orientation")
        );
        expect(orient).toBe("vertical");
    });

    test("disabled tab refuses activation via click", async ({ page }) => {
        const before = await page.evaluate(() => document.getElementById("auto").value);
        await page.click('#auto [data-tab="billing"]', { force: true });
        await page.waitForTimeout(30);
        const after = await page.evaluate(() => document.getElementById("auto").value);
        expect(after).toBe(before);
    });

    test("external setAttribute('value', ...) drives the active tab (route-sync use case)", async ({ page }) => {
        await page.evaluate(() => document.getElementById("auto").setAttribute("value", "settings"));
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => ({
            value: document.getElementById("auto").value,
            settingsHidden: document.querySelector('#auto [data-panel="settings"]').hasAttribute("hidden"),
        }));
        expect(state.value).toBe("settings");
        expect(state.settingsHidden).toBe(false);
    });

    test("property setter `host.value = key` activates the tab", async ({ page }) => {
        await page.evaluate(() => { document.getElementById("auto").value = "settings"; });
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("auto").value)).toBe("settings");
    });

    test("active key mirrors to host's `value` attribute on every change", async ({ page }) => {
        await page.click('#auto [data-tab="settings"]');
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("auto").getAttribute("value"))).toBe("settings");
    });

    test("valuechange CustomEvent fires on click with detail.value + detail.reason", async ({ page }) => {
        await page.evaluate(() => {
            window.__evt = null;
            document.getElementById("auto").addEventListener("valuechange", (e) => {
                window.__evt = { value: e.detail.value, reason: e.detail.reason };
            });
        });
        await page.click('#auto [data-tab="settings"]');
        await page.waitForTimeout(30);
        const evt = await page.evaluate(() => window.__evt);
        expect(evt.value).toBe("settings");
        expect(evt.reason).toBe("click");
    });

    test("dynamic tab insertion: appending a new [data-tab] wires it automatically", async ({ page }) => {
        await page.evaluate(() => {
            const tablist = document.querySelector("#auto [data-tablist]");
            const btn = document.createElement("button");
            btn.setAttribute("data-tab", "extra");
            btn.type = "button";
            btn.textContent = "Extra";
            tablist.appendChild(btn);

            const root = document.getElementById("auto");
            const panel = document.createElement("div");
            panel.setAttribute("data-panel", "extra");
            panel.textContent = "Extra content";
            root.appendChild(panel);
        });
        await page.waitForTimeout(80);   // MutationObserver microtask
        await page.click('#auto [data-tab="extra"]');
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("auto").value)).toBe("extra");
    });

    test("valuechange event fires exactly once per tab activation (v0.7.12 cascade fix)", async ({ page }) => {
        // Same cascade pattern as accordion: setValue then click used to
        // dispatch multiple valuechange events. v0.7.12 re-entrance
        // guard kills the cascade.
        await page.evaluate(() => document.getElementById("auto").setValue("overview"));
        await page.waitForTimeout(50);

        const events = await page.evaluate(async () => {
            const host = document.getElementById("auto");
            const captured = [];
            const listener = (e) => captured.push({ value: e.detail.value, reason: e.detail.reason });
            host.addEventListener("valuechange", listener);
            document.querySelector('#auto [data-tab="settings"]').click();
            await new Promise(r => setTimeout(r, 50));
            host.removeEventListener("valuechange", listener);
            return captured;
        });
        expect(events.length).toBe(1);
        expect(events[0].value).toBe("settings");
    });
});
