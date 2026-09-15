// @zakkster/lite-headless / saved-views / index.js
//
// createSavedViews(options) -> SavedViewsInstance
//
// A stateful controller for a NAMED collection of view snapshots plus an
// active view, dirty detection, and optional persistence. GENERIC over any
// getState / setState pair: it captures whatever getState() returns and hands
// it back to setState() on apply. It pairs naturally with @zakkster/lite-table's
// getViewState() / setViewState(view) but is NOT coupled to it -- no import, no
// peer, no devDep. A plain signal-backed stub drives the tests and torture.
//
// The classic "save this filter/sort/layout as a named view, switch between
// views, notice when the current state has drifted from the saved one" UX of
// every data-grid / dashboard.
//
// View shape:
//   {
//     id:    string   -- unique within the collection
//     name:  string   -- human label
//     state: any       -- the snapshot captured from getState(), stored BY
//                         REFERENCE (getState() returns a fresh object per call,
//                         so there is no aliasing; this primitive never clones)
//   }
//
// Fail-closed posture (ADR 0012): getState/setState are REQUIRED functions;
// unknown id on apply/update/rename/remove and a blank name throw TypeError;
// an unknown option key throws with a did-you-mean hint. null is not zero.
//
// Zero-GC posture (H-12): the two owned signals are held in `let` bindings and
// sealed on destroy() (pool-return + reads freeze). attachRoot paints only two
// cheap signal reads (count + active id) in one effect -- it never reads
// getState()/isDirty(), so an underlying-state change (a column-drag pixel) does
// not fan out into a getViewState() call here. Dirty stays PULL for the consumer.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";
import { sealSignal } from "../_overlay/seal.js";
import { checkOptions, checkOptionsHot } from "../_validate.js";

const OPTION_KEYS = "getState|setState|views|activeId|storage|equals|generateId|onChange|onActiveChange|onApply";
const VIEW_KEYS = "id|name|state";

function noop() {}

// Per-instance stamp so two instances that share one storage never mint
// colliding ids (the planner risk). Process-global counter; ids only need to be
// unique within a collection, but a distinct prefix per instance makes cross-
// instance collisions impossible too.
let _instanceSeq = 0;

