// Test helpers: spin up a fresh happy-dom Window per test, expose required
// globals, and provide a teardown. Pattern is per-test (NOT per-file) so DOM
// state can't leak across cases.
//
// CRITICAL: each setupDOM() creates a Window with internal async task queues
// (microtask scheduler, fetch/abort controllers, MutationObserver dispatcher).
// teardownDOM MUST call window.happyDOM.close() or those queues keep the node
// process alive past test completion -- which manifests as the entire test
// FILE getting SIGKILLed by node:test runner after its per-file deadline.
// Fire-and-forget the returned promise; sync resource release happens first.

import { Window } from "happy-dom";
import { _resetScrollLockForTests } from "../src/_overlay/scroll-lock.js";

let _activeWindow = null;

export function setupDOM() {
    // tear down any leftover window from a previous test that forgot teardownDOM
    if (_activeWindow) {
        try { _activeWindow.happyDOM.close(); } catch { /* swallow */ }
        _activeWindow = null;
    }

    // reset module-scoped state from any prior test (defensive: prevents
    // refcount leaks from hiding real bugs in subsequent tests)
    _resetScrollLockForTests();

    const window = new Window();
    const document = window.document;
    _activeWindow = window;

    // expose globals the source code reads via globalThis
    globalThis.window = window;
    globalThis.document = document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.HTMLButtonElement = window.HTMLButtonElement;
    globalThis.HTMLInputElement = window.HTMLInputElement;
    globalThis.Element = window.Element;
    globalThis.Node = window.Node;
    globalThis.Event = window.Event;
    globalThis.KeyboardEvent = window.KeyboardEvent;
    globalThis.MouseEvent = window.MouseEvent;
    globalThis.PointerEvent = window.PointerEvent;
    globalThis.CustomEvent = window.CustomEvent;
    globalThis.customElements = window.customElements;
    // getComputedStyle: needed by the positioner's findClippingAncestor walk
    // and by any source that reads computed styles. happy-dom's implementation
    // reflects inline `el.style.*` correctly for the properties we use
    // (overflow, position).
    globalThis.getComputedStyle = window.getComputedStyle.bind(window);

    return { window, document };
}

export function teardownDOM() {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLInputElement;
    delete globalThis.Element;
    delete globalThis.Node;
    delete globalThis.Event;
    delete globalThis.KeyboardEvent;
    delete globalThis.MouseEvent;
    delete globalThis.PointerEvent;
    delete globalThis.CustomEvent;
    delete globalThis.customElements;
    delete globalThis.getComputedStyle;

    // CRITICAL: release happy-dom internal async resources. Without this, the
    // window's task scheduler keeps the node event loop alive across tests.
    // abort() synchronously cancels pending async tasks; close() returns a
    // Promise (resource release is async). For test teardown we want sync.
    if (_activeWindow) {
        try { _activeWindow.happyDOM.abort(); } catch { /* swallow */ }
        try { _activeWindow.happyDOM.close(); } catch { /* swallow */ }
        _activeWindow = null;
    }
    // Help V8 reclaim the detached Window's internals when --expose-gc is set
    if (typeof globalThis.gc === "function") {
        try { globalThis.gc(); } catch { /* swallow */ }
    }
}

export function flushMicrotasks() {
    return new Promise((resolve) => queueMicrotask(resolve));
}

export function dispatchKey(target, key, opts = {}) {
    const e = new globalThis.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts });
    target.dispatchEvent(e);
    return e;
}

export function dispatchPointer(target, type = "pointerdown", opts = {}) {
    const e = new globalThis.Event(type, { bubbles: true, cancelable: true, ...opts });
    target.dispatchEvent(e);
    return e;
}

export function dispatchClick(target) {
    const e = new globalThis.Event("click", { bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
}
