// @zakkster/lite-headless / anchor
//
// Sidebar scrollspy: as the user scrolls through a document, the
// link pointing at the section currently in view is marked active.
// Common in documentation pages, long-form articles, multi-section
// dashboards.
//
// One IntersectionObserver watches all linked sections; when a
// section's intersection ratio is highest, its corresponding link
// becomes active.
//
// Optionally, clicking a link scrolls smoothly to the target.
//
// Painted attributes:
//   root (link container):
//     data-anchor-root
//   links:
//     data-anchor-link
//     data-active                  (boolean -- the link for the section currently in view)
//     aria-current="location"      (when active)
//   sections (linked targets):
//     data-anchor-section
//     (no aria changes; consumer controls visual highlight if any)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

export function createAnchor(opts = {}) {
    const o = opts || {};
    const root = o.root || null;          // IO root; null = viewport
    const offsetTop = (typeof o.offsetTop === "number" && o.offsetTop >= 0)
                    ? o.offsetTop : 0;
    const smooth = o.smooth !== false;    // smooth scroll on link click
    const onChange = typeof o.onChange === "function" ? o.onChange : null;

    const _activeKey = makeSignal(null);   // identifier of currently-active link
    const _destroyed = { v: false };

    // Track sections + links by key. Each link has a target (the
    // section element it links to) and a key (string identifier,
    // typically the section's id).
    const _links = new Map();    // key -> { linkEl, sectionEl, off }
    const _intersectingKeys = new Set();   // keys currently visible

    let _observer = null;
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    function activeKey() { return _activeKey(); }

    function _recomputeActive() {
        if (_destroyed.v) return;
        // Pick the FIRST key that is intersecting, in DOM order of
        // the section elements. This produces the "earliest visible
        // section" behavior most scrollspy implementations use.
        if (_intersectingKeys.size === 0) return;
        // Build an ordered list by section position
        const sorted = [];
        for (const [key, entry] of _links) {
            if (_intersectingKeys.has(key)) {
                const rect = entry.sectionEl.getBoundingClientRect();
                sorted.push({ key, top: rect.top });
            }
        }
        sorted.sort((a, b) => a.top - b.top);
        if (sorted.length === 0) return;
        const next = sorted[0].key;
        if (_activeKey() !== next) {
            _activeKey.set(next);
            if (onChange) try { onChange(next); } catch {}
        }
    }

    function _ensureObserver() {
        if (_observer) return;
        if (typeof globalThis.IntersectionObserver !== "function") return;
        _observer = new globalThis.IntersectionObserver((entries) => {
            if (_destroyed.v) return;
            for (const entry of entries) {
                const key = entry.target.dataset.anchorSectionKey;
                if (!key) continue;
                if (entry.isIntersecting) _intersectingKeys.add(key);
                else _intersectingKeys.delete(key);
            }
            _recomputeActive();
        }, {
            root: root,
            rootMargin: "-" + offsetTop + "px 0px 0px 0px",
            threshold: 0,
        });
    }

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-anchor-root", "");
        const off = () => {
            removeAttr(el, "data-anchor-root");
        };
        addCleanup(off);
        return off;
    }

    function attachLink(linkEl, sectionEl, key) {
        if (!linkEl || !sectionEl || _destroyed.v) return noop;
        const k = (typeof key === "string" && key.length > 0)
                ? key
                : (sectionEl.id || ("anchor-key-" + _links.size));
        // Conflict: if a link already exists for this key, replace it.
        const prior = _links.get(k);
        if (prior) {
            try { prior.off(); } catch {}
        }
        setAttr(linkEl, "data-anchor-link", "");
        setAttr(sectionEl, "data-anchor-section", "");
        setAttr(sectionEl, "data-anchor-section-key", k);

        // Reactive paint of data-active + aria-current on the link.
        const stopEff = effect(() => {
            const active = _activeKey() === k;
            toggleAttr(linkEl, "data-active", active);
            if (active) setAttr(linkEl, "aria-current", "location");
            else removeAttr(linkEl, "aria-current");
        });

        // Click handler: smooth-scroll to the section (if smooth).
        const onClick = (ev) => {
            // Only handle plain left-click without modifier keys.
            if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
            if (ev.button !== undefined && ev.button !== 0) return;
            ev.preventDefault();
            const top = sectionEl.getBoundingClientRect().top + (root ? root.scrollTop : window.scrollY) - offsetTop;
            if (root) {
                root.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
            } else {
                window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
            }
            // Optimistically mark active immediately so the UI doesn't
            // wait for IO to catch up.
            if (_activeKey() !== k) {
                _activeKey.set(k);
                if (onChange) try { onChange(k); } catch {}
            }
        };
        linkEl.addEventListener("click", onClick);

        _ensureObserver();
        if (_observer) _observer.observe(sectionEl);

        const off = () => {
            stopEff();
            linkEl.removeEventListener("click", onClick);
            if (_observer) _observer.unobserve(sectionEl);
            _intersectingKeys.delete(k);
            _links.delete(k);
            removeAttr(linkEl, "data-anchor-link");
            removeAttr(linkEl, "data-active");
            removeAttr(linkEl, "aria-current");
            removeAttr(sectionEl, "data-anchor-section");
            removeAttr(sectionEl, "data-anchor-section-key");
            if (_activeKey() === k) _activeKey.set(null);
        };
        _links.set(k, { linkEl, sectionEl, off });
        addCleanup(off);
        return off;
    }

    // Test-only helper: force-pick an active link without IO.
    function _setActiveForTest(k) {
        if (_destroyed.v) return;
        if (!_links.has(k) && k !== null) return;
        if (_activeKey() === k) return;
        _activeKey.set(k);
        if (onChange) try { onChange(k); } catch {}
    }

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        if (_observer) { _observer.disconnect(); _observer = null; }
        // Run cleanups in reverse order; off() handlers detach links/sections.
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
        _links.clear();
        _intersectingKeys.clear();
    }

    return {
        activeKey,
        get linkCount() { return _links.size; },
        attachRoot, attachLink,
        destroy,
        _setActiveForTest,
        get destroyed() { return _destroyed.v; },
    };
}
