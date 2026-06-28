// @zakkster/lite-headless / picture
//
// Headless wrapper around <picture>/<img> that adds:
//
//   - reactive load-state ("idle" -> "loading" -> "loaded" | "error")
//   - lazy-load coordination via IntersectionObserver (defers src
//     assignment until in-viewport; native `loading="lazy"` doesn't
//     give us a hook for blur-up coordination)
//   - container-query-driven source selection (ResizeObserver picks
//     the best source for the actual element size, not the viewport)
//   - error retry with exponential backoff
//   - aspect-ratio enforcement via data attribute (consumer CSS uses
//     aspect-ratio property to avoid layout shift)
//   - LQIP (low-quality image placeholder) crossfade
//
// API
//
//   createPicture({
//       src:           "image.jpg",
//       sources?:      [{ type, srcset, sizes }, ...],   // <source> list
//       placeholder?:  "data:..." | "blur-up.jpg",       // LQIP src
//       lazy?:         true,                              // default true
//       eager?:        false,                             // override for above-fold
//       aspectRatio?:  "16/9",                            // mirrors aspect-ratio CSS
//       containerSources?: [                              // { minWidth?, maxWidth?, src }
//           { maxWidth: 320, src: "small.jpg" },
//           { src: "large.jpg" },
//       ],
//       maxRetries?:   2,
//       onStateChange?: (state) => void,                  // "loading" | "loaded" | "error"
//       onLoad?:       () => void,
//       onError?:      (err) => void,
//   })
//
//   attachRoot(pictureEl)   // <picture> or any container
//   attachImg(imgEl)        // <img> — primitive controls src assignment
//
//   state()                 // signal accessor
//   retry()
//   destroy()
//
// CSS contract
//
//   The img + root both get data-img-state="idle|loading|loaded|error"
//   so consumer CSS can crossfade placeholders, show error UI, etc.
//
//   The img gets data-aspect-ratio="<ratio>" if aspectRatio is set.
//
// RATIONALE: lazy via IntersectionObserver vs native loading="lazy"
//
// Native loading="lazy" works great but gives no event hook for
// "now starts downloading" -- the placeholder/skeleton can't know
// when to start its transition. By controlling src assignment
// ourselves we get a clean "idle" -> "loading" -> "loaded" sequence
// for CSS transitions.
//
// We also set loading="lazy" on the underlying <img> so browsers
// that don't observe our IntersectionObserver (because the script
// loaded too late) still get native lazy behavior.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";

const noop = () => {};
function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

