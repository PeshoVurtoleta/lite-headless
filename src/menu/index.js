// @zakkster/lite-headless / menu / index.js
//
// createMenu(options) -> MenuHandle
//
// A WAI-ARIA menu primitive. Key differences from combobox:
//
//   - REAL DOM focus on items (not aria-activedescendant).
//     Reason: items are *actions*, not selections, and screen readers
//     should announce them on focus. The combobox's text-input + activedescendant
//     pattern is wrong here.
//
//   - Roving tabindex: exactly one item has tabindex="0" at a time
//     (the "active" one). All other items have tabindex="-1". Tab moves
//     focus OUT of the menu (closing it), not between items.
//
//   - Items have onSelect callbacks (no value/selection state).
//
//   - Submenu composition via attachSubmenu(parentItem, submenuInstance).
//     Each submenu is its own createMenu; attachSubmenu wires hover +
//     keyboard (ArrowRight) + ARIA + positioning together.
//
// Composes:
//   _overlay/core         state machine
//   _overlay/position     anchored placement
//   _overlay/dismiss      Escape + outside-click (insides include all submenu
//                         elements so clicking a submenu doesn't dismiss the root)
//   _overlay/portal       move menu to container
//   _overlay/aria         id generation + IDREF-list helpers
//
// Not in v0.3 (planned for v0.4):
//   - context-menu mode (right-click triggering at pointer)
//   - safe-triangle pointer tracking for submenu hover-grace
//   - menuitemcheckbox / menuitemradio roles

import { effect } from "@zakkster/lite-signal";
import { createOverlayCore } from "../_overlay/core.js";
import { bindEscape, bindOutsideClick } from "../_overlay/dismiss.js";
import { createPositioner } from "../_overlay/position.js";
import { portal } from "../_overlay/portal.js";
import { uniqueId, setAttr, toggleAttr, ensureId, addIdToken, removeIdToken } from "../_overlay/aria.js";
import { createRovingFocus, STRATEGY_DOM_FOCUS } from "../_overlay/roving-focus.js";

