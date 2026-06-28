// @zakkster/lite-headless / _overlay / focus.js
//
// Focus trap with explicit lifecycle:
//
//   const trap = createFocusTrap({ container, initialFocus, finalFocus });
//   trap.activate();    -- moves focus into the trap; binds Tab/Shift+Tab guard
//   trap.deactivate();  -- restores focus to finalFocus target; unbinds guard
//
// Initial focus resolution order (when `initialFocus === 'auto'`):
//   1. element matching [autofocus]
//   2. first tabbable descendant
//   3. the container itself (with tabindex=-1 ensured)
//
// `finalFocus` resolution:
//   - 'trigger'    -> element captured at activate() via document.activeElement
//   - element ref  -> that element
//   - selector     -> document.querySelector(selector) at deactivate time
//   - function     -> result of calling it at deactivate time
//   - false/null   -> no focus restoration
//
// Performance posture: the Tab key guard fires on every Tab/Shift+Tab keypress
// during trap activity. Naively this would re-run `querySelectorAll` and
// allocate a fresh node array on every keystroke. Instead we cache the
// tabbables list lazily and invalidate via MutationObserver when the
// container's subtree changes (childList + attributes that affect
// tabbability: `disabled`, `tabindex`, `inert`, `hidden`). The cache lives
// for the trap's active duration; a typical Tab in a stable dialog reads
// the cached array and does ZERO DOM queries.

const TABBABLE_SELECTOR = [
    "a[href]",
    "area[href]",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "button:not([disabled])",
    "iframe",
    "object",
    "embed",
    "[contenteditable]:not([contenteditable='false'])",
    "[tabindex]:not([tabindex='-1'])"
].join(",");

// Attributes that change tabbability. If any of these change on an existing
// element OR on a newly-added element, we invalidate.
const TABBABILITY_ATTRS = ["disabled", "tabindex", "inert", "hidden", "contenteditable"];

export function createFocusTrap(options = {}) {
    const { container, initialFocus = "auto", finalFocus = "trigger", trap = true } = options;
    let _previouslyFocused = null;
    let _active = false;
    let _onKey = null;

    // Tabbables cache + invalidation flag. The cache is rebuilt lazily on
    // the next Tab press after `_tabbablesDirty` flips to true.
    let _tabbablesCache = null;
    let _tabbablesDirty = true;
    let _mo = null;   // MutationObserver

    function invalidateTabbables() { _tabbablesDirty = true; }

    function getCachedTabbables() {
        if (_tabbablesDirty) {
            _tabbablesCache = getTabbables(container);
            _tabbablesDirty = false;
        }
        return _tabbablesCache;
    }

    function activate() {
        if (_active || !container) return;
        _active = true;

        _previouslyFocused = (typeof document !== "undefined") ? document.activeElement : null;

        if (!container.hasAttribute("tabindex")) {
            container.setAttribute("tabindex", "-1");
        }

        // Force first-time compute (so initialFocus resolution uses the
        // same array the Tab guard will use).
        _tabbablesDirty = true;

        const target = resolveInitial(container, initialFocus, getCachedTabbables);
        if (target && typeof target.focus === "function") {
            try { target.focus({ preventScroll: true }); } catch { target.focus(); }
        }

        // Non-modal popovers move initial focus but don't capture Tab cycling
        if (!trap) return;

        // Install MutationObserver to keep the tabbables cache fresh.
        // Cheap: only the dirty flag is flipped, the actual rebuild is
        // deferred until the next Tab press.
        if (typeof MutationObserver !== "undefined") {
            _mo = new MutationObserver(invalidateTabbables);
            _mo.observe(container, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: TABBABILITY_ATTRS,
            });
        }

        _onKey = (e) => {
            if (e.key !== "Tab" && e.keyCode !== 9) return;
            const tabbables = getCachedTabbables();
            if (tabbables.length === 0) {
                e.preventDefault();
                if (typeof container.focus === "function") container.focus();
                return;
            }
            const first = tabbables[0];
            const last  = tabbables[tabbables.length - 1];
            const active = (typeof document !== "undefined") ? document.activeElement : null;

            if (e.shiftKey) {
                if (active === first || !container.contains(active)) {
                    e.preventDefault();
                    if (typeof last.focus === "function") last.focus();
                }
            } else {
                if (active === last || !container.contains(active)) {
                    e.preventDefault();
                    if (typeof first.focus === "function") first.focus();
                }
            }
        };

        if (typeof document !== "undefined") {
            document.addEventListener("keydown", _onKey, true);
        }
    }

    function deactivate() {
        if (!_active) return;
        _active = false;

        if (_onKey && typeof document !== "undefined") {
            document.removeEventListener("keydown", _onKey, true);
        }
        _onKey = null;

        if (_mo) { _mo.disconnect(); _mo = null; }
        _tabbablesCache = null;
        _tabbablesDirty = true;

        const target = resolveFinal(finalFocus, _previouslyFocused);
        if (target && typeof target.focus === "function") {
            try { target.focus({ preventScroll: true }); } catch { target.focus(); }
        }
        _previouslyFocused = null;
    }

    function destroy() {
        deactivate();
    }

    return { activate, deactivate, destroy, get active() { return _active; } };
}

