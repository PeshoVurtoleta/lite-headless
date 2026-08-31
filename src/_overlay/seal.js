// @zakkster/lite-headless / _overlay / seal.js
//
// sealSignal(sig) -> frozen stand-in
//
// Returns the pooled lite-signal node to the registry (H-12) and hands back a
// stand-in that keeps answering the final pre-destroy value. Two constraints
// meet here:
//
//   1. destroy() must dispose every owned node -- lite-signal pools nodes in
//      a fixed-capacity registry (default 1024, fail-fast CapacityError), so
//      an undisposed signal occupies a slot forever and churned
//      create/destroy cycles exhaust the ledger. This is pool-slot
//      accumulation, not object retention: lite-leak reports clean.
//   2. The destroy contract, pinned by the per-primitive destroy tests, is
//      "writes no-op, reads freeze at destroy" -- e.g. popover asserts
//      open() === true after destroying an open popover. A disposed node
//      reads undefined, so the raw signal cannot remain the read target.
//
// The pattern: factories hold owned signals in `let` bindings and their
// accessors read through the binding at call time (`function value() {
// return _value(); }`). destroy() reassigns:
//
//     _value = sealSignal(_value);
//
// A binding load costs the same for let and const (one context-slot read),
// so live reads gain zero bytes and zero branches; the stand-in is built
// once, on the cold destroy path. Signals the consumer supplied (controlled
// mode) are never sealed -- they stay the consumer's live state.
//
// Stand-in surface mirrors the source handle: call and peek() answer the
// frozen value; subscribe(cb) mirrors live-signal semantics -- fire once
// with the current (final) value, never again, no-op unsubscribe -- with the
// suite's swallow-on-teardown policy applied to the callback; set()/update()
// exist (as no-ops) only when the source had them, so a computed's stand-in
// stays write-free.

import { dispose } from "@zakkster/lite-signal";

function _noop() {}

export function sealSignal(sig) {
    const v = sig.peek();
    dispose(sig);
    const read = () => v;
    read.peek = read;
    if (typeof sig.set === "function") {
        read.set = _noop;
        read.update = _noop;
    }
    read.subscribe = (cb) => {
        try { cb(v); } catch { /* swallow */ }
        return _noop;
    };
    return read;
}