function defaultEquals(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function createSavedViews(options = {}) {
    checkOptions("createSavedViews", options, OPTION_KEYS);
    const {
        getState,
        setState,
        views = [],
        activeId = null,
        storage = null,
        equals = defaultEquals,
        generateId,
        onChange,           // (views) => void
        onActiveChange,     // (id | null) => void
        onApply,            // (view) => void
    } = options;

    // getState/setState are the whole contract -- fail closed if either is
    // missing or not a function (null is not a function either).
    if (typeof getState !== "function") {
        throw new TypeError("createSavedViews: getState must be a function");
    }
    if (typeof setState !== "function") {
        throw new TypeError("createSavedViews: setState must be a function");
    }

    let _destroyed = false;
    const _cleanups = [];
    function addCleanup(fn) { if (fn) _cleanups.push(fn); }

    // Per-instance id generator: default is `sv-<instanceStamp>-<n++>`.
    const _stamp = (_instanceSeq = (_instanceSeq + 1) | 0);
    let _idSeq = 0;
    const genId = typeof generateId === "function"
        ? generateId
        : function () { return "sv-" + _stamp + "-" + (_idSeq++); };

    function normalizeView(v) {
        // Each provided view object is validated against the known keys -- an
        // unknown key (e.g. a typo'd `stat`) fails closed with a did-you-mean
        // hint. undefined stays a legal no-op; null throws (ADR 0005).
        checkOptionsHot("createSavedViews: view", v, VIEW_KEYS);
        return {
            id: String((v && v.id) || genId()),
            name: String((v && v.name) || ""),
            state: v ? v.state : undefined,
        };
    }

    // ----- state ---------------------------------------------------------
    //
    // `let`: destroy() seals these (H-12). Accessors read through the binding at
    // call time, so the swap costs the live paths nothing.
    const _storage = storage;
    let _seed = views;
    if (_storage && typeof _storage.load === "function") {
        const loaded = _storage.load();
        // Fail closed: only a real array seeds the collection (null is not an
        // empty list -- it means "no persisted state", so fall back to views).
        if (loaded != null && Array.isArray(loaded)) _seed = loaded;
    }
    let _views = makeSignal((_seed || []).map(normalizeView));
    let _activeId = makeSignal(activeId != null ? activeId : null);

    // ----- persistence + callbacks ---------------------------------------

    // The COLLECTION persists on save/update/remove/rename. The active id is
    // session state and is NOT persisted (consumers persist it via
    // onActiveChange if they want it). apply/clearActive therefore skip this.
    function persist() {
        if (_storage && typeof _storage.save === "function") {
            _storage.save(_views());
        }
    }

    function fireChange() {
        if (onChange) { try { onChange(_views().slice()); } catch { /* swallow */ } }
    }
    function fireActiveChange(id) {
        if (onActiveChange) { try { onActiveChange(id); } catch { /* swallow */ } }
    }
    function fireApply(view) {
        if (onApply) { try { onApply(view); } catch { /* swallow */ } }
    }

    function indexOfId(arr, id) {
        for (let i = 0; i < arr.length; i++) if (arr[i].id === id) return i;
        return -1;
    }

    // ----- reactive accessors + queries ----------------------------------

    function viewsAccessor() { return _views(); }
    function activeIdAccessor() { return _activeId(); }

    function getView(id) {
        const arr = _views();
        const idx = indexOfId(arr, id);
        return idx === -1 ? null : arr[idx];
    }

    // Pull: resolve the active view from the current collection + active id.
    function activeView() {
        const id = _activeId();
        if (id == null) return null;
        return getView(id);
    }

    // PULL-only dirty check. Reactive FOR FREE when read inside a computed /
    // effect, because getState() reads the underlying state signals; there is
    // deliberately NO second reactive path and it is NEVER painted in an
    // always-on effect (that would call getState() on every underlying-signal
    // change -- per-drag-pixel churn). See ADR 0012 ruling 2.
    function isDirty() {
        const av = activeView();
        return av ? !equals(getState(), av.state) : false;
    }

    // ----- mutations ------------------------------------------------------

    function save(name) {
        if (_destroyed) return undefined;
        if (typeof name !== "string" || name.trim() === "") {
            throw new TypeError("createSavedViews.save: name must be a non-blank string");
        }
        // Snapshot stored by reference: getState() returns a fresh object per
        // call, so there is no aliasing and no clone.
        const snapshot = getState();
        const view = { id: genId(), name: String(name), state: snapshot };
        _views.set(_views().concat([view]));  // append, insertion order
        _activeId.set(view.id);
        persist();
        fireChange();
        fireActiveChange(view.id);
        return view;
    }

    function update(id) {
        if (_destroyed) return;
        const target = id != null ? id : _activeId();
        if (target == null) {
            throw new TypeError("createSavedViews.update: no id given and no active view");
        }
        const cur = _views();
        const idx = indexOfId(cur, target);
        if (idx === -1) {
            throw new TypeError('createSavedViews.update: unknown view id "' + target + '"');
        }
        const next = cur.slice();
        next[idx] = { id: cur[idx].id, name: cur[idx].name, state: getState() };
        _views.set(next);
        persist();
        fireChange();
    }

    function apply(id) {
        if (_destroyed) return;
        const view = getView(id);
        if (view == null) {
            throw new TypeError('createSavedViews.apply: unknown view id "' + id + '"');
        }
        setState(view.state);
        _activeId.set(id);
        // collection unchanged -> no persist (active id is session state)
        fireApply(view);
        fireActiveChange(id);
    }

    function remove(id) {
        if (_destroyed) return;
        const cur = _views();
        const idx = indexOfId(cur, id);
        if (idx === -1) {
            throw new TypeError('createSavedViews.remove: unknown view id "' + id + '"');
        }
        const next = cur.slice();
        next.splice(idx, 1);
        _views.set(next);
        const wasActive = _activeId() === id;
        if (wasActive) _activeId.set(null);
        persist();
        fireChange();
        if (wasActive) fireActiveChange(null);
    }

    function rename(id, name) {
        if (_destroyed) return;
        if (typeof name !== "string" || name.trim() === "") {
            throw new TypeError("createSavedViews.rename: name must be a non-blank string");
        }
        const cur = _views();
        const idx = indexOfId(cur, id);
        if (idx === -1) {
            throw new TypeError('createSavedViews.rename: unknown view id "' + id + '"');
        }
        const next = cur.slice();
        next[idx] = { id: cur[idx].id, name: String(name), state: cur[idx].state };
        _views.set(next);
        persist();
        fireChange();
    }

    function clearActive() {
        if (_destroyed) return;
        if (_activeId() != null) {
            _activeId.set(null);
            fireActiveChange(null);
        }
    }

    // ----- attach helpers -------------------------------------------------
    //
    // The primitive builds no DOM -- the consumer renders however they like.
    // attach* paint state attributes on consumer-provided elements.

    const _itemEls = new Map();     // el -> { id, off }

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        ensureId(el, "lh-sv");
        setAttr(el, "role", "group");
        setAttr(el, "aria-label", "Saved views");
        // ONE effect painting ONLY the two cheap signal reads. ZERO-ALLOC: never
        // reads getState()/isDirty() (see ADR 0012 ruling 2).
        const stop = effect(() => {
            setAttr(el, "data-sv-count", String(_views().length));
            setAttr(el, "data-sv-active", _activeId() || "");
        });
        addCleanup(stop);
        const off = () => {
            stop();
            el.removeAttribute("role");
            el.removeAttribute("aria-label");
            el.removeAttribute("data-sv-count");
            el.removeAttribute("data-sv-active");
        };
        addCleanup(off);
        return off;
    }

    function attachItem(el, id) {
        if (!el || _destroyed || id == null) return noop;
        const prev = _itemEls.get(el);
        if (prev) prev.off();

        ensureId(el, "lh-sv-item");
        setAttr(el, "data-sv-id", String(id));
        setAttr(el, "role", "option");
        if (!el.hasAttribute("tabindex")) setAttr(el, "tabindex", "0");

        const stop = effect(() => {
            toggleAttr(el, "data-sv-active", id === _activeId());
        });

        const onClick = () => { apply(id); };
        el.addEventListener("click", onClick);
        const onKey = (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                apply(id);
            }
        };
        el.addEventListener("keydown", onKey);

        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKey);
            el.removeAttribute("data-sv-id");
            el.removeAttribute("data-sv-active");
            el.removeAttribute("role");
            _itemEls.delete(el);
        };
        _itemEls.set(el, { id, off });
        addCleanup(off);
        return off;
    }

    // ----- teardown -------------------------------------------------------

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch { /* swallow */ }
        }
        _cleanups.length = 0;
        _itemEls.clear();
        // return the pooled signal nodes after every effect stopped; reads
        // freeze at the final value (H-12)
        _views = sealSignal(_views);
        _activeId = sealSignal(_activeId);
    }

    return {
        // reactive
        views: viewsAccessor,
        activeId: activeIdAccessor,
        activeView,
        isDirty,
        // queries
        getView,
        // mutations
        save, update, apply, remove, rename, clearActive,
        // attach
        attachRoot, attachItem,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
        // introspection
        _itemEls: () => _itemEls,
    };
}