// ----- helpers ------------------------------------------------------------

// Allocates an array per call -- only invoked when the MutationObserver has
// flipped the dirty flag (rare). Steady-state Tab traversal reuses the cache.
function getTabbables(root) {
    if (!root || !root.querySelectorAll) return EMPTY;
    const all = root.querySelectorAll(TABBABLE_SELECTOR);
    // Filter into a fresh array. We can't reuse a scratch since the result
    // may be held across many subsequent Tabs (until next invalidation),
    // and a shared scratch would risk being mutated mid-traversal if
    // another trap nested. The allocation is bounded by invalidation events.
    const out = [];
    for (let i = 0; i < all.length; i++) {
        const el = all[i];
        if (el.disabled) continue;
        if (el.getAttribute("tabindex") === "-1") continue;
        if (el.hasAttribute("inert")) continue;
        if (!isVisible(el)) continue;
        out.push(el);
    }
    return out;
}

const EMPTY = Object.freeze([]);

// Visibility check. Prefers Element.checkVisibility() (standardized, modern
// browsers). Falls back to getComputedStyle for display:none / visibility:hidden.
function isVisible(el) {
    if (typeof el.checkVisibility === "function") {
        try { return el.checkVisibility({ visibilityProperty: true }); } catch { /* fall through */ }
    }
    try {
        const cs = (typeof getComputedStyle === "function") ? getComputedStyle(el) : null;
        if (!cs) return true;
        if (cs.display === "none") return false;
        if (cs.visibility === "hidden" || cs.visibility === "collapse") return false;
        return true;
    } catch {
        return true;
    }
}

function resolveInitial(container, spec, getTabbablesFn) {
    if (spec === false || spec === null) return null;
    if (spec === "auto") {
        const auto = container.querySelector && container.querySelector("[autofocus]");
        if (auto) return auto;
        const tabbables = getTabbablesFn();
        if (tabbables.length > 0) return tabbables[0];
        return container;
    }
    if (typeof spec === "string") {
        return container.querySelector(spec) || container;
    }
    if (typeof spec === "function") {
        const r = spec();
        return r || container;
    }
    if (spec && spec.nodeType === 1) return spec;
    return container;
}

function resolveFinal(spec, previouslyFocused) {
    if (spec === false || spec === null) return null;
    if (spec === "trigger") return previouslyFocused;
    if (typeof spec === "string") {
        return (typeof document !== "undefined") ? document.querySelector(spec) : null;
    }
    if (typeof spec === "function") return spec();
    if (spec && spec.nodeType === 1) return spec;
    return previouslyFocused;
}
