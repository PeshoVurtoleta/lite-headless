// @zakkster/lite-headless / carousel
//
// Headless carousel per WAI-ARIA APG carousel pattern (basic with
// manual + autoplay variants).
//
// Source of truth for "current slide":
//   - DEFAULT (correctness, mixed-width slides): IntersectionObserver
//     reports intersectionRatio per slide; the slide with the highest
//     ratio wins. Handles any slide widths and any scroll-snap layout.
//   - OPT-IN FAST PATH (uniformSlideWidth: true): Math.round(
//     scrollLeft / slideWidth). Single scroll event handler runs at
//     animation-frame rate, no observer overhead, no allocation. Use
//     when you know all slides are the same width (the common case).
//
// Autoplay behavior follows the WAI-ARIA APG recommendation: pause on
// hover, focus-within, and any user-driven navigation. The Play/Pause
// button override is sticky — once the user pauses manually, hovering
// out doesn't resume.
//
// Layout-agnostic: this primitive does NOT enforce horizontal-vs-
// vertical, snap behavior, or any CSS. Consumers supply the viewport
// with `overflow: scroll`, `scroll-snap-type: x mandatory`, and
// `scroll-snap-align: start` on slides. This module reads scroll
// position + intersections and writes ARIA + data-active/data-playing.
//
// Reactive: `index()` returns the current index as a signal; `playing()`
// returns the autoplay state as a signal. Consumers can wire effects to
// either.

import { signal as makeSignal, effect, untrack } from "@zakkster/lite-signal";
import { toggleAttr } from "../_overlay/aria.js";

const noop = () => {};
let _idCounter = 0;
const uniqueId = (prefix) => `${prefix}-${++_idCounter}`;
function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