export function createMenu(options = {}) {
    const {
        open, defaultOpen = false, onOpenChange,

        placement = "bottom-start",
        offset = 4,
        flip = true, shift = true, boundary = "clipping",

        typeahead = true,
        typeaheadTimeout = 500,
        loop = true,
        closeOnSelect = true,
        closeOnEscape = true,
        closeOnOutsideClick = true,

        // When isSubmenu, ArrowLeft and Escape close this menu only (not the
        // whole chain). The parent menu's bindEscape sits below ours on the
        // _escapeStack, so when ours pops, the parent still has its handler.
        isSubmenu = false,

        // Submenu open/close hover delays. submenuCloseDelay also gives the
        // pointer time to cross the gap between parent item and submenu
        // without dismissing.
        submenuOpenDelay = 100,
        submenuCloseDelay = 300,

        // Safe-triangle pointer tracking. When the pointer leaves a parent
        // item with an open submenu, the "safe triangle" is the convex region
        // between the pointer-leave position and the two near corners of the
        // submenu. While the pointer stays inside that triangle the submenu
        // stays open; the close timer is suspended. Once the pointer exits the
        // triangle the submenu closes immediately (no extra delay). Trades a
        // single document-level pointermove listener (lifetime: ~300ms) for
        // submenu hover-grace that doesn't punish a still pointer.
        safeTriangle = true,

        container = (typeof document !== "undefined" ? document.body : null),
        transition = false,
    } = options;

    const core = createOverlayCore({
        open, defaultOpen, onOpenChange,
        awaitTransitionEnd: !!transition,
    });

    let _trigger = null;
    let _anchor = null;          // explicit positioning anchor; defaults to trigger
    let _menu = null;
    let _restorePortal = null;
    let _positioner = null;
    let _stopAutoUpdate = null;
    let _outsideOff = null;
    let _escapeOff = null;
    const _items = [];           // {el, id, disabled, onSelect, label, hasSubmenu, type, group}
    const _separators = [];
    const _extraInsides = [];

    // For context-menu mode: a transient anchor element placed at the pointer
    // location on contextmenu. Created on right-click, removed on close.
    let _virtualAnchor = null;

    // ---- highlight + typeahead (delegated to shared helper) -----------
    // Menu uses real DOM focus + roving tabindex (each item is tabbable
    // independently because Tab is the standard way to navigate INTO a
    // menu group). Keyboard arrow handling on the menu calls into the
    // helper for move/first/last/typeChar.
    const roving = createRovingFocus({
        getItems: () => _items,
        strategy: STRATEGY_DOM_FOCUS,
        loop,
        typeahead,
        typeaheadTimeout,
        getLabel: (it) => (it.label || it.el.textContent || "").toLowerCase(),
    });
    const setFocus     = (idx)   => roving.setIndex(idx);
    const moveFocus    = (delta) => roving.move(delta);
    const focusFirst   = ()      => roving.first();
    const focusLast    = ()      => roving.last();
    const typeaheadHandle = (ch) => roving.typeChar(ch);

    // submenus: Map<parentItemEl, { submenu, openTimer, closeTimer, off }>
    const _submenus = new Map();

    function activeAnchor() {
        // context-menu mode: virtual anchor placed at the pointer wins over
        // an explicit attachAnchor or the trigger
        return _virtualAnchor || _anchor || _trigger;
    }

    function activateItem(idx) {
        if (idx < 0 || idx >= _items.length) return;
        const item = _items[idx];
        if (item.disabled) return;
        // Items with submenus don't activate on Enter -- they open the submenu
        if (item.hasSubmenu) {
            openSubmenu(item.el, /*focusFirstChild=*/true);
            return;
        }
        if (item.onSelect) {
            try { item.onSelect(); } catch (e) { /* swallow; consumer error shouldn't break the menu */ }
        }
        // Checkbox items are sticky -- they stay open for repeated toggling.
        // Regular menuitems and radio items honor closeOnSelect.
        if (closeOnSelect && !item.skipCloseOnActivate) core.setOpen(false, "select");
    }

    // ----- submenu coordination -----------------------------------------
    function openSubmenu(parentItemEl, focusFirstChild) {
        const link = _submenus.get(parentItemEl);
        if (!link) return;
        if (link.closeTimer) { clearTimeout(link.closeTimer); link.closeTimer = null; }
        if (link.openTimer)  { clearTimeout(link.openTimer);  link.openTimer = null; }
        if (!link.submenu.destroyed && !link.submenu.open()) {
            link.submenu.setOpen(true, "parent");
        }
        if (focusFirstChild) {
            // Wait one frame for the submenu's doOpen to run + position
            const tick = (typeof requestAnimationFrame === "function")
                ? requestAnimationFrame
                : (fn) => setTimeout(fn, 0);
            tick(() => {
                if (!link.submenu.destroyed) link.submenu._focusFirst?.();
            });
        }
    }

    function closeSubmenu(parentItemEl, immediate = false, leavePoint = null) {
        const link = _submenus.get(parentItemEl);
        if (!link) return;
        if (link.openTimer) { clearTimeout(link.openTimer); link.openTimer = null; }
        if (immediate) {
            cancelSafeTriangle(link);
            if (link.closeTimer) { clearTimeout(link.closeTimer); link.closeTimer = null; }
            if (link.submenu.open()) link.submenu.setOpen(false, "parent");
            return;
        }
        // already scheduled (either via timer or safe-triangle): don't stack
        if (link.closeTimer || link.safeTriangleOff) return;

        // Safe-triangle path: pointer just left the parent item with the
        // submenu open. The user might be moving diagonally toward the submenu;
        // we install a document-level pointermove listener and only close once
        // the pointer leaves the convex region (apex=leavePoint, base=near edge
        // of submenu). A hard cap (2 * submenuCloseDelay) prevents a still
        // pointer from pinning the submenu open forever.
        if (safeTriangle && leavePoint && link.submenu.open()) {
            const submenuEl = link.submenu._menu?.();
            if (submenuEl && typeof document !== "undefined") {
                installSafeTriangle(link, leavePoint, submenuEl);
                return;
            }
        }

        // Fallback (no leave point, or safe-triangle disabled): plain timer
        link.closeTimer = setTimeout(() => {
            link.closeTimer = null;
            if (link.submenu.open()) link.submenu.setOpen(false, "leave");
        }, submenuCloseDelay);
    }

    function cancelSafeTriangle(link) {
        if (link?.safeTriangleOff) {
            link.safeTriangleOff();
            link.safeTriangleOff = null;
        }
    }

    // Geometry: install a document-wide pointermove listener while pointer is
    // crossing from the parent item to the submenu. Triangle vertices:
    //   apex = leavePoint (current pointer location at pointerleave)
    //   base = the two corners of the submenu's edge FACING the parent item,
    //          determined from `data-side` set by the positioner
    function installSafeTriangle(link, leavePoint, submenuEl) {
        const r = submenuEl.getBoundingClientRect();
        const side = submenuEl.getAttribute("data-side") || "right";
        let ax, ay, bx, by;   // base of the triangle (submenu's near edge)
        if (side === "right") {
            // submenu is to the right of parent: near corners are TL, BL
            ax = r.left;  ay = r.top;
            bx = r.left;  by = r.bottom;
        } else if (side === "left") {
            ax = r.right; ay = r.top;
            bx = r.right; by = r.bottom;
        } else if (side === "bottom") {
            ax = r.left;  ay = r.top;
            bx = r.right; by = r.top;
        } else { // top
            ax = r.left;  ay = r.bottom;
            bx = r.right; by = r.bottom;
        }

        const apex = { x: leavePoint.x, y: leavePoint.y };

        const onMove = (e) => {
            if (!pointInTriangle(e.clientX, e.clientY, apex.x, apex.y, ax, ay, bx, by)) {
                cancelSafeTriangle(link);
                if (link.submenu.open()) link.submenu.setOpen(false, "safe-triangle");
            }
        };

        // Hard cap: 2x the normal close delay. Without this, a stationary
        // pointer inside the triangle would keep the submenu open indefinitely.
        const fallbackTimer = setTimeout(() => {
            cancelSafeTriangle(link);
            if (link.submenu.open()) link.submenu.setOpen(false, "safe-triangle");
        }, submenuCloseDelay * 2);

        document.addEventListener("pointermove", onMove);
        link.safeTriangleOff = () => {
            document.removeEventListener("pointermove", onMove);
            clearTimeout(fallbackTimer);
            link.safeTriangleOff = null;
        };
    }

    // Standard point-in-triangle via sign of cross product. Works correctly
    // for both CW and CCW vertex orderings.
    function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
        const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
        const s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
        const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
        const hasNeg = (s1 < 0) || (s2 < 0) || (s3 < 0);
        const hasPos = (s1 > 0) || (s2 > 0) || (s3 > 0);
        return !(hasNeg && hasPos);
    }

    function closeAllSubmenus() {
        for (const [el] of _submenus) closeSubmenu(el, true);
    }

    // ----- doOpen / doClose ---------------------------------------------
    function doOpen() {
        if (!_menu) return;
        if (container && _menu.parentNode !== container) {
            _restorePortal = portal(_menu, container);
        }
        if (_trigger) setAttr(_trigger, "aria-expanded", "true");

        const a = activeAnchor();
        if (a) {
            _positioner = createPositioner({
                anchor: a, content: _menu,
                placement, offset, flip, shift, boundary,
            });
            _positioner.update();
            _stopAutoUpdate = _positioner.autoUpdate();
        }
        // Initial focus: first item. Caller can override afterwards.
        //
        // We focus TWICE: once synchronously via focusFirst() (which sets
        // roving state + calls .focus()), and once via the next animation
        // frame as a raw .focus() retry.
        //
        // - The sync call keeps happy-dom unit tests working (they assert
        //   document.activeElement immediately after setOpen) and serves
        //   any setup where the menu element is already focusable at the
        //   moment doOpen runs.
        // - The rAF call is the safety net for consumer CSS that hides
        //   closed menus with `display:none` / `visibility:hidden` until
        //   [data-open] is present. Our [data-open] attribute is written
        //   by a separate effect (stopOpenAria) that runs AFTER this one
        //   in the same flush; under that CSS, the sync .focus() above
        //   fires while the element is still unfocusable and Chromium/
        //   Firefox silently drop it. By the time the rAF fires, the
        //   attribute is set + the CSS no longer hides the menu, so the
        //   retry .focus() lands. (Same deferral idiom openSubmenu uses
        //   for the submenu case.)
        // - The retry is a raw .focus(), not focusFirst -- roving.setIndex
        //   is idempotent and skips the .focus() when _index is already
        //   the target, so a second focusFirst() call would be a no-op.
        focusFirst();
        const tick = (typeof requestAnimationFrame === "function")
            ? requestAnimationFrame
            : (fn) => setTimeout(fn, 0);
        tick(() => {
            if (core.destroyed || !core.open()) return;
            const idx = roving.index;
            if (idx >= 0 && _items[idx]
                && typeof document !== "undefined"
                && _items[idx].el !== document.activeElement) {
                try { _items[idx].el.focus({ preventScroll: true }); }
                catch { /* element may be detached; harmless */ }
            }
        });
    }

    function doClose() {
        closeAllSubmenus();
        if (_stopAutoUpdate) { _stopAutoUpdate(); _stopAutoUpdate = null; }
        if (_positioner) { _positioner.destroy(); _positioner = null; }
        if (_trigger) setAttr(_trigger, "aria-expanded", "false");
        // virtual anchor (context menu) lives only while open
        if (_virtualAnchor) {
            try { _virtualAnchor.remove(); } catch { /* parent gone */ }
            _virtualAnchor = null;
        }
        // restore tabindex on all items; clear the focused state
        for (let i = 0; i < _items.length; i++) {
            _items[i].el.setAttribute("tabindex", "-1");
            _items[i].el.removeAttribute("data-focused");
        }
        roving.reset();
    }

    // ----- reactive effects (one dep each) ------------------------------
    const stopOpen = effect(() => {
        if (core.open()) doOpen();
        else doClose();
    });
    core._addCleanup(stopOpen);

    const stopOpenAria = effect(() => {
        const isOpen = core.open();
        if (!_menu) return;
        setAttr(_menu, "aria-hidden", isOpen ? null : "true");
        toggleAttr(_menu, "data-open", isOpen);
    });
    core._addCleanup(stopOpenAria);

    const stopStatusAttr = effect(() => {
        const s = core.status();
        if (_menu) setAttr(_menu, "data-status", s);
    });
    core._addCleanup(stopStatusAttr);

    const stopRestore = effect(() => {
        if (core.status() === "closed" && _restorePortal) {
            _restorePortal();
            _restorePortal = null;
        }
    });
    core._addCleanup(stopRestore);

    // ----- attach methods -----------------------------------------------
    function attachTrigger(el) {
        if (!el || core.destroyed) return noop;
        _trigger = el;
        ensureId(el, "lh-menu-trigger");
        setAttr(el, "aria-haspopup", "menu");
        setAttr(el, "aria-expanded", core.open() ? "true" : "false");
        if (_menu && _menu.id) addIdToken(el, "aria-controls", _menu.id);
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");

        const onClick = (e) => {
            e.preventDefault();
            core.setOpen(!core.open(), "trigger");
        };

        const onKey = (e) => {
            // when open, the menu element has focus and handles its own keys
            if (core.open()) return;
            const k = e.key;
            if (k === "ArrowDown" || k === "Enter" || k === " ") {
                e.preventDefault();
                core.setOpen(true, "trigger");
                // focus first item happens in doOpen
            } else if (k === "ArrowUp") {
                e.preventDefault();
                core.setOpen(true, "trigger");
                // doOpen focused the first item; override with last
                focusLast();
            } else if (typeahead && k.length === 1 && /\S/.test(k)) {
                e.preventDefault();
                core.setOpen(true, "trigger");
                // doOpen already ran (synchronously) and set focus to first;
                // typeahead reads roving.index and advances from there
                typeaheadHandle(k);
            }
        };

        el.addEventListener("click", onClick);
        el.addEventListener("keydown", onKey);

        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKey);
            el.removeAttribute("aria-haspopup");
            el.removeAttribute("aria-expanded");
            if (_menu && _menu.id) removeIdToken(el, "aria-controls", _menu.id);
            if (_trigger === el) _trigger = null;
        };
        core._addCleanup(off);
        return off;
    }

    function attachAnchor(el) {
        if (!el || core.destroyed) return noop;
        _anchor = el;
        const off = () => { if (_anchor === el) _anchor = null; };
        core._addCleanup(off);
        return off;
    }

    function attachMenu(el) {
        if (!el || core.destroyed) return noop;
        _menu = el;
        if (!el.id) el.id = uniqueId("lh-menu");
        setAttr(el, "role", "menu");
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        setAttr(el, "aria-hidden", core.open() ? null : "true");
        toggleAttr(el, "data-open", core.open());
        setAttr(el, "data-status", core.status());
        core._setContentForTransitions(el);
        if (_trigger) addIdToken(_trigger, "aria-controls", el.id);

        if (closeOnOutsideClick) {
            // PERF: scratch array reused per pointerdown. Same pattern as
            // popover -- bindOutsideClick iterates synchronously inside the
            // event handler so the shared buffer is safe.
            const _insidesScratch = [];
            _outsideOff = bindOutsideClick(core, () => {
                _insidesScratch.length = 0;
                if (_menu) _insidesScratch.push(_menu);
                if (_trigger) _insidesScratch.push(_trigger);
                // root menu's outside list also includes all open submenu
                // elements and submenu parent items, so clicking inside a
                // submenu doesn't dismiss the root.
                for (const [parentEl, link] of _submenus) {
                    _insidesScratch.push(parentEl);
                    const subMenuEl = link.submenu._menu && link.submenu._menu();
                    if (subMenuEl) _insidesScratch.push(subMenuEl);
                }
                for (let i = 0; i < _extraInsides.length; i++) _insidesScratch.push(_extraInsides[i]);
                return _insidesScratch;
            });
        }
        if (closeOnEscape) _escapeOff = bindEscape(core);

        // navigation keydown lives on the menu element (where focused items live)
        const onKey = (e) => {
            const k = e.key;
            if (k === "ArrowDown")      { e.preventDefault(); moveFocus(1); }
            else if (k === "ArrowUp")   { e.preventDefault(); moveFocus(-1); }
            else if (k === "Home")      { e.preventDefault(); focusFirst(); }
            else if (k === "End")       { e.preventDefault(); focusLast(); }
            else if (k === "Enter" || k === " ") {
                e.preventDefault();
                if (roving.index >= 0) activateItem(roving.index);
            }
            else if (k === "ArrowRight") {
                // open the focused item's submenu if it has one
                if (roving.index >= 0 && _items[roving.index].hasSubmenu) {
                    e.preventDefault();
                    openSubmenu(_items[roving.index].el, /*focusFirst=*/true);
                }
            }
            else if (k === "ArrowLeft") {
                // submenus only: ArrowLeft closes this submenu and lets the
                // parent menu's escape stack restore focus.
                if (isSubmenu) {
                    e.preventDefault();
                    core.setOpen(false, "back");
                }
            }
            else if (k === "Tab") {
                // Tab moves OUT of the menu entirely (matches WAI-ARIA pattern).
                // We close ourselves; Tab's default action then moves focus to
                // the next tabbable in document order.
                core.setOpen(false, "tab");
            }
            else if (typeahead && k.length === 1 && /\S/.test(k)) {
                e.preventDefault();
                typeaheadHandle(k);
            }
        };
        el.addEventListener("keydown", onKey);

        if (core.open()) doOpen();

        const off = () => {
            el.removeEventListener("keydown", onKey);
            if (_menu === el) {
                if (_trigger) removeIdToken(_trigger, "aria-controls", el.id);
                el.removeAttribute("role");
                el.removeAttribute("aria-hidden");
                el.removeAttribute("data-open");
                el.removeAttribute("data-status");
                el.removeAttribute("data-side");
                el.removeAttribute("data-align");
                _menu = null;
            }
            if (_outsideOff) { _outsideOff(); _outsideOff = null; }
            if (_escapeOff)  { _escapeOff();  _escapeOff = null; }
        };
        core._addCleanup(off);
        return off;
    }

    function attachItem(el, meta = {}) {
        if (!el || core.destroyed) return noop;
        const { onSelect, disabled = false, label } = meta;
        ensureId(el, "lh-menuitem");
        setAttr(el, "role", "menuitem");
        el.setAttribute("tabindex", "-1");
        if (disabled) {
            setAttr(el, "aria-disabled", "true");
            el.setAttribute("data-disabled", "");
        }

        const entry = {
            el, id: el.id, onSelect,
            disabled: !!disabled,
            label: label != null ? String(label) : ((el.textContent || "").trim()),
            hasSubmenu: false,
        };
        _items.push(entry);

        const onClick = (e) => {
            e.preventDefault();
            if (entry.disabled) return;
            const idx = _items.indexOf(entry);
            if (idx >= 0) activateItem(idx);
        };
        const onPointerEnter = () => {
            if (entry.disabled) return;
            const idx = _items.indexOf(entry);
            if (idx !== roving.index) setFocus(idx);
            // also: if this item has a sibling whose submenu is open, close it
            // (rule: only one submenu open at a time per menu level)
            for (const [otherEl, otherLink] of _submenus) {
                if (otherEl !== entry.el && otherLink.submenu.open()) {
                    closeSubmenu(otherEl, /*immediate=*/true);
                }
            }
            // if this item has a submenu, returning to the item cancels any
            // pending close attempt (timer OR safe-triangle), and schedules an
            // open if the submenu isn't already open.
            if (entry.hasSubmenu) {
                const link = _submenus.get(entry.el);
                if (link) {
                    if (link.closeTimer) { clearTimeout(link.closeTimer); link.closeTimer = null; }
                    cancelSafeTriangle(link);
                    if (!link.submenu.open() && !link.openTimer) {
                        link.openTimer = setTimeout(() => {
                            link.openTimer = null;
                            if (!link.submenu.destroyed) link.submenu.setOpen(true, "hover");
                        }, submenuOpenDelay);
                    }
                }
            }
        };
        const onPointerLeave = (e) => {
            if (entry.hasSubmenu) {
                // capture the leave point so closeSubmenu can install
                // safe-triangle tracking
                const point = (e && typeof e.clientX === "number")
                    ? { x: e.clientX, y: e.clientY }
                    : null;
                closeSubmenu(entry.el, /*immediate=*/false, point);
            }
        };
        el.addEventListener("click", onClick);
        el.addEventListener("pointerenter", onPointerEnter);
        el.addEventListener("pointerleave", onPointerLeave);

        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("pointerenter", onPointerEnter);
            el.removeEventListener("pointerleave", onPointerLeave);
            el.removeAttribute("role");
            el.removeAttribute("tabindex");
            el.removeAttribute("aria-disabled");
            el.removeAttribute("data-disabled");
            el.removeAttribute("data-focused");
            el.removeAttribute("aria-haspopup");
            el.removeAttribute("aria-expanded");
            const idx = _items.indexOf(entry);
            if (idx >= 0) {
                _items.splice(idx, 1);
                if (roving.index >= _items.length) roving.setIndex(_items.length - 1);
            }
        };
        core._addCleanup(off);
        return off;
    }

    function attachSeparator(el) {
        if (!el || core.destroyed) return noop;
        setAttr(el, "role", "separator");
        _separators.push(el);
        const off = () => {
            el.removeAttribute("role");
            const i = _separators.indexOf(el);
            if (i >= 0) _separators.splice(i, 1);
        };
        core._addCleanup(off);
        return off;
    }

    // attachSubmenu(parentItemEl, submenu):
    //   - links a submenu (separate createMenu instance) to a parent item
    //   - wires the submenu's positioning anchor to the parent item
    //   - syncs aria-haspopup + aria-expanded on the parent item
    //   - opens on hover (with submenuOpenDelay) and ArrowRight
    //   - closes on hover-leave (with submenuCloseDelay grace for pointer
    //     crossing the trigger->submenu gap, mirroring the tooltip rule)
    //   - pointer entering the submenu's menu element keeps it open
    function attachSubmenu(parentItemEl, submenu) {
        if (!parentItemEl || !submenu || core.destroyed) return noop;
        const entry = _items.find((it) => it.el === parentItemEl);
        if (!entry) return noop;
        entry.hasSubmenu = true;

        setAttr(parentItemEl, "aria-haspopup", "menu");
        setAttr(parentItemEl, "aria-expanded", submenu.open() ? "true" : "false");

        // give the submenu its positioning anchor (the parent item itself)
        submenu.attachAnchor?.(parentItemEl);

        // keep aria-expanded on the parent item in sync with submenu open state
        const stopExpandedSync = effect(() => {
            const isOpen = submenu.open();
            setAttr(parentItemEl, "aria-expanded", isOpen ? "true" : "false");
        });
        core._addCleanup(stopExpandedSync);

        const link = { submenu, openTimer: null, closeTimer: null };
        _submenus.set(parentItemEl, link);

        // wire pointer enter/leave on the submenu element so the close timer
        // gets cancelled when the user moves into the submenu. We have to
        // wait for the submenu's menu element to exist; it's set when the
        // consumer calls submenu.attachMenu(). The cleanest hook: subscribe
        // to the submenu's status -- when it first reaches opening/open, the
        // menu element is set; install the listeners then.
        let _subHoverWired = false;
        const wireSubmenuHover = () => {
            if (_subHoverWired) return;
            const m = submenu._menu?.();
            if (!m) return;
            _subHoverWired = true;
            const onEnter = () => {
                // pointer arrived at the submenu -- both the close timer AND
                // any safe-triangle tracking should be released
                if (link.closeTimer) { clearTimeout(link.closeTimer); link.closeTimer = null; }
                cancelSafeTriangle(link);
            };
            const onLeave = () => {
                if (link.closeTimer || link.safeTriangleOff) return;
                link.closeTimer = setTimeout(() => {
                    link.closeTimer = null;
                    if (submenu.open()) submenu.setOpen(false, "leave");
                }, submenuCloseDelay);
            };
            m.addEventListener("pointerenter", onEnter);
            m.addEventListener("pointerleave", onLeave);
            link.subOff = () => {
                m.removeEventListener("pointerenter", onEnter);
                m.removeEventListener("pointerleave", onLeave);
            };
        };
        const stopWireWatcher = effect(() => {
            const s = submenu.status();
            if (s === "opening" || s === "open") wireSubmenuHover();
        });
        core._addCleanup(stopWireWatcher);

        const off = () => {
            parentItemEl.removeAttribute("aria-haspopup");
            parentItemEl.removeAttribute("aria-expanded");
            _submenus.delete(parentItemEl);
            if (link.openTimer)  clearTimeout(link.openTimer);
            if (link.closeTimer) clearTimeout(link.closeTimer);
            cancelSafeTriangle(link);
            if (link.subOff)     link.subOff();
            entry.hasSubmenu = false;
        };
        core._addCleanup(off);
        return off;
    }

    function attachInside(el) {
        if (!el || core.destroyed) return noop;
        _extraInsides.push(el);
        const off = () => {
            const i = _extraInsides.indexOf(el);
            if (i !== -1) _extraInsides.splice(i, 1);
        };
        core._addCleanup(off);
        return off;
    }

    // ----- v0.4: context menu --------------------------------------------
    //
    // attachContextTarget(el): right-clicking `el` opens the menu at the
    // pointer location. A 0x0 virtual anchor element is appended to the body
    // at (clientX, clientY); the positioner treats it like any other anchor.
    // Removed on close.
    //
    // The menu's `placement` still drives which side of the pointer the menu
    // emerges from; bottom-start is the conventional default for context
    // menus (matches OS-level right-click behavior on most platforms).
    function attachContextTarget(el) {
        if (!el || core.destroyed) return noop;

        const onContextMenu = (e) => {
            e.preventDefault();
            // If a previous virtual anchor exists (rapid re-click), remove it.
            if (_virtualAnchor) {
                try { _virtualAnchor.remove(); } catch { /* noop */ }
                _virtualAnchor = null;
            }
            const va = document.createElement("div");
            va.style.position = "fixed";
            va.style.left = e.clientX + "px";
            va.style.top = e.clientY + "px";
            va.style.width = "0";
            va.style.height = "0";
            va.style.pointerEvents = "none";
            // Mark it so consumer code can tell what it is
            va.setAttribute("data-menu-virtual-anchor", "");
            document.body.appendChild(va);
            _virtualAnchor = va;

            // Re-create the positioner if we're already open (rapid re-click
            // on a different spot should move the menu). Otherwise opening
            // will pick up the new anchor in doOpen.
            if (core.open()) {
                if (_stopAutoUpdate) { _stopAutoUpdate(); _stopAutoUpdate = null; }
                if (_positioner) { _positioner.destroy(); _positioner = null; }
                _positioner = createPositioner({
                    anchor: va, content: _menu,
                    placement, offset, flip, shift, boundary,
                });
                _positioner.update();
                _stopAutoUpdate = _positioner.autoUpdate();
            } else {
                core.setOpen(true, "context");
            }
        };
        el.addEventListener("contextmenu", onContextMenu);

        const off = () => {
            el.removeEventListener("contextmenu", onContextMenu);
        };
        core._addCleanup(off);
        return off;
    }

    // ----- v0.4: menuitemcheckbox -----------------------------------------
    //
    // attachCheckboxItem(el, { checked, label, disabled, onCheckedChange })
    //   - role=menuitemcheckbox
    //   - aria-checked reflects state
    //   - activation toggles checked + fires onCheckedChange(next)
    //   - does NOT close the menu by default (matches platform convention --
    //     checkboxes are sticky; user usually toggles several before closing)
    function attachCheckboxItem(el, meta = {}) {
        if (!el || core.destroyed) return noop;
        const { label, disabled = false, onCheckedChange } = meta;
        // External controlled mode: if `checked` is a signal, read it; the
        // primitive's effect mirrors aria-checked. Otherwise track local state.
        const checkedOpt = meta.checked;
        let _localChecked = (typeof checkedOpt === "boolean") ? checkedOpt : false;
        const isExternalSignal = checkedOpt && typeof checkedOpt === "function";
        const readChecked = () => isExternalSignal ? checkedOpt() : _localChecked;
        const writeChecked = (v) => {
            if (isExternalSignal && typeof checkedOpt.set === "function") checkedOpt.set(v);
            else _localChecked = v;
            if (onCheckedChange) {
                try { onCheckedChange(v); } catch { /* swallow */ }
            }
            reflectChecked();
        };
        function reflectChecked() {
            const c = readChecked();
            setAttr(el, "aria-checked", c ? "true" : "false");
            if (c) el.setAttribute("data-checked", "");
            else el.removeAttribute("data-checked");
        }

        ensureId(el, "lh-menuitemcheckbox");
        setAttr(el, "role", "menuitemcheckbox");
        el.setAttribute("tabindex", "-1");
        if (disabled) {
            setAttr(el, "aria-disabled", "true");
            el.setAttribute("data-disabled", "");
        }
        reflectChecked();

        const entry = {
            el, id: el.id,
            disabled: !!disabled,
            label: label != null ? String(label) : ((el.textContent || "").trim()),
            hasSubmenu: false,
            type: "checkbox",
            // checkbox-specific activation: toggle, don't close
            onSelect: () => writeChecked(!readChecked()),
        };
        _items.push(entry);

        const onClick = (e) => {
            e.preventDefault();
            if (entry.disabled) return;
            writeChecked(!readChecked());
            // intentionally no closeOnSelect for checkboxes
        };
        const onPointerEnter = () => {
            if (entry.disabled) return;
            const idx = _items.indexOf(entry);
            if (idx !== roving.index) setFocus(idx);
        };
        el.addEventListener("click", onClick);
        el.addEventListener("pointerenter", onPointerEnter);

        // override Enter/Space activation to NOT close
        // (the menu's keydown handler calls activateItem which calls onSelect,
        // but onSelect is set above to toggle without closing. The menu's
        // closeOnSelect:true would still close though. Fix:)
        entry.skipCloseOnActivate = true;

        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("pointerenter", onPointerEnter);
            el.removeAttribute("role");
            el.removeAttribute("tabindex");
            el.removeAttribute("aria-checked");
            el.removeAttribute("aria-disabled");
            el.removeAttribute("data-checked");
            el.removeAttribute("data-disabled");
            el.removeAttribute("data-focused");
            const idx = _items.indexOf(entry);
            if (idx >= 0) {
                _items.splice(idx, 1);
                if (roving.index >= _items.length) roving.setIndex(_items.length - 1);
            }
        };
        core._addCleanup(off);
        return off;
    }

    // ----- v0.4: menuitemradio --------------------------------------------
    //
    // Radio items belong to a `group` (string key). Exactly one item per
    // group is checked at a time. Activating an item sets it as the group's
    // selected value and clears the others in that group. Group state lives
    // on this menu's `_radioGroups` map (created lazily).
    const _radioGroups = new Map();   // groupName -> { value, items: Set<entry>, onChange }
    function attachRadioItem(el, meta = {}) {
        if (!el || core.destroyed) return noop;
        const { value, group, label, disabled = false, onValueChange } = meta;
        if (!group) {
            // radio without a group is meaningless; treat as a regular item
            return attachItem(el, { onSelect: () => onValueChange?.(value), disabled, label });
        }
        let g = _radioGroups.get(group);
        if (!g) {
            g = { value: undefined, items: new Set(), onChange: onValueChange };
            _radioGroups.set(group, g);
        }
        // first item registered seeds the group's value if not yet set
        if (g.value === undefined) g.value = value;
        // keep the latest onValueChange (consumers usually pass the same callback)
        if (onValueChange) g.onChange = onValueChange;

        ensureId(el, "lh-menuitemradio");
        setAttr(el, "role", "menuitemradio");
        el.setAttribute("tabindex", "-1");
        if (disabled) {
            setAttr(el, "aria-disabled", "true");
            el.setAttribute("data-disabled", "");
        }

        const entry = {
            el, id: el.id,
            disabled: !!disabled,
            label: label != null ? String(label) : ((el.textContent || "").trim()),
            hasSubmenu: false,
            type: "radio",
            group, value,
        };
        _items.push(entry);
        g.items.add(entry);

        function reflectGroup() {
            for (const it of g.items) {
                const sel = it.value === g.value;
                setAttr(it.el, "aria-checked", sel ? "true" : "false");
                if (sel) it.el.setAttribute("data-checked", "");
                else it.el.removeAttribute("data-checked");
            }
        }
        reflectGroup();

        // when activated, set this group's value to this item's value
        entry.onSelect = () => {
            if (g.value === entry.value) return;
            g.value = entry.value;
            reflectGroup();
            if (g.onChange) {
                try { g.onChange(entry.value); } catch { /* swallow */ }
            }
        };

        const onClick = (e) => {
            e.preventDefault();
            if (entry.disabled) return;
            entry.onSelect();
            // radios CLOSE on selection by default (matches checkbox-vs-radio
            // platform convention: radios are one-shot picks, checkboxes are
            // sticky toggles)
            if (closeOnSelect) core.setOpen(false, "select");
        };
        const onPointerEnter = () => {
            if (entry.disabled) return;
            const idx = _items.indexOf(entry);
            if (idx !== roving.index) setFocus(idx);
        };
        el.addEventListener("click", onClick);
        el.addEventListener("pointerenter", onPointerEnter);

        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("pointerenter", onPointerEnter);
            el.removeAttribute("role");
            el.removeAttribute("tabindex");
            el.removeAttribute("aria-checked");
            el.removeAttribute("aria-disabled");
            el.removeAttribute("data-checked");
            el.removeAttribute("data-disabled");
            el.removeAttribute("data-focused");
            g.items.delete(entry);
            if (g.items.size === 0) _radioGroups.delete(group);
            const idx = _items.indexOf(entry);
            if (idx >= 0) {
                _items.splice(idx, 1);
                if (roving.index >= _items.length) roving.setIndex(_items.length - 1);
            }
        };
        core._addCleanup(off);
        return off;
    }

    function destroy() {
        if (core.open()) doClose();
        if (_restorePortal) { _restorePortal(); _restorePortal = null; }
        roving.destroy();
        core.destroy();
    }

    return {
        open: core.open,
        status: core.status,
        setOpen: core.setOpen,
        toggle: core.toggle,
        attachTrigger,
        attachAnchor,
        attachContextTarget,
        attachMenu,
        attachItem,
        attachCheckboxItem,
        attachRadioItem,
        attachSeparator,
        attachSubmenu,
        attachInside,
        destroy,
        get destroyed() { return core.destroyed; },

        // helpers used by attachSubmenu in the parent menu and by tests
        _menu: () => _menu,
        _items: () => _items.slice(),
        _focusIndex: () => roving.index,
        _focusFirst: focusFirst,
        // v0.4: introspection used by tests
        _submenus: () => _submenus,
    };
}

function noop() {}
