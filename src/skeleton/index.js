// @zakkster/lite-headless / skeleton
//
// Loading-state coordinator. The pattern: a page has multiple placeholder
// elements (avatar circle, name line, chart card, metric tiles). When data
// arrives, you want them all to reveal AT ONCE rather than piecemeal -- the
// "flash" of partial loading is uglier than the wait. The skeleton primitive
// owns:
//
//   - A reactive `ready` state (loading -> ready -> back to loading, etc.)
//   - Multi-source coordination: declare N data sources up front, mark them
//     resolved as they arrive; ready flips to true automatically when all
//     have resolved
//   - Optional `minVisibleMs` to prevent flash: if data loads sub-100ms, the
//     placeholders still show for a configurable minimum so the page doesn't
//     flicker
//   - Paint of data-loading + aria-busy on attached elements; consumer CSS
//     drives the actual placeholder shimmer + content fade
//
// What the primitive does NOT do:
//
//   - Render anything. The consumer provides placeholder + content elements
//     and styles them (skeleton shimmer animation, fade transitions, etc.)
//   - Choose between approaches. The minVisibleMs guard is opt-in; without
//     it, reveal fires synchronously the moment setReady(true) is called.
//   - Block content. Content is always in the DOM; `aria-busy` + opacity
//     management is the visibility mechanism. Screen readers announce the
//     content the moment data-loading flips.
//
// API
//
//   createSkeleton({
//       sources?:      readonly string[],     // multi-source coordination
//       minVisibleMs?: number,                // default 0 (no flash guard)
//       initiallyReady?: boolean,             // default false
//       onReveal?:     () => void,
//       onConceal?:    () => void,
//   })
//
//   attachRoot(el)          // data-skeleton-root + data-loading + aria-busy
//   attachPlaceholder(el)   // data-skeleton; consumer CSS shows + animates
//   attachContent(el)       // data-skeleton-content; hidden until ready
//
//   ready()                 // reactive accessor: true = revealed
//   pendingSources()        // reactive accessor: string[] of unresolved sources
//   isResolved(name)        // reactive predicate per source
//
//   setReady(b)             // direct toggle (respects minVisibleMs on reveal)
//   reveal()                // = setReady(true)
//   conceal()               // = setReady(false); also resets sources
//   resolve(source)         // mark a declared source resolved
//   reset()                 // mark all sources unresolved + setReady(false)
//   destroy()
//
// ARIA
//
//   role="status" + aria-live="polite" + aria-busy="true|false" on root
//
//   While loading: aria-busy="true". When ready: aria-busy="false" +
//   the content (which was always in the DOM) becomes the announced thing.
//
// CSS contract (defaults are unopinionated; example below)
//
//   [data-skeleton-root][data-loading] {
//       /* placeholders visible, content hidden */
//   }
//   [data-skeleton-root]:not([data-loading]) {
//       /* placeholders hidden, content visible */
//   }
//   [data-skeleton] {
//       /* shimmer placeholder */
//       background: linear-gradient(...);
//       animation: skeleton-shimmer 1.4s ease-in-out infinite;
//   }
//   [data-skeleton-root]:not([data-loading]) [data-skeleton] {
//       display: none;
//   }
//   [data-skeleton-content] {
//       opacity: 0;
//       transition: opacity 200ms;
//   }
//   [data-skeleton-root]:not([data-loading]) [data-skeleton-content] {
//       opacity: 1;
//   }

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { toggleAttr } from "../_overlay/aria.js";

const noop = () => {};