const REDUCED_MOTION =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createCarousel(options = {}) {
    const {
        orientation       = "horizontal",
        autoplay          = null,            // ms interval, null = no autoplay
        autoplayBehavior  = "pause",         // "pause" | "resume" on hover-out
        loop              = false,
        defaultIndex      = 0,
        uniformSlideWidth = false,           // opt-in fast path
        respectReducedMotion = true,
        // when reduced-motion is set, override autoplay to off
        // (consumers can override with respectReducedMotion: false)
        onIndexChange,
        onPlayingChange,
        scrollBehavior    = "smooth",        // passed to scrollTo
        // observer thresholds — finer thresholds give faster reaction to
        // partial scrolls; coarser is cheaper. 11 thresholds (0..1 step
        // 0.1) is a sweet spot — re-derivable as needed.
        observerThresholds,
    } = options;

    if (orientation !== "horizontal" && orientation !== "vertical") {
        throw new Error(`createCarousel: orientation must be "horizontal" or "vertical", got "${orientation}"`);
    }
    if (autoplay != null && (!Number.isFinite(autoplay) || autoplay <= 0)) {
        throw new Error(`createCarousel: autoplay must be a positive finite number, got ${autoplay}`);
    }

    // Autoplay defaults to off under reduced-motion (per APG)
    const effectiveAutoplay = (respectReducedMotion && REDUCED_MOTION) ? null : autoplay;

    // ----- state ------------------------------------------------------
    const _index = makeSignal(defaultIndex | 0);
    const _playing = makeSignal(effectiveAutoplay != null);
    const _isHover = makeSignal(false);
    const _isFocus = makeSignal(false);
    let _manualPaused = false;              // sticky once user clicks pause
    let _destroyed = false;

    let _rootEl = null;
    let _viewportEl = null;
    const _slides = new Map();              // index -> { el, off, ratio }
    let _slideCount = 0;
    let _prevEl = null;
    let _nextEl = null;
    let _playPauseEl = null;
    const _indicators = new Map();          // index -> el
    const _detachRoles = new Map();         // role-key -> off (for re-attach)

    // ----- IntersectionObserver --------------------------------------
    // Shared across all slides. Constructed lazily on first attachViewport.
    // Per-slide ratio cached in slide entries; current-index is derived
    // by max ratio across slides (only when not in uniform fast path).
    let _io = null;
    function ensureObserver() {
        if (_io) return _io;
        if (typeof IntersectionObserver === "undefined") return null;
        const thresholds = observerThresholds || (() => {
            const t = []; for (let i = 0; i <= 10; i++) t.push(i / 10); return t;
        })();
        _io = new IntersectionObserver((entries) => {
            // Update each entry's slide ratio. We do NOT iterate all
            // slides looking for the max from inside the callback —
            // the callback fires with only the entries that changed,
            // and we have to scan all slides anyway because the
            // "winning" slide may not have a new entry this tick.
            for (const e of entries) {
                const slide = _findSlideByEl(e.target);
                if (slide) slide.ratio = e.intersectionRatio;
            }
            if (!uniformSlideWidth) updateIndexFromObserver("scroll");
        }, {
            root: _viewportEl,
            threshold: thresholds,
        });
        return _io;
    }
    function _findSlideByEl(el) {
        // Slides are tagged with _lhCarouselIdx for O(1) lookup; the
        // observer callback gives us the element directly so we just
        // read the tag.
        const idx = el._lhCarouselIdx;
        return idx != null ? _slides.get(idx) : null;
    }

    function updateIndexFromObserver(reason) {
        if (_destroyed || _slides.size === 0) return;
        const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
        if (now < _scrollLockUntil) return;        // ignore during programmatic scroll
        let best = -1, bestRatio = -1;
        for (let i = 0; i < _slideCount; i++) {
            const s = _slides.get(i);
            if (!s) continue;
            if (s.ratio > bestRatio) {
                bestRatio = s.ratio;
                best = i;
            }
        }
        if (best >= 0 && best !== _index()) commit(best, reason);
    }

    // ----- fast path (uniform slide width) ----------------------------
    // The fast path reads scrollLeft once per animation frame (rAF
    // throttled). Computes index = round(scrollLeft / slideWidth).
    // Assumes all slides are equal width — falls back to observer if
    // we detect a mismatch.
    //
    // Layout-thrash guard: the original implementation read
    // `first.el.offsetWidth` on every rAF tick after a scroll event,
    // forcing a style+layout reflow per tick. Now cached -- the size
    // changes only on resize (window) or when slides are added/removed
    // (we wipe the cache then). Reading scrollLeft is cheap and doesn't
    // force layout when the value hasn't changed since paint.
    let _rafPending = false;
    let _cachedSlideSize = 0;        // 0 means "not yet measured"
    function invalidateSlideSize() { _cachedSlideSize = 0; }
    function ensureSlideSize(first, isH) {
        if (_cachedSlideSize > 0) return _cachedSlideSize;
        const size = isH ? first.el.offsetWidth : first.el.offsetHeight;
        if (size > 0) _cachedSlideSize = size;
        return size;
    }
    function onViewportScroll() {
        if (_destroyed || !_viewportEl || !uniformSlideWidth) return;
        if (_rafPending) return;
        _rafPending = true;
        requestAnimationFrame(() => {
            _rafPending = false;
            if (_destroyed || !_viewportEl) return;
            const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
            if (now < _scrollLockUntil) return;        // ignore during programmatic scroll
            const first = _slides.get(0);
            if (!first || !first.el) return;
            const isH = orientation === "horizontal";
            const slideSize = ensureSlideSize(first, isH);
            if (slideSize <= 0) return;
            const scroll = isH ? _viewportEl.scrollLeft : _viewportEl.scrollTop;
            const idx = Math.round(scroll / slideSize);
            const clamped = Math.max(0, Math.min(_slideCount - 1, idx));
            if (clamped !== _index()) commit(clamped, "scroll");
        });
    }

    // ----- commit -----------------------------------------------------
    function commit(nextIndex, reason) {
        if (_destroyed) return;
        const n = Math.max(0, Math.min(_slideCount - 1, nextIndex | 0));
        if (n === _index()) return;
        _index.set(n);
        if (onIndexChange) {
            try { onIndexChange(n, reason || "set"); } catch { /* swallow */ }
        }
    }

    // ----- imperative ------------------------------------------------
    // When go() initiates a smooth scroll, the IntersectionObserver
    // continues to fire during the animation with intersection ratios
    // reflecting the PRE-scroll layout (slide 0 ratio=1.0, slide 1=0).
    // Without a guard, the observer would call updateIndexFromObserver
    // mid-animation and commit BACK to slide 0, undoing the navigation.
    //
    // The lock ignores observer/fast-path updates for up to
    // SCROLL_LOCK_MS after a programmatic go(). The window is generous
    // (500ms) to cover typical smooth-scroll durations across viewport
    // sizes; the lock is automatically extended if go() is called
    // again mid-window. Manual scroll (touch swipe) leaves the lock at
    // 0 so observer events drive the index update.
    const SCROLL_LOCK_MS = 500;
    let _scrollLockUntil = 0;
    let _lastScrollTarget = -1;     // index we're currently scrolling toward

    function go(targetIndex, behavior, reason) {
        if (_destroyed) return;
        let n = targetIndex | 0;
        if (loop) {
            if (_slideCount > 0) {
                // wrap mathematically (handles negatives too)
                n = ((n % _slideCount) + _slideCount) % _slideCount;
            }
        } else {
            n = Math.max(0, Math.min(_slideCount - 1, n));
        }
        const slide = _slides.get(n);
        if (!slide || !slide.el || !_viewportEl) return;

        const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
        // Multi-click guard: if we're already scrolling toward this
        // SAME target, ignore. Without this, rapid clicks on the
        // next/prev buttons fire repeated scrollTo() calls -- each
        // one cancels the previous browser smooth-scroll, and the
        // cancellation interacts badly with `scroll-snap-type:
        // mandatory` (browser snaps to nearest snap-point during
        // the cancel, producing visible jitter). Matches the
        // accordion guard pattern. (v0.7.20)
        if (n === _lastScrollTarget && now < _scrollLockUntil) return;

        _lastScrollTarget = n;
        _scrollLockUntil  = now + SCROLL_LOCK_MS;
        _scrollToSlide(slide.el, behavior || scrollBehavior);
        // Optimistic commit -- scroll will eventually confirm via
        // observer/fast-path, but we don't want consumers seeing a
        // stale index right after their go() call.
        commit(n, reason || "go");
    }
    function next() { go(_index() + 1, scrollBehavior); }
    function prev() { go(_index() - 1, scrollBehavior); }
    function first() { go(0, scrollBehavior); }
    function last() { go(_slideCount - 1, scrollBehavior); }

    function _scrollToSlide(slideEl, behavior) {
        if (!_viewportEl || !slideEl) return;
        // Direct scrollTo with computed offset rather than
        // scrollIntoView. Three reasons:
        //   1. scrollIntoView scrolls EVERY scrollable ancestor that
        //      needs to scroll to make the element visible -- which
        //      in nested layouts (the demo's scene wrappers) caused
        //      first-click "jumps" as outer ancestors scrolled too.
        //      scrollTo only affects the viewport.
        //   2. scrollIntoView's smooth-scroll behavior varies across
        //      browsers (Safari is fond of doing instant snaps when
        //      scroll-snap-type:mandatory is set). scrollTo + behavior
        //      is consistent.
        //   3. Computing the offset locally lets us be precise about
        //      the target -- no risk of sub-pixel rounding triggering
        //      a snap-fight. (v0.7.20)
        const isH = orientation === "horizontal";
        if (isH) {
            _viewportEl.scrollTo({ left: slideEl.offsetLeft, behavior });
        } else {
            _viewportEl.scrollTo({ top: slideEl.offsetTop, behavior });
        }
    }

    // ----- autoplay --------------------------------------------------
    let _autoplayTimer = null;
    function _shouldRun() {
        if (_destroyed) return false;
        if (effectiveAutoplay == null) return false;
        if (_manualPaused) return false;
        if (!_playing()) return false;
        if (_isHover() && autoplayBehavior === "pause") return false;
        if (_isFocus() && autoplayBehavior === "pause") return false;
        return true;
    }
    function _tick() {
        if (!_shouldRun()) return;
        // advance one slide. Wraps if loop, stops at end otherwise.
        if (_index() >= _slideCount - 1 && !loop) {
            _playing.set(false);
            if (onPlayingChange) try { onPlayingChange(false, "autoplay-end"); } catch {}
            return;
        }
        next();
    }
    function _restartAutoplay() {
        if (_autoplayTimer != null) { clearInterval(_autoplayTimer); _autoplayTimer = null; }
        if (_shouldRun()) {
            _autoplayTimer = setInterval(_tick, effectiveAutoplay);
        }
    }
    function play(reason) {
        if (_destroyed || effectiveAutoplay == null) return;
        _manualPaused = false;
        if (!_playing()) {
            _playing.set(true);
            if (onPlayingChange) try { onPlayingChange(true, reason || "play"); } catch {}
        }
        _restartAutoplay();
    }
    function pause(reason) {
        if (_destroyed) return;
        _manualPaused = true;
        if (_playing()) {
            _playing.set(false);
            if (onPlayingChange) try { onPlayingChange(false, reason || "pause"); } catch {}
        }
        _restartAutoplay();
    }
    function toggle(reason) {
        if (_playing()) pause(reason || "toggle");
        else play(reason || "toggle");
    }

    // ----- attachments ------------------------------------------------
    function attachRoot(el, opts) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        if (!el.id) el.id = uniqueId("lh-carousel");
        setAttr(el, "role", "region");
        setAttr(el, "aria-roledescription", "carousel");
        if (opts && opts.label) setAttr(el, "aria-label", opts.label);
        setAttr(el, "data-orientation", orientation);

        const onMouseEnter = () => _isHover.set(true);
        const onMouseLeave = () => _isHover.set(false);
        const onFocusIn  = () => _isFocus.set(true);
        const onFocusOut = (e) => {
            // focus-within tracking via focusout: only set false if the
            // newly-focused element (relatedTarget) is OUTSIDE the root
            if (!el.contains(e.relatedTarget)) _isFocus.set(false);
        };
        el.addEventListener("mouseenter", onMouseEnter);
        el.addEventListener("mouseleave", onMouseLeave);
        el.addEventListener("focusin",   onFocusIn);
        el.addEventListener("focusout",  onFocusOut);
        const off = () => {
            el.removeEventListener("mouseenter", onMouseEnter);
            el.removeEventListener("mouseleave", onMouseLeave);
            el.removeEventListener("focusin",   onFocusIn);
            el.removeEventListener("focusout",  onFocusOut);
            if (_rootEl === el) _rootEl = null;
        };
        _detachRoles.set("root", off);
        return off;
    }

    function attachViewport(el) {
        if (!el || _destroyed) return noop;
        _viewportEl = el;
        if (!el.id) el.id = uniqueId("lh-carousel-viewport");
        // Initial aria-live paint -- the reactive effect below only
        // fires on subsequent _playing changes; the first run already
        // happened during construction when _viewportEl was null.
        setAttr(el, "aria-live", _playing() ? "off" : "polite");
        // observer needs root === viewport
        if (_io) { _io.disconnect(); _io = null; }
        ensureObserver();
        // re-observe any slides that were attached before viewport
        if (_io) {
            for (const slide of _slides.values()) {
                if (slide.el) _io.observe(slide.el);
            }
        }
        // fast-path scroll listener (passive)
        let onScroll = null;
        if (uniformSlideWidth) {
            onScroll = onViewportScroll;
            el.addEventListener("scroll", onScroll, { passive: true });
        }

        // Slide-size cache invalidation on viewport resize. ResizeObserver
        // fires once per layout, so this is cheap. We invalidate rather
        // than re-measure here because the next onViewportScroll rAF will
        // re-measure lazily.
        let _ro = null;
        if (uniformSlideWidth && typeof ResizeObserver !== "undefined") {
            _ro = new ResizeObserver(invalidateSlideSize);
            _ro.observe(el);
        }

        // Keyboard nav on the viewport (when it has focus). Consumer
        // can also give it tabindex="0" so it's keyboard-reachable.
        const onKeyDown = (e) => {
            if (_destroyed) return;
            const isH = orientation === "horizontal";
            if (e.key === (isH ? "ArrowRight" : "ArrowDown")) {
                e.preventDefault(); next();
                pause("keyboard");
            } else if (e.key === (isH ? "ArrowLeft" : "ArrowUp")) {
                e.preventDefault(); prev();
                pause("keyboard");
            } else if (e.key === "Home") {
                e.preventDefault(); first();
                pause("keyboard");
            } else if (e.key === "End") {
                e.preventDefault(); last();
                pause("keyboard");
            }
        };
        el.addEventListener("keydown", onKeyDown);

        const off = () => {
            if (onScroll) el.removeEventListener("scroll", onScroll);
            el.removeEventListener("keydown", onKeyDown);
            if (_ro) { _ro.disconnect(); _ro = null; }
            invalidateSlideSize();
            if (_viewportEl === el) _viewportEl = null;
            if (_io) { _io.disconnect(); _io = null; }
        };
        _detachRoles.set("viewport", off);
        return off;
    }

    function attachSlide(el, index, opts) {
        if (!el || _destroyed) return noop;
        if (!Number.isInteger(index) || index < 0) {
            throw new Error(`attachSlide: index must be a non-negative integer, got ${index}`);
        }
        const label = (opts && opts.label) || null;
        if (!el.id) el.id = uniqueId("lh-carousel-slide");
        el._lhCarouselIdx = index;
        setAttr(el, "role", "group");
        setAttr(el, "aria-roledescription", "slide");
        const entry = { el, label, ratio: 0 };
        _slides.set(index, entry);
        if (index + 1 > _slideCount) _slideCount = index + 1;
        // Slide-size cache reset: slide #0 is the measurement target,
        // so any add (including index 0 itself) invalidates. Even non-
        // zero index adds can shift layout if the consumer uses CSS
        // grid/flex on the viewport.
        invalidateSlideSize();
        // refresh ALL slides' aria-label (they include "N of M")
        repaintSlideLabels();

        if (_io && _viewportEl) _io.observe(el);

        // Initial data-active paint -- effect only fires on subsequent
        // _index changes. The attached slide needs to know whether it's
        // the active one right now.
        toggleAttr(el, "data-active", index === _index());

        return () => {
            try { delete el._lhCarouselIdx; } catch {}
            el.removeAttribute("aria-roledescription");
            el.removeAttribute("aria-label");
            el.removeAttribute("role");
            el.removeAttribute("data-active");
            if (_io) _io.unobserve(el);
            _slides.delete(index);
            invalidateSlideSize();
            // recompute slideCount
            let max = -1;
            for (const k of _slides.keys()) if (k > max) max = k;
            _slideCount = max + 1;
            repaintSlideLabels();
        };
    }

    function repaintSlideLabels() {
        for (const [idx, s] of _slides) {
            const labelText = s.label
                ? `${s.label} (${idx + 1} of ${_slideCount})`
                : `${idx + 1} of ${_slideCount}`;
            setAttr(s.el, "aria-label", labelText);
        }
    }

    function attachNext(el) {
        if (!el || _destroyed) return noop;
        _nextEl = el;
        setAttr(el, "aria-label", el.getAttribute("aria-label") || "Next Slide");
        if (_viewportEl) setAttr(el, "aria-controls", _viewportEl.id);
        const onClick = (e) => {
            e.preventDefault();
            next();
            if (effectiveAutoplay != null) pause("user-nav");
        };
        el.addEventListener("click", onClick);
        return () => {
            el.removeEventListener("click", onClick);
            if (_nextEl === el) _nextEl = null;
        };
    }
    function attachPrev(el) {
        if (!el || _destroyed) return noop;
        _prevEl = el;
        setAttr(el, "aria-label", el.getAttribute("aria-label") || "Previous Slide");
        if (_viewportEl) setAttr(el, "aria-controls", _viewportEl.id);
        const onClick = (e) => {
            e.preventDefault();
            prev();
            if (effectiveAutoplay != null) pause("user-nav");
        };
        el.addEventListener("click", onClick);
        return () => {
            el.removeEventListener("click", onClick);
            if (_prevEl === el) _prevEl = null;
        };
    }
    function attachIndicator(el, index) {
        if (!el || _destroyed) return noop;
        if (!Number.isInteger(index) || index < 0) {
            throw new Error(`attachIndicator: index must be a non-negative integer, got ${index}`);
        }
        _indicators.set(index, el);
        setAttr(el, "role", "tab");
        setAttr(el, "aria-label", el.getAttribute("aria-label") || `Slide ${index + 1}`);
        if (!el.id) el.id = uniqueId("lh-carousel-ind");
        const slide = _slides.get(index);
        if (slide && slide.el) setAttr(el, "aria-controls", slide.el.id);
        // Initial paint -- effect only fires on subsequent index changes
        const isCur = index === _index();
        setAttr(el, "aria-selected", isCur ? "true" : "false");
        toggleAttr(el, "data-active", isCur);
        setAttr(el, "tabindex", isCur ? "0" : "-1");
        const onClick = (e) => {
            e.preventDefault();
            go(index);
            if (effectiveAutoplay != null) pause("user-nav");
        };
        el.addEventListener("click", onClick);
        return () => {
            el.removeEventListener("click", onClick);
            el.removeAttribute("role");
            el.removeAttribute("aria-selected");
            el.removeAttribute("data-active");
            _indicators.delete(index);
        };
    }
    function attachPlayPause(el) {
        if (!el || _destroyed) return noop;
        _playPauseEl = el;
        const repaint = () => {
            const playing = _playing();
            setAttr(el, "aria-pressed", playing ? "true" : "false");
            setAttr(el, "aria-label", playing ? "Pause carousel" : "Play carousel");
            toggleAttr(el, "data-playing", playing);
        };
        repaint();
        const stop = effect(() => { _playing(); untrack(repaint); });
        const onClick = (e) => { e.preventDefault(); toggle("user-toggle"); };
        el.addEventListener("click", onClick);
        return () => {
            stop();
            el.removeEventListener("click", onClick);
            el.removeAttribute("aria-pressed");
            el.removeAttribute("aria-label");
            el.removeAttribute("data-playing");
            if (_playPauseEl === el) _playPauseEl = null;
        };
    }

    // ----- ARIA + state paint effect ---------------------------------
    // Runs whenever _index changes. Updates per-slide data-active and
    // indicator aria-selected/data-active.
    const stopPaint = effect(() => {
        const cur = _index();
        for (const [idx, s] of _slides) {
            const isCur = idx === cur;
            toggleAttr(s.el, "data-active", isCur);
        }
        for (const [idx, indEl] of _indicators) {
            const isCur = idx === cur;
            setAttr(indEl, "aria-selected", isCur ? "true" : "false");
            toggleAttr(indEl, "data-active", isCur);
            setAttr(indEl, "tabindex", isCur ? "0" : "-1");
        }
    });

    // Autoplay aria-live: when playing, set aria-live="off" on
    // viewport so screen readers don't announce every slide change.
    // When paused, set aria-live="polite" so reader picks up new
    // slides as the user navigates.
    const stopLive = effect(() => {
        const p = _playing();
        if (_viewportEl) setAttr(_viewportEl, "aria-live", p ? "off" : "polite");
    });

    // Restart timer whenever autoplay-relevant state changes
    const stopAutoplayWatch = effect(() => {
        _playing(); _isHover(); _isFocus();
        untrack(_restartAutoplay);
    });

    // ----- destroy ----------------------------------------------------
    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPaint();
        stopLive();
        stopAutoplayWatch();
        if (_autoplayTimer != null) { clearInterval(_autoplayTimer); _autoplayTimer = null; }
        if (_io) { _io.disconnect(); _io = null; }
        for (const off of _detachRoles.values()) {
            try { off(); } catch {}
        }
        _detachRoles.clear();
        _slides.clear();
        _indicators.clear();
        _rootEl = null;
        _viewportEl = null;
    }

    return {
        // reactive accessors (signal-returning)
        index: () => _index(),
        playing: () => _playing(),

        // imperative
        go, next, prev, first, last,
        play, pause, toggle,
        isPlaying: () => _playing(),
        slideCount: () => _slideCount,

        // attachments
        attachRoot,
        attachViewport,
        attachSlide,
        attachNext, attachPrev,
        attachIndicator,
        attachPlayPause,

        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
    };
}
