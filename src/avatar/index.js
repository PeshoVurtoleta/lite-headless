// @zakkster/lite-headless / avatar
//
// User avatar with image + initials fallback. The classic admin-theme
// component: try to load an image, and if it errors (or no src given),
// show the user's initials on a deterministic color background derived
// from the name.
//
// API
//
//   createAvatar({
//       src?:        "user.jpg",        // optional image
//       name?:       "Alice Lee",       // for initials + color hash
//       initials?:   "AL",              // override the derived initials
//       fallbackDelay?: 0,              // ms to wait before showing fallback
//                                        // (prevents flash for fast loads)
//       onLoad?:     () => void,
//       onError?:    () => void,
//   })
//
//   attachRoot(el)             // span or div container; data-loaded painted
//   attachImage(imgEl)         // optional <img>; primitive manages src + visibility
//   attachFallback(el)         // container for initials text + bg color
//
//   state()                    // "image" | "fallback"
//   initials()                 // derived or override
//   colorHash()                // 0..359 hue for background
//   setSrc(newSrc)             // change src (re-attempt load)
//   destroy()
//
// CSS contract
//
//   root[data-loaded]              — image loaded successfully
//   root:not([data-loaded])        — using initials (fallback)
//   fallback[data-color-hue="N"]  — hue (0..359) for background color
//
//   Consumer CSS:
//     [data-avatar-fallback] {
//         background: oklch(60% 0.12 var(--hue));
//         color: oklch(95% 0.02 var(--hue));
//     }
//     [data-avatar-fallback]::after { content: attr(data-initials); }
//
// INITIALS DERIVATION
//
//   Word boundaries: take first letter of first + last word.
//   "Alice Lee"           -> "AL"
//   "Zahary Shinikchiev"  -> "ZS"
//   "Cher"                -> "C"
//   "M. Curie"            -> "MC"
//   "Jean-Paul Sartre"    -> "JS" (hyphen treated as word break)
//   "john@example.com"    -> "JO" (no spaces, take first two letters)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { toggleAttr } from "../_overlay/aria.js";

const noop = () => {};
function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