export function createPicture(options = {}) {
    const {
        src,
        sources = [],
        placeholder = null,
        lazy = true,
        eager = false,
        aspectRatio = null,
        containerSources = null,
        maxRetries = 2,
        rootMargin = "200px",   // start loading 200px before in-viewport
        onStateChange,
        onLoad,
        onError,
    } = options;

    if (!src) {
        throw new Error("createPicture: src is required");
    }

    // v1.0.0: `src` is mutable at runtime via `setSrc(next)`.
    // We capture the initial value here; `pickSrc()` reads `_src`
    // (not the destructured `src`) so the selector picks the
    // current source even after a runtime swap.
    let _src = src;

    // ----- state ------------------------------------------------------
    // states: "idle" (lazy, not yet in viewport)
    //         "loading" (src assigned, awaiting load event)
    //         "loaded" (load event fired)
    //         "error" (after retries exhausted)
    const _state = makeSignal((lazy && !eager) ? "idle" : "loading");
    let _destroyed = false;
    let _retries = 0;

    let _rootEl = null;
    let _imgEl = null;
    let _io = null;            // IntersectionObserver
    let _ro = null;            // ResizeObserver (for containerSources)
    let _activeSrc = null;     // currently-assigned src on the img

    function _setState(next) {
        if (_state() === next) return;
        _state.set(next);
        if (onStateChange) {
            try { onStateChange(next); } catch { /* swallow */ }
        }
    }

    // ----- source selection ------------------------------------------
    // If containerSources is set, pick the best one based on the
    // current element width. Otherwise just use _src (the current
    // runtime-mutable source).
    function pickSrc() {
        if (!containerSources || !_imgEl) return _src;
        const w = _imgEl.clientWidth || _rootEl?.clientWidth || 0;
        if (w <= 0) return _src;
        // find best match (most specific min/max that contains w)
        let best = null;
        for (const s of containerSources) {
            const minOK = s.minWidth == null || w >= s.minWidth;
            const maxOK = s.maxWidth == null || w <= s.maxWidth;
            if (minOK && maxOK) {
                // prefer narrower range (more specific)
                if (!best || (best.maxWidth ?? Infinity) - (best.minWidth ?? 0) > (s.maxWidth ?? Infinity) - (s.minWidth ?? 0)) {
                    best = s;
                }
            }
        }
        return best ? best.src : _src;
    }

    // ----- src assignment --------------------------------------------
    function _assignSrc() {
        if (!_imgEl || _destroyed) return;
        const next = pickSrc();
        if (next === _activeSrc) return;
        _activeSrc = next;
        _setState("loading");
        // Assign attributes that have to be on the img element itself.
        // Don't disturb the consumer's <source> children -- those are
        // declarative and the browser picks based on type/media.
        _imgEl.src = next;
    }

    // v1.0.0: runtime source mutation. Updates the canonical `_src`
    // value used by `pickSrc()`, then triggers an assignment if the
    // selected source actually changed. Safe to call before
    // `attachImg()` -- the new src will be picked up on attach.
    function setSrc(next) {
        if (_destroyed) return;
        if (typeof next !== "string" || next.length === 0) {
            throw new Error("setSrc: next must be a non-empty string");
        }
        if (_src === next) return;
        _src = next;
        // Reset retry counter so a new src gets a fresh budget
        _retries = 0;
        _assignSrc();
    }

    // ----- load + error handlers --------------------------------------
    function _onImgLoad() {
        if (_destroyed) return;
        _retries = 0;
        _setState("loaded");
        if (onLoad) {
            try { onLoad(); } catch { /* swallow */ }
        }
    }
    function _onImgError() {
        if (_destroyed) return;
        if (_retries < maxRetries) {
            _retries++;
            // exponential backoff: 100ms, 200ms, 400ms, ...
            const delay = 100 * Math.pow(2, _retries - 1);
            setTimeout(() => {
                if (_destroyed) return;
                // Re-assign by clearing _activeSrc so next call re-fires
                _activeSrc = null;
                _assignSrc();
            }, delay);
            return;
        }
        _setState("error");
        if (onError) {
            try { onError(new Error(`Failed to load ${_activeSrc} after ${maxRetries} retries`)); } catch { /* swallow */ }
        }
    }

    function retry() {
        if (_destroyed) return;
        _retries = 0;
        _activeSrc = null;
        _assignSrc();
    }

    // ----- intersection observer for lazy --------------------------
    function _setupIO() {
        if (!lazy || eager || _destroyed) return;
        if (!_rootEl) return;
        if (typeof IntersectionObserver === "undefined") {
            // No IO support -- fall back to immediate load
            _assignSrc();
            return;
        }
        _io = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    _assignSrc();
                    if (_io) { _io.disconnect(); _io = null; }
                    break;
                }
            }
        }, { rootMargin });
        _io.observe(_rootEl);
    }

    // ----- resize observer for containerSources -------------------
    function _setupRO() {
        if (!containerSources || _destroyed) return;
        if (!_rootEl) return;
        if (typeof ResizeObserver === "undefined") return;
        _ro = new ResizeObserver(() => {
            // Re-evaluate source if we're past the idle stage
            if (_state() !== "idle") _assignSrc();
        });
        _ro.observe(_rootEl);
    }

    // ----- attach root ---------------------------------------------
    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        if (aspectRatio) setAttr(el, "data-aspect-ratio", aspectRatio);
        // initial paint of state
        setAttr(el, "data-img-state", _state());

        // If both root + img are now attached, set up observers
        if (_imgEl) {
            _setupIO();
            _setupRO();
            if (!lazy || eager) _assignSrc();
        }

        const off = () => {
            removeAttr(el, "data-aspect-ratio");
            removeAttr(el, "data-img-state");
            if (_rootEl === el) _rootEl = null;
        };
        return off;
    }

    // ----- attach img ----------------------------------------------
    function attachImg(el) {
        if (!el || _destroyed) return noop;
        if (el.tagName !== "IMG") {
            throw new Error("attachImg: element must be an <img>");
        }
        _imgEl = el;
        if (aspectRatio) setAttr(el, "data-aspect-ratio", aspectRatio);
        setAttr(el, "data-img-state", _state());
        // Hint browser
        if (lazy && !eager) setAttr(el, "loading", "lazy");
        else setAttr(el, "loading", "eager");
        setAttr(el, "decoding", "async");
        // Placeholder (if any) goes in src immediately so something shows
        if (placeholder && _state() === "idle") {
            el.src = placeholder;
        }
        el.addEventListener("load", _onImgLoad);
        el.addEventListener("error", _onImgError);

        if (_rootEl) {
            _setupIO();
            _setupRO();
            if (!lazy || eager) _assignSrc();
        }

        const off = () => {
            el.removeEventListener("load", _onImgLoad);
            el.removeEventListener("error", _onImgError);
            removeAttr(el, "data-aspect-ratio");
            removeAttr(el, "data-img-state");
            if (_imgEl === el) _imgEl = null;
        };
        return off;
    }

    // ----- paint effect for state -----------------------------------
    const stopPaint = effect(() => {
        const s = _state();
        if (_rootEl) setAttr(_rootEl, "data-img-state", s);
        if (_imgEl)  setAttr(_imgEl,  "data-img-state", s);
    });

    // ----- destroy --------------------------------------------------
    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPaint();
        if (_io) { _io.disconnect(); _io = null; }
        if (_ro) { _ro.disconnect(); _ro = null; }
        // Clear the attributes we painted (attachRoot/attachImg cleanups
        // also clear them but destroy() can be called without first
        // calling the off() returned from attach. Both should leave
        // the DOM clean.)
        if (_rootEl) {
            removeAttr(_rootEl, "data-aspect-ratio");
            removeAttr(_rootEl, "data-img-state");
        }
        if (_imgEl) {
            removeAttr(_imgEl, "data-aspect-ratio");
            removeAttr(_imgEl, "data-img-state");
        }
        _rootEl = null;
        _imgEl = null;
    }

    return {
        state:   () => _state(),
        retry,
        setSrc,
        attachRoot,
        attachImg,
        destroy,
        get src() { return _src; },
        get destroyed() { return _destroyed; },
        get activeSrc() { return _activeSrc; },
    };
}
