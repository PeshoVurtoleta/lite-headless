// test-browser/tree.spec.js
//
// Real-browser specs for <lite-tree>. The 35 unit tests cover the
// state math + flattening logic; these specs verify the wrapper's
// DOM-driven parent inference, real focus tracking through the
// roving-focus helper, controlled attributes, and click activation.

import { test, expect } from "@playwright/test";

test.describe("tree", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/test-browser/fixtures/tree.html");
        await page.waitForFunction(() => window.__treeReady === true);
        await page.waitForTimeout(80);
    });

    test("initial ARIA: role tree, role treeitem, aria-level + setsize + posinset", async ({ page }) => {
        const state = await page.evaluate(() => {
            const root = document.querySelector("#single > ul");
            const src = document.querySelector('[data-tree-node="src"]');
            const components = document.querySelector('[data-tree-node="src/components"]');
            const button = document.querySelector('[data-tree-node="src/components/Button.tsx"]');
            return {
                rootRole: root.getAttribute("role"),
                srcRole: src.getAttribute("role"),
                srcLevel: src.getAttribute("aria-level"),
                srcSetSize: src.getAttribute("aria-setsize"),
                srcPosInSet: src.getAttribute("aria-posinset"),
                componentsLevel: components.getAttribute("aria-level"),
                buttonLevel: button.getAttribute("aria-level"),
                buttonSetSize: button.getAttribute("aria-setsize"),
            };
        });
        expect(state.rootRole).toBe("tree");
        expect(state.srcRole).toBe("treeitem");
        expect(state.srcLevel).toBe("1");
        expect(state.srcSetSize).toBe("3");      // src, docs, package.json
        expect(state.srcPosInSet).toBe("1");
        expect(state.componentsLevel).toBe("2");
        expect(state.buttonLevel).toBe("3");
        expect(state.buttonSetSize).toBe("3");   // Button, Card, Disabled
    });

    test("initial state: aria-expanded only on parents (leaves omit it)", async ({ page }) => {
        const state = await page.evaluate(() => ({
            srcExpanded: document.querySelector('[data-tree-node="src"]').getAttribute("aria-expanded"),
            srcState: document.querySelector('[data-tree-node="src"]').hasAttribute("data-open"),
            utilsExpanded: document.querySelector('[data-tree-node="src/utils"]').getAttribute("aria-expanded"),
            utilsState: document.querySelector('[data-tree-node="src/utils"]').hasAttribute("data-open"),
            buttonHasExpanded: document.querySelector('[data-tree-node="src/components/Button.tsx"]').hasAttribute("aria-expanded"),
            buttonState: document.querySelector('[data-tree-node="src/components/Button.tsx"]').hasAttribute("data-leaf"),
        }));
        expect(state.srcExpanded).toBe("true");
        expect(state.srcState).toBe(true);
        expect(state.utilsExpanded).toBe("false");
        expect(state.utilsState).toBe(false);
        expect(state.buttonHasExpanded).toBe(false);
        expect(state.buttonState).toBe(true);
    });

    test("initial selected: Button.tsx has aria-selected=true", async ({ page }) => {
        const sel = await page.evaluate(() => ({
            button: document.querySelector('[data-tree-node="src/components/Button.tsx"]').getAttribute("aria-selected"),
            card: document.querySelector('[data-tree-node="src/components/Card.tsx"]').getAttribute("aria-selected"),
        }));
        expect(sel.button).toBe("true");
        expect(sel.card).toBe("false");
    });

    test("click on leaf selects it (single mode)", async ({ page }) => {
        // Expand src/utils first so clsx.ts is visible to playwright
        await page.evaluate(() => document.getElementById("single").expand("src/utils"));
        await page.waitForTimeout(30);
        await page.click('[data-tree-node="src/utils/clsx.ts"]', { force: true });
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => ({
            selected: document.getElementById("single").selected,
            clsxSelected: document.querySelector('[data-tree-node="src/utils/clsx.ts"]').getAttribute("aria-selected"),
            buttonSelected: document.querySelector('[data-tree-node="src/components/Button.tsx"]').getAttribute("aria-selected"),
        }));
        expect(state.selected).toBe("src/utils/clsx.ts");
        expect(state.clsxSelected).toBe("true");
        expect(state.buttonSelected).toBe("false");
    });

    test("click on parent body selects it (does NOT toggle expand)", async ({ page }) => {
        // Tree uses chevron-or-keyboard model: clicking the row body
        // selects the parent, not expand it. Expand is via the chevron
        // (data-tree-toggle), ArrowRight, or the programmatic API.
        await page.click('[data-tree-node="src/utils"]', { force: true });
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => ({
            selected: document.getElementById("single").selected,
            utilsExpanded: document.querySelector('[data-tree-node="src/utils"]').getAttribute("aria-expanded"),
        }));
        expect(state.selected).toBe("src/utils");
        expect(state.utilsExpanded).toBe("false");   // still collapsed
    });

    test("click on data-tree-toggle chevron toggles expand", async ({ page }) => {
        // src/utils starts collapsed; click its chevron -> opens.
        // We dispatch click directly because playwright's visibility
        // check on empty <span> elements is over-strict.
        const tog = await page.$('[data-tree-node="src/utils"] > .tog');
        await tog.dispatchEvent("click");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() =>
            document.querySelector('[data-tree-node="src/utils"]').getAttribute("aria-expanded")
        )).toBe("true");
        // click again -> closes
        await tog.dispatchEvent("click");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() =>
            document.querySelector('[data-tree-node="src/utils"]').getAttribute("aria-expanded")
        )).toBe("false");
    });

    test("disabled item refuses click", async ({ page }) => {
        const before = await page.evaluate(() => document.getElementById("single").selected);
        await page.click('[data-tree-node="src/components/Disabled.tsx"]', { force: true });
        await page.waitForTimeout(30);
        const after = await page.evaluate(() => document.getElementById("single").selected);
        expect(after).toBe(before);   // no selection change
    });

    test("ArrowDown moves focus through visible items", async ({ page }) => {
        await page.focus('[data-tree-node="src"]');
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(30);
        const focused = await page.evaluate(() => document.activeElement.getAttribute("data-tree-node"));
        expect(focused).toBe("src/components");
    });

    test("ArrowDown skips collapsed subtrees", async ({ page }) => {
        // src/components is OPEN initially; src/utils is CLOSED. After
        // walking past Button/Card/Disabled, ArrowDown should land on
        // src/utils (NOT on its children, since utils is collapsed).
        await page.focus('[data-tree-node="src/components/Card.tsx"]');
        // Disabled is skipped via roving-focus helper's disabled handling
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(30);
        const focused = await page.evaluate(() => document.activeElement.getAttribute("data-tree-node"));
        expect(focused).toBe("src/utils");
    });

    test("ArrowRight on collapsed parent expands (focus stays)", async ({ page }) => {
        await page.focus('[data-tree-node="src/utils"]');
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => ({
            focused: document.activeElement.getAttribute("data-tree-node"),
            utilsExpanded: document.querySelector('[data-tree-node="src/utils"]').getAttribute("aria-expanded"),
        }));
        expect(state.focused).toBe("src/utils");
        expect(state.utilsExpanded).toBe("true");
    });

    test("ArrowRight on expanded parent moves to first child", async ({ page }) => {
        await page.focus('[data-tree-node="src"]');
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.activeElement.getAttribute("data-tree-node"))).toBe("src/components");
    });

    test("ArrowLeft on expanded parent collapses (focus stays)", async ({ page }) => {
        await page.focus('[data-tree-node="src/components"]');
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => ({
            focused: document.activeElement.getAttribute("data-tree-node"),
            componentsExpanded: document.querySelector('[data-tree-node="src/components"]').getAttribute("aria-expanded"),
        }));
        expect(state.focused).toBe("src/components");
        expect(state.componentsExpanded).toBe("false");
    });

    test("ArrowLeft on leaf moves to parent", async ({ page }) => {
        await page.focus('[data-tree-node="src/components/Card.tsx"]');
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.activeElement.getAttribute("data-tree-node"))).toBe("src/components");
    });

    test("Enter on leaf selects it", async ({ page }) => {
        await page.focus('[data-tree-node="src/utils/clsx.ts"]');
        // src/utils is closed; focus may not land. Open it first via click on parent.
        await page.evaluate(() => document.getElementById("single").expand("src/utils"));
        await page.waitForTimeout(30);
        await page.focus('[data-tree-node="src/utils/clsx.ts"]');
        await page.keyboard.press("Enter");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("single").selected)).toBe("src/utils/clsx.ts");
    });

    test("Enter on parent SELECTS it (does not toggle expand)", async ({ page }) => {
        // Per the tree's selection-first design, Enter selects whether
        // the focused row is a parent or a leaf. Expand/collapse is on
        // ArrowRight/Left, not on Enter.
        await page.focus('[data-tree-node="src/utils"]');
        await page.keyboard.press("Enter");
        await page.waitForTimeout(30);
        const state = await page.evaluate(() => ({
            selected: document.getElementById("single").selected,
            expanded: document.querySelector('[data-tree-node="src/utils"]').getAttribute("aria-expanded"),
        }));
        expect(state.selected).toBe("src/utils");
        expect(state.expanded).toBe("false");   // Enter does NOT expand
    });

    test("Home + End jump to first + last VISIBLE", async ({ page }) => {
        await page.focus('[data-tree-node="src/index.ts"]');
        await page.keyboard.press("Home");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.activeElement.getAttribute("data-tree-node"))).toBe("src");
        await page.keyboard.press("End");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.activeElement.getAttribute("data-tree-node"))).toBe("package.json");
    });

    test("selectionchange CustomEvent fires with detail.selected + detail.reason", async ({ page }) => {
        await page.evaluate(() => {
            window.__sel = null;
            document.getElementById("single").addEventListener("selectionchange",
                (e) => { window.__sel = { selected: e.detail.selected, reason: e.detail.reason }; });
        });
        await page.click('[data-tree-node="src/index.ts"]', { force: true });
        await page.waitForTimeout(30);
        const evt = await page.evaluate(() => window.__sel);
        expect(evt.selected).toBe("src/index.ts");
        expect(evt.reason).toBe("click");
    });

    test("expandedchange CustomEvent fires with detail.expanded + detail.reason", async ({ page }) => {
        await page.evaluate(() => {
            window.__exp = null;
            document.getElementById("single").addEventListener("expandedchange",
                (e) => { window.__exp = { expanded: e.detail.expanded, reason: e.detail.reason }; });
        });
        // Use the chevron to trigger expand (clicking the row body would
        // select, not expand). Reason is "click-toggle".
        await page.click('[data-tree-node="src/utils"] > .tog', { force: true });
        await page.waitForTimeout(30);
        const evt = await page.evaluate(() => window.__exp);
        expect(evt.expanded).toContain("src/utils");
        expect(evt.reason).toBe("click-toggle");
    });

    test("multiple mode: click toggles set; aria-multiselectable is set", async ({ page }) => {
        const initial = await page.evaluate(() => ({
            mode: document.querySelector("#multi > ul").getAttribute("aria-multiselectable"),
            selected: document.getElementById("multi").selected,
        }));
        expect(initial.mode).toBe("true");
        expect(initial.selected).toEqual(["a", "c"]);

        // Click "b" -> adds to set
        await page.click('#multi [data-tree-node="b"]', { force: true });
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("multi").selected.slice().sort()))
            .toEqual(["a", "b", "c"]);

        // Click "a" -> removes
        await page.click('#multi [data-tree-node="a"]', { force: true });
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("multi").selected.slice().sort()))
            .toEqual(["b", "c"]);
    });

    test("external setAttribute('selected') drives selection (reactive attr)", async ({ page }) => {
        await page.evaluate(() => document.getElementById("single").setAttribute("selected", "package.json"));
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("single").selected)).toBe("package.json");
        expect(await page.evaluate(() =>
            document.querySelector('[data-tree-node="package.json"]').getAttribute("aria-selected")
        )).toBe("true");
    });

    test("external setAttribute('expanded') opens listed parents", async ({ page }) => {
        // Start with src/utils closed
        await page.evaluate(() => document.getElementById("single").setAttribute("expanded", "src,src/utils"));
        await page.waitForTimeout(30);
        expect(await page.evaluate(() =>
            document.querySelector('[data-tree-node="src/utils"]').getAttribute("aria-expanded")
        )).toBe("true");
        // src/components should now be closed (not in the set)
        expect(await page.evaluate(() =>
            document.querySelector('[data-tree-node="src/components"]').getAttribute("aria-expanded")
        )).toBe("false");
    });

    test("dynamic node insertion: appending a new [data-tree-node] wires it automatically", async ({ page }) => {
        await page.evaluate(() => {
            const parentLi = document.querySelector('[data-tree-node="docs"]');
            const childrenUl = parentLi.querySelector("ul");
            const li = document.createElement("li");
            li.setAttribute("data-tree-node", "docs/INSTALL.md");
            li.textContent = "INSTALL.md";
            childrenUl.appendChild(li);
        });
        await page.waitForTimeout(80);   // mutation observer microtask
        // expand docs via the API (clicking the row body would only
        // select it; expand requires the chevron, ArrowRight, or API)
        await page.evaluate(() => document.getElementById("single").expand("docs"));
        await page.waitForTimeout(30);
        await page.click('[data-tree-node="docs/INSTALL.md"]', { force: true });
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("single").selected)).toBe("docs/INSTALL.md");
    });

    test("nested chevron click does not toggle ancestor (regression, v0.7.10)", async ({ page }) => {
        // Before v0.7.10, clicking the chevron inside src/utils would
        // bubble to src's <li> click handler, which would treat the
        // chevron as its own and ALSO toggle src. Net effect: clicking
        // a child chevron lost the parent's expanded state.
        const before = await page.evaluate(() => document.getElementById("single").expanded);
        expect(before).toContain("src");

        const chevron = await page.$('[data-tree-node="src/utils"] > .tog');
        await chevron.dispatchEvent("click");
        await page.waitForTimeout(30);

        const after = await page.evaluate(() => document.getElementById("single").expanded);
        expect(after).toContain("src");                     // src preserved
        expect(after).toContain("src/utils");               // utils added
        expect(after).toContain("src/components");          // components untouched
    });

    test("selectionchange event fires exactly once per click (v0.7.12 cascade fix)", async ({ page }) => {
        const events = await page.evaluate(async () => {
            const host = document.getElementById("single");
            const captured = [];
            const listener = (e) => captured.push({ selected: e.detail.selected, reason: e.detail.reason });
            host.addEventListener("selectionchange", listener);
            // Click Card.tsx -- a visible sibling, not the default-selected Button.tsx
            document.querySelector('[data-tree-node="src/components/Card.tsx"]')
                .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            await new Promise(r => setTimeout(r, 50));
            host.removeEventListener("selectionchange", listener);
            return captured;
        });
        expect(events.length).toBe(1);
        expect(events[0].selected).toBe("src/components/Card.tsx");
    });

    test("expandedchange event fires exactly once per chevron click (v0.7.12 cascade fix)", async ({ page }) => {
        const events = await page.evaluate(async () => {
            const host = document.getElementById("single");
            const captured = [];
            const listener = (e) => captured.push({ expanded: e.detail.expanded.slice(), reason: e.detail.reason });
            host.addEventListener("expandedchange", listener);
            const chev = document.querySelector('[data-tree-node="src/utils"] > .tog');
            chev.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            await new Promise(r => setTimeout(r, 50));
            host.removeEventListener("expandedchange", listener);
            return captured;
        });
        expect(events.length).toBe(1);
        expect(events[0].expanded).toContain("src/utils");
    });
});
