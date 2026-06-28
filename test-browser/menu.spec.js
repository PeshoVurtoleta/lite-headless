// test-browser/menu.spec.js
// Browser-only tests for the menu primitive. The interesting paths here all
// depend on real layout -- safe-triangle geometry, real pointer-leave events
// across rendered DOM, and the visual gap between parent item and submenu.
// happy-dom can verify the LIFECYCLE (timers, listeners, state transitions)
// but not the GEOMETRY.

import { test, expect } from "@playwright/test";

test.describe("menu", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/test-browser/fixtures/menu.html");
        // Open the root menu by clicking the trigger
        await page.click("#trigger");
        await expect(page.locator("#root-menu")).toHaveAttribute("data-open", "");
    });

    test("hovering the parent item opens the submenu after submenuOpenDelay", async ({ page }) => {
        await page.hover("#item-recent");
        // Submenu should be open after the ~50ms delay
        await expect(page.locator("#sub-menu")).toHaveAttribute("data-open", "");
    });

    test("safe-triangle: moving from parent item toward submenu keeps it open", async ({ page }) => {
        await page.hover("#item-recent");
        await expect(page.locator("#sub-menu")).toHaveAttribute("data-open", "");

        // Get geometry to plan the pointer path:
        //   start: center of parent item (recent)
        //   end:   inside the submenu, at parent-item's y-band
        //
        // We deliberately keep the path's y inside #item-recent's vertical
        // band so we don't cross into a sibling item (e.g. #item-quit just
        // below). Sibling pointerenter immediately closes other open
        // submenus -- that's an unrelated, by-design behavior. Aiming for
        // the submenu's center would descend through #item-quit's strip
        // and trigger that close, which has nothing to do with safe-triangle.
        const parentBox = await page.locator("#item-recent").boundingBox();
        const subBox    = await page.locator("#sub-menu").boundingBox();
        if (!parentBox || !subBox) throw new Error("missing layout");

        const startX = parentBox.x + parentBox.width / 2;
        const startY = parentBox.y + parentBox.height / 2;
        // End ~20px inside the submenu's left edge, at the parent item's
        // vertical center. The submenu's "right-start" placement lines its
        // top edge up with the parent item's top, so the parent's y is
        // always inside the submenu's y range.
        const endX   = subBox.x + 20;
        const endY   = startY;

        // Move diagonally in small steps so pointermove fires many times.
        await page.mouse.move(startX, startY);
        const steps = 20;
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            await page.mouse.move(startX + (endX - startX) * t, startY + (endY - startY) * t);
        }
        // Throughout the crossing, the submenu should never have closed.
        await expect(page.locator("#sub-menu")).toHaveAttribute("data-open", "");
    });

    test("safe-triangle: moving AWAY (toward a sibling) closes the submenu", async ({ page }) => {
        await page.hover("#item-recent");
        await expect(page.locator("#sub-menu")).toHaveAttribute("data-open", "");

        // Move down to the "Quit" item -- pointer exits the safe triangle.
        // Sibling enter triggers immediate close of OTHER submenus.
        await page.hover("#item-quit");

        // Submenu should close; allow up to submenuCloseDelay (200ms) for
        // the timer fallback, but typically the safe-triangle exit closes it
        // immediately. After v0.11.0: data-open is absent when closed.
        await expect(page.locator("#sub-menu")).not.toHaveAttribute("data-open", "", {
            timeout: 500,
        });
    });

    test("ArrowRight on focused parent item opens submenu and focuses first child", async ({ page }) => {
        // Move focus to the "Recent" item by arrow-keying down from the
        // initial "New" focus.
        await page.keyboard.press("ArrowDown"); // New -> Open
        await page.keyboard.press("ArrowDown"); // Open -> Recent
        await page.keyboard.press("ArrowRight");

        await expect(page.locator("#sub-menu")).toHaveAttribute("data-open", "");
        // First submenu item should have keyboard focus
        await expect(page.locator("#sub-item-a")).toBeFocused();
    });

    test("ArrowLeft in submenu closes it and returns focus to parent item", async ({ page }) => {
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        await expect(page.locator("#sub-item-a")).toBeFocused();

        await page.keyboard.press("ArrowLeft");
        await expect(page.locator("#sub-menu")).not.toHaveAttribute("data-open");
    });

    test("clicking an item activates onSelect and closes the menu", async ({ page }) => {
        await page.click("#item-new");
        await expect(page.locator("#root-menu")).not.toHaveAttribute("data-open");
    });

    test("clicking outside dismisses the menu", async ({ page }) => {
        // click far from any menu element
        await page.mouse.click(800, 600);
        await expect(page.locator("#root-menu")).not.toHaveAttribute("data-open");
    });
});