function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function createSkeleton(options = {}) {
    const {
        sources: declaredSources = [],
        minVisibleMs = 0,
        initiallyReady = false,
        onReveal,
        onConceal,
    } = options;

    if (!Array.isArray(declaredSources)) {
        throw new TypeError("createSkeleton: sources must be an array of strings");
    }

    // Per-source resolved state. We use a single Map signal so a `resolve()`
    // call notifies once; downstream `pendingSources` derives from it.
    // The Map is frozen-via-replacement: every mutation produces a fresh Map
    // so Object.is inequality notifies (mirroring lite-table's columnFilters).
    const initialMap = new Map();
    for (const s of declaredSources) initialMap.set(String(s), false);
    const _sources = makeSignal(initialMap);

    // ready is the resolved boolean: true once setReady(true) has been
    // accepted (post minVisibleMs guard). Multi-source coordination feeds
    // setReady automatically via an effect below.
    const _ready = makeSignal(initiallyReady === true);

    // Pending reveal timer for the minVisibleMs guard.
    let _pendingRevealTimer = null;
    const _mountedAt = now();

    let _rootEl = null;
    const _placeholderEls = new Set();
    const _contentEls = new Set();
    let _destroyed = false;
    let _lastFiredReady = initiallyReady === true;

    // Reactive: ready snapshot painted to attached elements.
    const stopPaint = effect(() => {
        const r = _ready();
        // v0.11.0: paint `data-loading` (boolean) instead of
        // `data-loading` boolean. Ready is the absence of
        // data-loading; CSS targets `[data-loading]` for the loading
        // visual, with normal styles flowing through otherwise.
        const loading = !r;
        if (_rootEl) {
            toggleAttr(_rootEl, "data-loading", loading);
            setAttr(_rootEl, "aria-busy", r ? "false" : "true");
        }
        for (const el of _placeholderEls) {
            toggleAttr(el, "data-loading", loading);
            if (r) setAttr(el, "aria-hidden", "true");
            else   removeAttr(el, "aria-hidden");
        }
        for (const el of _contentEls) {
            toggleAttr(el, "data-loading", loading);
            if (r) removeAttr(el, "aria-hidden");
            else   setAttr(el, "aria-hidden", "true");
        }

        // Fire reveal/conceal hooks on the EDGE transitions only.
        if (r && !_lastFiredReady) {
            if (onReveal) { try { onReveal(); } catch { /* swallow */ } }
            _lastFiredReady = true;
        } else if (!r && _lastFiredReady) {
            if (onConceal) { try { onConceal(); } catch { /* swallow */ } }
            _lastFiredReady = false;
        }
    });

    // Multi-source auto-reveal: when all declared sources resolve, flip ready.
    // We only auto-reveal here; auto-conceal on source `reset()` is handled
    // directly in `reset()`.
    const stopSourceWatcher = effect(() => {
        const m = _sources();
        if (m.size === 0) return;       // no sources declared -- ignore
        let allResolved = true;
        for (const v of m.values()) {
            if (!v) { allResolved = false; break; }
        }
        if (allResolved && !_ready()) {
            _setReadyInternal(true);
        }
    });

    // ----- public ----------------------------------------------------

    function ready() { return _ready(); }

    function pendingSources() {
        const out = [];
        for (const [k, v] of _sources()) {
            if (!v) out.push(k);
        }
        return out;
    }

    function isResolved(name) {
        const m = _sources();
        if (!m.has(String(name))) return false;
        return m.get(String(name)) === true;
    }

    // Internal: actually move the signal. Bypasses minVisibleMs guard, so
    // multi-source auto-reveal and the public setReady(true) both route here.
    function _setReadyInternal(b) {
        if (_destroyed) return;
        _ready.set(b === true);
    }

    function setReady(b) {
        if (_destroyed) return;
        const want = b === true;

        if (!want) {
            // Conceal: always cancel any pending reveal timer, even if we
            // were already loading (the timer is queued towards reveal --
            // letting it fire would contradict the explicit conceal).
            if (_pendingRevealTimer !== null) {
                clearTimeout(_pendingRevealTimer);
                _pendingRevealTimer = null;
            }
            if (_ready() === false) return;   // signal already correct
            _setReadyInternal(false);
            return;
        }

        // Reveal path.
        if (_ready() === true && _pendingRevealTimer === null) return;   // already revealed
        // Respect minVisibleMs guard.
        const elapsed = now() - _mountedAt;
        if (elapsed >= minVisibleMs) {
            // Clear any stale timer (e.g. set in the past but not yet fired).
            if (_pendingRevealTimer !== null) {
                clearTimeout(_pendingRevealTimer);
                _pendingRevealTimer = null;
            }
            _setReadyInternal(true);
            return;
        }
        const remaining = minVisibleMs - elapsed;
        if (_pendingRevealTimer !== null) clearTimeout(_pendingRevealTimer);
        _pendingRevealTimer = setTimeout(() => {
            _pendingRevealTimer = null;
            if (!_destroyed) _setReadyInternal(true);
        }, remaining);
    }

    function reveal() { setReady(true); }
    function conceal() { setReady(false); }

    function resolve(source) {
        if (_destroyed) return;
        const key = String(source);
        const m = _sources();
        if (!m.has(key)) {
            // Auto-register on first resolve so consumers can resolve
            // dynamically-discovered sources without declaring them up front.
            // This means "unknown source resolves" don't get silently dropped.
            const next = new Map(m);
            next.set(key, true);
            _sources.set(next);
            return;
        }
        if (m.get(key) === true) return;   // already resolved -- no-op
        const next = new Map(m);
        next.set(key, true);
        _sources.set(next);
    }

    function reset() {
        if (_destroyed) return;
        // Mark every declared source unresolved + go back to loading.
        const m = _sources();
        if (m.size > 0) {
            const next = new Map();
            for (const k of m.keys()) next.set(k, false);
            _sources.set(next);
        }
        if (_pendingRevealTimer !== null) {
            clearTimeout(_pendingRevealTimer);
            _pendingRevealTimer = null;
        }
        _setReadyInternal(false);
    }

    // ----- attach -----------------------------------------------------

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        setAttr(el, "data-skeleton-root", "");
        setAttr(el, "role", "status");
        setAttr(el, "aria-live", "polite");
        const r = _ready();
        toggleAttr(el, "data-loading", !r);
        setAttr(el, "aria-busy", r ? "false" : "true");
        const off = () => {
            removeAttr(el, "data-skeleton-root");
            removeAttr(el, "role");
            removeAttr(el, "aria-live");
            removeAttr(el, "aria-busy");
            removeAttr(el, "data-loading");
            if (_rootEl === el) _rootEl = null;
        };
        return off;
    }

    function attachPlaceholder(el) {
        if (!el || _destroyed) return noop;
        _placeholderEls.add(el);
        setAttr(el, "data-skeleton", "");
        const r = _ready();
        toggleAttr(el, "data-loading", !r);
        if (r) setAttr(el, "aria-hidden", "true");
        const off = () => {
            removeAttr(el, "data-skeleton");
            removeAttr(el, "data-loading");
            removeAttr(el, "aria-hidden");
            _placeholderEls.delete(el);
        };
        return off;
    }

    function attachContent(el) {
        if (!el || _destroyed) return noop;
        _contentEls.add(el);
        setAttr(el, "data-skeleton-content", "");
        const r = _ready();
        toggleAttr(el, "data-loading", !r);
        if (!r) setAttr(el, "aria-hidden", "true");
        const off = () => {
            removeAttr(el, "data-skeleton-content");
            removeAttr(el, "data-loading");
            removeAttr(el, "aria-hidden");
            _contentEls.delete(el);
        };
        return off;
    }

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPaint();
        stopSourceWatcher();
        if (_pendingRevealTimer !== null) {
            clearTimeout(_pendingRevealTimer);
            _pendingRevealTimer = null;
        }
        // Clear attrs from each attached element so the DOM is clean for the
        // next mount.
        if (_rootEl) {
            removeAttr(_rootEl, "data-skeleton-root");
            removeAttr(_rootEl, "data-loading");
            removeAttr(_rootEl, "aria-busy");
            removeAttr(_rootEl, "aria-live");
            removeAttr(_rootEl, "role");
        }
        for (const el of _placeholderEls) {
            removeAttr(el, "data-skeleton");
            removeAttr(el, "data-loading");
            removeAttr(el, "aria-hidden");
        }
        for (const el of _contentEls) {
            removeAttr(el, "data-skeleton-content");
            removeAttr(el, "data-loading");
            removeAttr(el, "aria-hidden");
        }
        _rootEl = null;
        _placeholderEls.clear();
        _contentEls.clear();
    }

    return {
        ready,
        pendingSources,
        isResolved,
        setReady, reveal, conceal,
        resolve, reset,
        attachRoot, attachPlaceholder, attachContent,
        destroy,
        get destroyed() { return _destroyed; },
    };
}
