// test-browser/wrappers.spec.js
//
// Browser-only tests for the <lite-*> custom-element wrappers (v0.7.1).
// The behaviors under test all require a real DOM environment:
//
//   - MutationObserver wiring of dynamically-injected role elements
//   - Modal portal moving content out of the host's observed subtree, then
//     having the wrapper still receive mutations via the `follow()` escape
//     hatch on the role observer
//   - Datepicker view drilldown across three cell-pool layouts driven by
//     the primitive's `view` signal
//   - Declarative submenu pairing via `data-submenu` / `data-submenu-key`
//   - Reactive attribute sync (`setAttribute('value', ...)` flowing through
//     to the primitive's setValue)
//
// happy-dom can verify lifecycle (timers, signals, listener bookkeeping) but
// not these end-to-end flows -- portal moves, custom-element upgrades, and
// the timing of MutationObserver microtasks all rely on real browser plumbing.

import { test, expect } from "@playwright/test";

test.describe("wrappers", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/test-browser/fixtures/wrappers.html");
        // Custom elements upgrade synchronously inside connectedCallback once
        // the module finishes; the fixture flips a flag at end-of-script.
        await page.waitForFunction(() => window.__wrappersReady === true);
        // One extra microtask for the submenu pairing (queueMicrotask in the
        // menu wrapper).
        await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
    });

    test("combobox attaches items injected after mount", async ({ page }) => {
        // Initial state: 1 item in the listbox.
        await expect(page.locator("#cb [data-item]")).toHaveCount(1);

        // Inject a second item directly into the listbox. Done via evaluate
        // rather than clicking a button -- a click on an OUTSIDE button
        // would fire as a pointerdown the dialog/popover/menu wrappers'
        // outside-click listeners would see; the combobox doesn't dismiss
        // on inject-target clicks but the pattern is consistent across the
        // suite.
        await page.evaluate(() => {
            const lb = document.querySelector("#cb [data-listbox]");
            const li = document.createElement("li");
            li.setAttribute("data-item", "");
            li.setAttribute("data-value", "b");
            li.textContent = "Injected B";
            lb.appendChild(li);
        });
        // Give the MutationObserver microtask time to fire.
        await page.waitForTimeout(50);
        await expect(page.locator("#cb [data-item]")).toHaveCount(2);

        // Verify the new item went through attachItem (role="option" is set
        // by the primitive). Use a global selector -- once the combobox
        // opens, the listbox portals out of #cb.
        const newItemRole = await page.locator('#cb [data-item][data-value="b"]').getAttribute("role");
        expect(newItemRole).toBe("option");
    });

    test("datepicker drilldown: days -> months -> years renders all three pools", async ({ page }) => {
        // Initial view: days. The auto-render pool contains 42 day cells.
        await expect(page.locator("#dp [data-grid]")).toHaveAttribute("data-view", "days");
        const visibleDays = await page.locator("#dp [data-day]:not([style*='display: none'])").count();
        expect(visibleDays).toBe(42);

        // Click label to drill up to months.
        await page.click("#dp [data-month-label]");
        await expect(page.locator("#dp [data-grid]")).toHaveAttribute("data-view", "months");
        const monthLabels = await page.locator("#dp [data-month-cell]:not([style*='display: none'])").allTextContents();
        expect(monthLabels).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);

        // Click again to drill up to years. The decade containing 2026 runs
        // 2020-2029, padded with one year on each side (2019, 2030).
        await page.click("#dp [data-month-label]");
        await expect(page.locator("#dp [data-grid]")).toHaveAttribute("data-view", "years");
        const yearLabels = await page.locator("#dp [data-year-cell]:not([style*='display: none'])").allTextContents();
        expect(yearLabels.length).toBe(12);
        expect(yearLabels[0]).toBe("2019");
        expect(yearLabels[11]).toBe("2030");
    });

    test("datepicker value attribute sync: setAttribute flows into the primitive", async ({ page }) => {
        // Initial value comes from value="2026-06-15" on the host.
        const initialMonth = await page.evaluate(() => {
            const v = document.getElementById("dp").value;
            return v && v[0] ? v[0].getMonth() + 1 : null;
        });
        expect(initialMonth).toBe(6);

        // External setAttribute -- this is the bug v0.7.0 had where
        // observedAttributes was declared but never read.
        await page.evaluate(() => document.getElementById("dp").setAttribute("value", "2027-03-15"));
        await page.waitForTimeout(50);

        const newValue = await page.evaluate(() => {
            const v = document.getElementById("dp").value;
            if (!v || !v[0]) return null;
            const d = v[0];
            // Format with local methods -- d is local midnight, so
            // toISOString would shift the date back one in any positive-
            // UTC-offset timezone.
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        });
        expect(newValue).toBe("2027-03-15");
    });

    test("modal dialog wires close buttons injected into portaled content", async ({ page }) => {
        // Open the modal dialog. By default the wrapper sets
        // container: document.body, so the [data-content] div gets portaled
        // out of the host on open.
        await page.evaluate(() => document.getElementById("dlg").setOpen(true));
        await expect(page.locator("#dlg")).toHaveAttribute("open", "");

        // Inject a fresh close button into the (now-portaled) content via
        // evaluate. A page.click on an OUTSIDE button would be seen as an
        // outside-click by the dialog and close it before the observer
        // catches the injection.
        await page.evaluate(() => {
            const tgt = document.getElementById("injection-target");
            const btn = document.createElement("button");
            btn.setAttribute("data-close", "");
            btn.id = "injected-close";
            btn.textContent = "Cancel (injected)";
            tgt.appendChild(btn);
        });
        // Microtask + observer fire
        await page.waitForTimeout(50);
        await expect(page.locator("#injected-close")).toBeVisible();

        // Click the injected close button. If the wrapper didn't observe
        // the portaled content via roles.follow(), the click would do
        // nothing -- but with follow() in place the primitive's attachClose
        // ran and the click handler is bound.
        await page.click("#injected-close");
        await expect(page.locator("#dlg")).not.toHaveAttribute("open", "");
    });

    test("menu declarative submenu pairing via data-submenu / data-submenu-key", async ({ page }) => {
        // After the microtask-deferred pairing pass, the parent item that
        // declares data-submenu="recent" should have aria-haspopup="menu"
        // applied by the primitive's attachSubmenu.
        const haspopup = await page.locator('#m [data-item][data-submenu="recent"]').getAttribute("aria-haspopup");
        expect(haspopup).toBe("menu");

        // Open the root menu. After open, both the root menu surface AND
        // the submenu surface (lazily) portal to document.body, so they
        // are no longer descendants of their `<lite-menu>` host elements.
        // The number of open [data-menu] elements is the cleanest signal:
        // 1 after root opens, 2 after submenu opens via hover.
        await page.click("#m [data-trigger]");
        await expect(page.locator('[data-menu][data-open]')).toHaveCount(1);

        await page.hover('[data-item][data-submenu="recent"]');
        // submenuOpenDelay default = 100ms; wait generously for the timer.
        await expect(page.locator('[data-menu][data-open]')).toHaveCount(2);
    });
});