// Word-boundary regex for initials extraction. Splits on whitespace,
// hyphen, dot, underscore. Filters out empty results.
//
// Heuristics:
//   - email: strip @domain first (treat "alice@x.com" as just "alice")
//   - multi-word: first letter of first + last word ("Alice Lee" -> "AL")
//   - single word, capitalized (proper name): first letter only ("Cher" -> "C")
//   - single word, all-lowercase (username): first two letters ("zakkster" -> "ZA")
export function deriveInitials(name) {
    if (!name || typeof name !== "string") return "?";
    let s = name.trim();
    if (!s) return "?";
    // For email addresses, take the local part before "@"
    const at = s.indexOf("@");
    if (at > 0) s = s.slice(0, at);
    const parts = s.split(/[\s\-._]+/).filter(Boolean);
    if (parts.length === 0) {
        // Pathological -- all separators. Take first two letters of original.
        return s.slice(0, 2).toUpperCase();
    }
    if (parts.length === 1) {
        const only = parts[0];
        // Capitalized first letter -> treat as proper name (1 letter)
        // All-lowercase -> treat as a username/handle (2 letters)
        if (only !== only.toLowerCase()) {
            return only.charAt(0).toUpperCase();
        }
        return only.slice(0, 2).toUpperCase();
    }
    // Multi-word: first letter of first + last
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Deterministic hash -> hue in [0, 360). Simple FNV-1a variant.
export function hueFromString(str) {
    if (!str) return 0;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h % 360;
}

export function createAvatar(options = {}) {
    const {
        src: initialSrc = null,
        name = "",
        initials: initialsOverride = null,
        fallbackDelay = 0,
        onLoad,
        onError,
    } = options;

    const _src   = makeSignal(initialSrc);
    // state: "image" (img loaded ok) or "fallback" (no src OR load failed)
    const _state = makeSignal(initialSrc ? "loading" : "fallback");
    let _destroyed = false;
    let _rootEl = null;
    let _imgEl = null;
    let _fbEl = null;
    let _fbDelayTimer = null;

    const _initials = initialsOverride || deriveInitials(name);
    const _hue = hueFromString(name || initialSrc || "");

    function _showFallback() {
        if (_destroyed) return;
        _state.set("fallback");
    }
    function _showImage() {
        if (_destroyed) return;
        if (_fbDelayTimer) { clearTimeout(_fbDelayTimer); _fbDelayTimer = null; }
        _state.set("image");
    }

    function _onImgLoad() {
        if (_destroyed || !_imgEl) return;
        _showImage();
        if (onLoad) { try { onLoad(); } catch { /* swallow */ } }
    }
    function _onImgError() {
        if (_destroyed) return;
        if (fallbackDelay > 0) {
            _fbDelayTimer = setTimeout(() => {
                _fbDelayTimer = null;
                _showFallback();
            }, fallbackDelay);
        } else {
            _showFallback();
        }
        if (onError) { try { onError(); } catch { /* swallow */ } }
    }

    function setSrc(newSrc) {
        if (_destroyed) return;
        _src.set(newSrc || null);
        if (newSrc && _imgEl) {
            _state.set("loading");
            _imgEl.src = newSrc;
        } else {
            _showFallback();
        }
    }

    // ----- paint effect ------------------------------------------
    const stopPaint = effect(() => {
        const s = _state();
        if (_rootEl) {
            // v0.11.0: paint `data-loaded` (boolean). True iff the image
            // is currently displayed; false (absent) for fallback OR
            // loading. CSS targets the absence for fallback styling.
            const loaded = s === "image";
            toggleAttr(_rootEl, "data-loaded", loaded);
        }
        if (_imgEl) {
            // Hide img when in fallback (CSS can also do this via state)
            // but we set hidden as a hard guarantee for SR + non-styling
            // contexts.
            if (s === "image") {
                removeAttr(_imgEl, "hidden");
            } else {
                setAttr(_imgEl, "hidden", "");
            }
        }
        if (_fbEl) {
            if (s === "image") {
                setAttr(_fbEl, "hidden", "");
            } else {
                removeAttr(_fbEl, "hidden");
            }
        }
    });

    // ----- attach root ------------------------------------------
    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        const loaded = _state() === "image";
        toggleAttr(el, "data-loaded", loaded);
        if (!el.hasAttribute("role")) setAttr(el, "role", "img");
        if (!el.hasAttribute("aria-label") && name) setAttr(el, "aria-label", name);
        const off = () => {
            removeAttr(el, "data-loaded");
            if (_rootEl === el) _rootEl = null;
        };
        return off;
    }

    function attachImage(el) {
        if (!el || _destroyed) return noop;
        if (el.tagName !== "IMG") {
            throw new Error("attachImage: element must be an <img>");
        }
        _imgEl = el;
        setAttr(el, "decoding", "async");
        setAttr(el, "loading", "lazy");
        setAttr(el, "alt", name || "");
        el.addEventListener("load", _onImgLoad);
        el.addEventListener("error", _onImgError);
        if (_state() === "image") {
            removeAttr(el, "hidden");
        } else {
            setAttr(el, "hidden", "");
        }
        // Assign src last (after listeners are wired)
        if (_src()) {
            el.src = _src();
        }
        const off = () => {
            el.removeEventListener("load", _onImgLoad);
            el.removeEventListener("error", _onImgError);
            removeAttr(el, "hidden");
            if (_imgEl === el) _imgEl = null;
        };
        return off;
    }

    function attachFallback(el) {
        if (!el || _destroyed) return noop;
        _fbEl = el;
        setAttr(el, "data-avatar-fallback", "");
        setAttr(el, "data-initials", _initials);
        setAttr(el, "data-color-hue", String(_hue));
        setAttr(el, "aria-hidden", "true");        // root has role+label; this is decorative
        // Set --hue as a custom property too so CSS can use var(--hue) directly
        el.style.setProperty("--hue", String(_hue));
        if (_state() === "image") {
            setAttr(el, "hidden", "");
        } else {
            removeAttr(el, "hidden");
        }
        const off = () => {
            removeAttr(el, "data-avatar-fallback");
            removeAttr(el, "data-initials");
            removeAttr(el, "data-color-hue");
            removeAttr(el, "hidden");
            el.style.removeProperty("--hue");
            if (_fbEl === el) _fbEl = null;
        };
        return off;
    }

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        if (_fbDelayTimer) { clearTimeout(_fbDelayTimer); _fbDelayTimer = null; }
        stopPaint();
        // Clear attrs from each attached element. The attachX cleanups
        // also do this but destroy() can be called without first calling
        // them; both paths should leave the DOM clean.
        if (_rootEl) {
            removeAttr(_rootEl, "data-loaded");
        }
        if (_imgEl) {
            removeAttr(_imgEl, "hidden");
        }
        if (_fbEl) {
            removeAttr(_fbEl, "data-avatar-fallback");
            removeAttr(_fbEl, "data-initials");
            removeAttr(_fbEl, "data-color-hue");
            removeAttr(_fbEl, "hidden");
            _fbEl.style.removeProperty("--hue");
        }
        _rootEl = null;
        _imgEl  = null;
        _fbEl   = null;
    }

    return {
        state:     () => _state(),
        initials:  () => _initials,
        colorHash: () => _hue,
        setSrc,
        attachRoot, attachImage, attachFallback,
        destroy,
        get destroyed() { return _destroyed; },
    };
}
