// @zakkster/lite-headless / toast
//
// Headless ephemeral notifications with auto-dismiss, swipe-to-dismiss
// (pointer + touch), pause on hover/focus, stack management, and a
// live region for screen readers.
//
// CONTRACT
//
// Unlike most primitives in the family, toast CREATES dynamic DOM at
// show() time -- consumers pass either a pre-built element or a
// string (wrapped in a minimal element with role="status"). The
// primitive owns the lifecycle from append-to-viewport to removal.
//
// Consumers style:
//   - the viewport container (positioning, layout direction, max-width)
//   - each toast's appearance (background, padding, icons, close button)
//
// Consumers DO NOT style:
//   - the auto-dismiss timing (controlled by `duration` option)
//   - the swipe transform (managed by the primitive during pointermove)
//   - any aria-* attributes (managed by the primitive)
//
// PLACEMENT
//
// `placement` is informational + drives swipe direction. The actual
// position of the viewport on screen is consumer-controlled CSS. The
// six standard placements are:
//
//   top-left      top-center      top-right
//   bottom-left   bottom-center   bottom-right
//
// New toasts always go nearest the anchored edge:
//   - top-*    -> new toast appended at TOP of viewport (visual stack
//                 grows downward away from the edge)
//   - bottom-* -> new toast appended at BOTTOM (visual stack grows
//                 upward away from the edge)
//
// For consumers preferring the inverse (new toasts AT the edge, older
// pushed away from it), they can reverse their viewport's flex
// direction in CSS. The primitive's append order is fixed.
//
// SWIPE
//
// `swipeToDismiss: true` (default) enables pointer-driven dismiss.
// Direction auto-derives from placement:
//   right placements -> swipe right
//   left placements  -> swipe left
//   top-center       -> swipe up
//   bottom-center    -> swipe down
//
// Consumers can override via `swipeDirection`. During swipe the
// primitive writes `--lh-toast-swipe-x` / `--lh-toast-swipe-y` numeric
// CSS variables (in px) so consumer CSS composes the transform. This
// matches the split-panels pattern of writing custom properties rather
// than inline transforms -- the consumer chooses what to do with the
// motion (translate, rotate, opacity).
//
// STACK MANAGEMENT
//
// `maxStack` caps the visible toast count. When show() is called past
// maxStack, the OLDEST toast auto-dismisses to make room. Queued
// toasts (waiting for older ones to expire) are NOT supported in v1;
// consumers handle queueing in userspace if needed.
//
// PAUSE
//
// pauseOnHover (default true) and pauseOnFocus (default true) freeze
// the auto-dismiss timer while the user interacts with the stack.
// Resume on hover-out / focus-out. The remaining time is tracked
// across pause/resume cycles so a toast that was 80% expired stays
// 80% expired through the pause.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";

const noop = () => {};
let _idCounter = 0;
const uniqueId = (prefix) => `${prefix}-${++_idCounter}`;
function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

const PLACEMENTS = new Set([
    "top-left", "top-center", "top-right",
    "bottom-left", "bottom-center", "bottom-right",
]);

// Map placement -> default swipe axis & sign. Positive sign means
// the dismiss-direction matches +x or +y axis.
function defaultSwipeForPlacement(placement) {
    if (placement === "top-right"    || placement === "bottom-right") return { axis: "x", sign:  1 };
    if (placement === "top-left"     || placement === "bottom-left")  return { axis: "x", sign: -1 };
    if (placement === "top-center")    return { axis: "y", sign: -1 };
    if (placement === "bottom-center") return { axis: "y", sign:  1 };
    return { axis: "x", sign: 1 };
}

export function createToast(options = {}) {
    const {
        placement       = "bottom-right",
        duration        = 5000,         // ms, 0 = no auto-dismiss
        swipeToDismiss  = true,
        swipeDirection  = "auto",       // "auto" | "left" | "right" | "up" | "down"
        swipeThreshold  = 50,           // px of motion to trigger dismiss
        maxStack        = 5,
        pauseOnHover    = true,
        pauseOnFocus    = true,
        announceLive    = true,
        defaultUrgent   = false,        // role=status (false) vs role=alert (true)
        onDismiss,                      // (id, reason) => void
        onShow,                         // (id) => void
    } = options;

    if (!PLACEMENTS.has(placement)) {
        throw new Error(`createToast: placement must be one of ${[...PLACEMENTS].join(", ")}, got "${placement}"`);
    }
    if (duration < 0 || !Number.isFinite(duration)) {
        throw new Error(`createToast: duration must be a non-negative finite number, got ${duration}`);
    }
    if (swipeThreshold < 0) {
        throw new Error(`createToast: swipeThreshold must be non-negative, got ${swipeThreshold}`);
    }

    // Resolve swipe direction once at construction
    const swipeDef = swipeDirection === "auto"
        ? defaultSwipeForPlacement(placement)
        : { axis: (swipeDirection === "up" || swipeDirection === "down") ? "y" : "x",
            sign: (swipeDirection === "right" || swipeDirection === "down") ? 1 : -1 };

    // ----- state -----------------------------------------------------
    const _hovering = makeSignal(false);
    const _focused  = makeSignal(false);
    const _entries  = new Map();        // id -> entry
    const _entriesOrdered = [];         // insertion order, oldest first
    let _viewportEl = null;
    let _liveRegionEl = null;
    let _destroyed = false;

    // ----- live region ----------------------------------------------
    // Visually hidden polite live region for announcements. Each toast
    // announce goes through this so screen readers pick it up
    // consistently regardless of consumer styling.
    function _announce(text, urgent) {
        if (!announceLive || !_liveRegionEl || !text) return;
        // For urgent (role=alert) toasts, the toast element itself has
        // role=alert which fires its own announcement -- skip the live
        // region echo. For status toasts, route through the live region.
        if (urgent) return;
        // Clearing first ensures repeats are re-announced (some SR
        // implementations debounce identical sequential content).
        _liveRegionEl.textContent = "";
        setTimeout(() => { if (_liveRegionEl) _liveRegionEl.textContent = text; }, 16);
    }

    // ----- placement-aware insertion --------------------------------
    function _insertEntry(entry) {
        const isTop = placement.startsWith("top-");
        if (!_viewportEl) return;
        if (isTop) {
            // new toasts at TOP of viewport (after the live region)
            // i.e., insert AFTER liveRegion (if present), BEFORE first
            // existing toast. We insert as the first non-live-region child.
            const ref = _liveRegionEl && _liveRegionEl.parentNode === _viewportEl
                ? _liveRegionEl.nextSibling
                : _viewportEl.firstChild;
            if (ref) _viewportEl.insertBefore(entry.el, ref);
            else _viewportEl.appendChild(entry.el);
        } else {
            // bottom placements -- append at end
            _viewportEl.appendChild(entry.el);
        }
    }

    // ----- entry lifecycle ------------------------------------------
    function _evictOldestIfNeeded() {
        // Caller is about to add a new toast; if we're already at
        // maxStack, dismiss the oldest one. The oldest is at index 0
        // of _entriesOrdered (insertion order).
        while (_entriesOrdered.length >= maxStack) {
            const victim = _entriesOrdered[0];
            _dismissEntry(victim, "maxstack-evict");
        }
    }

    function _startTimer(entry) {
        if (entry.duration <= 0) return;
        const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
        entry._timerStartedAt = now;
        entry._timerExpectedExpiry = now + entry._remaining;
        entry._timeoutHandle = setTimeout(() => {
            entry._timeoutHandle = null;
            _dismissEntry(entry, "auto-dismiss");
        }, entry._remaining);
    }
    function _stopTimer(entry) {
        if (entry._timeoutHandle != null) {
            clearTimeout(entry._timeoutHandle);
            entry._timeoutHandle = null;
        }
        if (entry._timerStartedAt != null) {
            const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
            const elapsed = now - entry._timerStartedAt;
            entry._remaining = Math.max(0, entry._remaining - elapsed);
            entry._timerStartedAt = null;
        }
    }

    function _dismissEntry(entry, reason) {
        if (entry._dismissed) return;
        entry._dismissed = true;
        _stopTimer(entry);
        // Detach swipe listeners if any
        if (entry._detachSwipe) { try { entry._detachSwipe(); } catch {} entry._detachSwipe = null; }
        // Remove from DOM
        if (entry.el && entry.el.parentNode) {
            try { entry.el.parentNode.removeChild(entry.el); } catch {}
        }
        // Remove from tracking
        _entries.delete(entry.id);
        const idx = _entriesOrdered.indexOf(entry);
        if (idx >= 0) _entriesOrdered.splice(idx, 1);
        if (onDismiss) { try { onDismiss(entry.id, reason || "manual"); } catch {} }
    }

    // ----- swipe-to-dismiss -----------------------------------------
    function _attachSwipe(entry) {
        if (!swipeToDismiss) return null;
        const el = entry.el;
        let startX = 0, startY = 0;
        let active = false;
        let pointerId = -1;

        const onDown = (e) => {
            if (e.button !== 0 && e.button !== undefined) return;
            // Don't start a swipe on interactive children -- close
            // buttons, links, inputs inside the toast.
            const t = e.target;
            const tag = t && t.tagName ? t.tagName.toUpperCase() : "";
            if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            startX = e.clientX;
            startY = e.clientY;
            pointerId = e.pointerId;
            active = true;
            try { el.setPointerCapture(pointerId); } catch {}
        };

        const onMove = (e) => {
            if (!active || e.pointerId !== pointerId) return;
            let dx = e.clientX - startX;
            let dy = e.clientY - startY;
            // Clamp to the dismiss axis. The perpendicular axis is
            // ignored visually (we still track for threshold math).
            if (swipeDef.axis === "x") {
                // Only allow motion in the dismiss direction (one-sided)
                if (swipeDef.sign > 0) dx = Math.max(0, dx);
                else                   dx = Math.min(0, dx);
                el.style.setProperty("--lh-toast-swipe-x", dx + "px");
                el.style.setProperty("--lh-toast-swipe-y", "0px");
                if (Math.abs(dx) > 1) setAttr(el, "data-swiping", "true");
            } else {
                if (swipeDef.sign > 0) dy = Math.max(0, dy);
                else                   dy = Math.min(0, dy);
                el.style.setProperty("--lh-toast-swipe-x", "0px");
                el.style.setProperty("--lh-toast-swipe-y", dy + "px");
                if (Math.abs(dy) > 1) setAttr(el, "data-swiping", "true");
            }
        };

        const onUp = (e) => {
            if (!active || e.pointerId !== pointerId) return;
            active = false;
            try { el.releasePointerCapture(pointerId); } catch {}
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const distance = swipeDef.axis === "x"
                ? swipeDef.sign * dx
                : swipeDef.sign * dy;
            removeAttr(el, "data-swiping");
            if (distance >= swipeThreshold) {
                // Mark dismissing for exit animation; consumer CSS can
                // transition the opacity/transform on this attribute.
                setAttr(el, "data-dismissing", "true");
                _dismissEntry(entry, "swipe");
            } else {
                // Snap back -- clear the swipe vars
                el.style.removeProperty("--lh-toast-swipe-x");
                el.style.removeProperty("--lh-toast-swipe-y");
            }
        };

        const onCancel = () => {
            active = false;
            try { el.releasePointerCapture(pointerId); } catch {}
            el.style.removeProperty("--lh-toast-swipe-x");
            el.style.removeProperty("--lh-toast-swipe-y");
            removeAttr(el, "data-swiping");
        };

        el.addEventListener("pointerdown",   onDown);
        el.addEventListener("pointermove",   onMove);
        el.addEventListener("pointerup",     onUp);
        el.addEventListener("pointercancel", onCancel);
        return () => {
            el.removeEventListener("pointerdown",   onDown);
            el.removeEventListener("pointermove",   onMove);
            el.removeEventListener("pointerup",     onUp);
            el.removeEventListener("pointercancel", onCancel);
        };
    }

    // ----- show / dismiss -------------------------------------------
    function _buildDefaultElement(content) {
        const el = document.createElement("div");
        el.textContent = content;
        return el;
    }

    function show(contentOrEl, opts) {
        if (_destroyed) return null;
        opts = opts || {};
        // resolve element
        let el;
        if (typeof contentOrEl === "string") {
            el = _buildDefaultElement(contentOrEl);
        } else if (contentOrEl && contentOrEl.nodeType === 1) {
            el = contentOrEl;
        } else {
            throw new Error("toast.show: content must be a string or an HTMLElement");
        }

        const id = opts.id || uniqueId("lh-toast");
        const isUrgent = opts.urgent != null ? !!opts.urgent : defaultUrgent;
        const entryDuration = opts.duration != null ? opts.duration : duration;
        const dismissible   = opts.dismissible !== false;

        // ARIA + data attributes
        setAttr(el, "role", isUrgent ? "alert" : "status");
        setAttr(el, "aria-live", isUrgent ? "assertive" : "polite");
        setAttr(el, "aria-atomic", "true");
        setAttr(el, "data-toast-id", id);
        setAttr(el, "data-placement", placement);

        // evict oldest if we're past maxStack
        _evictOldestIfNeeded();

        const entry = {
            id,
            el,
            urgent: isUrgent,
            duration: entryDuration,
            dismissible,
            _remaining: entryDuration,
            _timeoutHandle: null,
            _timerStartedAt: null,
            _dismissed: false,
            _detachSwipe: null,
        };
        _entries.set(id, entry);
        _entriesOrdered.push(entry);

        // Insert into viewport
        _insertEntry(entry);

        // Wire close-button auto-handling: any element inside the
        // toast with [data-toast-close] dismisses the toast.
        const closeBtns = el.querySelectorAll("[data-toast-close]");
        for (const btn of closeBtns) {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                _dismissEntry(entry, "close-button");
            });
        }

        // Swipe (per-entry; skipped if !dismissible)
        if (dismissible) entry._detachSwipe = _attachSwipe(entry);

        // Pause-aware timer: only start if not currently hovering/focused.
        // The effect below handles resuming.
        if (entry.duration > 0 && !_isPaused()) _startTimer(entry);

        // Announce
        _announce(el.textContent || opts.announce || "", isUrgent);

        if (onShow) { try { onShow(id); } catch {} }

        // Return a control object
        return {
            id,
            el,
            dismiss: (reason) => _dismissEntry(entry, reason || "manual"),
            update: (newContent, newOpts) => _updateEntry(entry, newContent, newOpts || {}),
        };
    }

    function _updateEntry(entry, newContent, newOpts) {
        if (entry._dismissed) return;
        // Update content
        if (typeof newContent === "string") {
            entry.el.textContent = newContent;
        } else if (newContent && newContent.nodeType === 1) {
            // replace children of the existing element with the new
            // element's children -- we don't replace the el itself so
            // existing listeners + ARIA attrs stay.
            while (entry.el.firstChild) entry.el.removeChild(entry.el.firstChild);
            entry.el.appendChild(newContent);
        }
        // Update duration -- reset timer with new duration
        if (newOpts.duration != null) {
            entry.duration = newOpts.duration;
            entry._remaining = newOpts.duration;
            _stopTimer(entry);
            if (entry._remaining > 0 && !_isPaused()) _startTimer(entry);
        }
        if (newOpts.urgent != null) {
            entry.urgent = !!newOpts.urgent;
            setAttr(entry.el, "role", entry.urgent ? "alert" : "status");
            setAttr(entry.el, "aria-live", entry.urgent ? "assertive" : "polite");
        }
    }

    function dismiss(id, reason) {
        const entry = _entries.get(id);
        if (entry) _dismissEntry(entry, reason || "manual");
    }
    function clear(reason) {
        // Dismiss every entry. Iterate over a snapshot so we don't
        // mutate the array while walking.
        const snap = _entriesOrdered.slice();
        for (const e of snap) _dismissEntry(e, reason || "clear");
    }

    // ----- pause/resume effect --------------------------------------
    function _isPaused() {
        return (pauseOnHover && _hovering()) || (pauseOnFocus && _focused());
    }
    // When hover/focus changes, stop or restart timers across all
    // active entries. We track elapsed time in _stopTimer so resume
    // honors the remaining slice.
    const stopPauseEffect = effect(() => {
        const paused = _isPaused();
        for (const entry of _entriesOrdered) {
            if (entry._dismissed) continue;
            if (entry.duration <= 0) continue;
            if (paused) {
                _stopTimer(entry);
                setAttr(entry.el, "data-paused", "true");
            } else {
                removeAttr(entry.el, "data-paused");
                if (entry._remaining > 0) _startTimer(entry);
                else _dismissEntry(entry, "auto-dismiss");
            }
        }
    });

    // ----- attachRoot ------------------------------------------------
    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _viewportEl = el;
        if (!el.id) el.id = uniqueId("lh-toast-viewport");
        setAttr(el, "role", "region");
        setAttr(el, "aria-label", el.getAttribute("aria-label") || "Notifications");
        setAttr(el, "data-placement", placement);

        // Build the visually-hidden polite live region for status
        // announcements. Each toast.show() with a non-urgent flag
        // pipes its text through here so screen readers consistently
        // pick it up regardless of consumer styling.
        if (announceLive) {
            _liveRegionEl = document.createElement("div");
            _liveRegionEl.setAttribute("aria-live", "polite");
            _liveRegionEl.setAttribute("aria-atomic", "true");
            _liveRegionEl.style.cssText = "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";
            el.appendChild(_liveRegionEl);
        }

        // Pause-on-hover / focus-within wiring (delegated at the
        // viewport, so we don't add listeners per toast).
        const onEnter = () => _hovering.set(true);
        const onLeave = () => _hovering.set(false);
        const onFocusIn  = () => _focused.set(true);
        const onFocusOut = (e) => {
            if (!el.contains(e.relatedTarget)) _focused.set(false);
        };
        el.addEventListener("mouseenter", onEnter);
        el.addEventListener("mouseleave", onLeave);
        el.addEventListener("focusin",  onFocusIn);
        el.addEventListener("focusout", onFocusOut);

        return () => {
            el.removeEventListener("mouseenter", onEnter);
            el.removeEventListener("mouseleave", onLeave);
            el.removeEventListener("focusin",  onFocusIn);
            el.removeEventListener("focusout", onFocusOut);
            if (_liveRegionEl && _liveRegionEl.parentNode === el) {
                el.removeChild(_liveRegionEl);
            }
            _liveRegionEl = null;
            if (_viewportEl === el) _viewportEl = null;
        };
    }

    // ----- destroy ---------------------------------------------------
    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPauseEffect();
        clear("destroy");
        _viewportEl = null;
        _liveRegionEl = null;
    }

    return {
        // reactive
        count:  () => _entriesOrdered.length,
        hovering: () => _hovering(),
        focused:  () => _focused(),
        // imperative
        show, dismiss, clear,
        getEntries: () => _entriesOrdered.map(e => ({ id: e.id, urgent: e.urgent })),
        // attachments
        attachRoot,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
    };
}
