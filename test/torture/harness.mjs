/**
 * @zakkster/lite-headless -- torture harness (the transient witness).
 *
 * PROVENANCE. Ported from LiteForm/test/torture/harness.mjs (proven twice in
 * that package). Trimmed to what lite-headless needs: no loadForm/FORM_URL
 * (the primitives are static imports, not a swappable module under test), no
 * mirror/deepEqual/withRegistry (lite-form's registry-scoped oracle machinery
 * has no analogue here -- headless runs on lite-signal's default fixed 1024-
 * node registry, H-12), and no PRNG (see the ruling note below).
 *
 * WHY THIS WITNESS EXISTS. V8's new space is a bump allocator: each allocation
 * advances a pointer, and the used-bytes figure only falls when a scavenge
 * runs. So if we gc() to a clean slate, then run a synchronous loop with NO GC
 * between two samples, the new_space used-bytes DELTA around the loop is exactly
 * the transient garbage the loop produced -- byte-stable across runs, scaling
 * with per-op allocation (0 B/op stays flat, 32 B/op grows linearly). This is
 * the ONLY witness that can see per-op transient garbage in a synchronous
 * window. checkNoGc cannot: perf_hooks GC entries are event-loop-deferred, so
 * inside one synchronous loop gc.minor reads 0 even for a 96 MB-allocating
 * loop. A gc-bracketed heapUsed delta cannot either: a full GC on both ends
 * reclaims the transients by construction. Both older lanes are blind to the
 * per-op garbage this lane is built to catch.
 *
 * FOUR DISCIPLINES (ported verbatim in spirit):
 *   1. SCRATCH ONCE. All scratch is allocated by the caller OUTSIDE every
 *      measured loop. This module hands out helpers and window wrappers, never
 *      per-call allocations on a measured hot path. (One known exception: the
 *      CLOSING newSpaceUsed() sample sits inside the measured segment, so its
 *      getHeapSpaceStatistics result may land in the counted delta -- a fixed,
 *      per-window-uniform constant folded into every total, well under the
 *      budget; the ~2.9-7.6 KB "clean window" signature includes it.)
 *   2. FAILURE-ONLY MESSAGES. check(cond, msgThunk) builds its string ONLY on
 *      failure -- a template literal per iteration is an allocation the witness
 *      would then charge to the workload. Pass a thunk, never a pre-built
 *      string.
 *   3. ONE MEASUREMENT WINDOW AT A TIME. lite-gc-profiler and this witness
 *      share one heap. Windows are opened and closed one at a time and run
 *      strictly sequentially -- never nested, never concurrent.
 *   4. FAIL CLOSED ON VOID. A measurement that cannot be trusted dies; it never
 *      silently skips. Missing new_space -> die. A negative new_space delta
 *      means a scavenge ran mid-window (the workload overflowed new space) ->
 *      die VOID. A total at or past the shrink ceiling -> die with a shrink-ops
 *      hint.
 *
 * PRNG RULING (PLAN ruling e). The seeded xorshift32 from the LiteForm harness
 * is NOT ported this session: every H8 drive is deterministic (modular index
 * walk, fixed step, scratch-table cycle, fixed rect mutation), so a PRNG with
 * no consumer is dead bytes in a file whose whole point is counting bytes. The
 * env name HEADLESS_TORTURE_SEED is RESERVED here for the first window that
 * needs a randomized drive; it lands with that window, not before.
 *
 * ASCII-only source (-> not arrows). @license MIT
 */

import v8 from "node:v8";

/** Engine window byte budget: total <= 16384 B over ENGINE_OPS, ~0 B/op. */
export const ENGINE_BUDGET = 16384;
/** GC-free ops per engine window (the suite gate op count). */
export const ENGINE_OPS = 50000;
/** Warmup iterations before an engine window measures. */
export const ENGINE_WARMUP = 1000;
// DOM op counts are per-window constants in torture.mjs, sized so total stays
// under SHRINK_CEILING (measured floor ~2.9 KB/op).
/** Warmup iterations before a DOM window measures. */
export const DOM_WARMUP = 200;

/** New-space shrink ceiling: a total at or past this means the window overflowed. */
const SHRINK_CEILING = 4194304;

/** Fail the whole gate. stdout stays clean; the reason goes to stderr. */
export function die(msg) {
    process.stderr.write("torture: FAIL -- " + msg + "\n");
    process.exit(1);
}

/**
 * Assertion whose message is built ONLY on failure. Pass a thunk, not a string,
 * so the happy path allocates nothing.
 * @param {boolean} cond
 * @param {() => string} msgThunk
 */
export function check(cond, msgThunk) {
    if (!cond) die(msgThunk());
}

/** Current new-space used bytes, straight from V8. Fails closed if absent. */
export function newSpaceUsed() {
    const spaces = v8.getHeapSpaceStatistics();
    for (let i = 0; i < spaces.length; i++) {
        if (spaces[i].space_name === "new_space") return spaces[i].space_used_size;
    }
    die("newSpaceUsed: no new_space in getHeapSpaceStatistics()");
}

/**
 * Total transient garbage fn(i) allocates over `ops` iterations, measured as the
 * new-space used-bytes delta around a GC-free synchronous loop. See the header
 * note on why this is the transient witness. gc() first for a clean slate; no
 * GC between the two samples; a shrink means a scavenge ran mid-window (the
 * workload overflowed new space) and the measurement is void.
 * @param {(i:number)=>void} fn
 * @param {number} ops
 * @param {number} warmup
 */
export function allocTotal(fn, ops, warmup) {
    for (let i = 0; i < warmup; i++) fn(i);
    globalThis.gc();
    const s0 = newSpaceUsed();
    for (let i = 0; i < ops; i++) fn(i);
    const s1 = newSpaceUsed();
    const total = s1 - s0;
    if (total < 0) die("allocTotal: new_space shrank mid-window (" + total + " B) -- a scavenge ran; the workload overflowed new space, shrink ops");
    if (total >= SHRINK_CEILING) die("allocTotal: new_space grew " + total + " B (>= " + SHRINK_CEILING + " B) -- the window is at the scavenge ceiling, shrink ops");
    return total;
}

/**
 * MIN-OF-N measurement: run up to `attempts` back-to-back windows over the same
 * fn and return the smallest valid total. This is the noise-robust form every
 * Phase C window uses, and it is a DESIGN decision, not a convenience:
 *
 *   The new-space delta charges the window with everything the RUNTIME lands in
 *   new space during it, not just the workload. Inside the full gate (after the
 *   heavy Phase A/B workload) V8 intermittently lands optimizer/GC bookkeeping
 *   in an otherwise-clean window: E5s measured byte-stable in ISOLATION across
 *   eight process runs (4136/2872/3272 B) yet intermittently spiked +0.4-2.2 MB
 *   inside the full gate on identical code. A real per-op allocator reproduces
 *   its garbage in EVERY window by construction (the transient control and the
 *   pre-paydown pin-input at ~362 B/op fail all attempts, deterministically),
 *   while one-off background-runtime noise cannot survive an immediate retry.
 *   The min over attempts is therefore exactly the workload's own reproducible
 *   allocation -- the steady-state claim the gate exists to witness.
 *
 * Attempt 1 runs `warmup` first; later attempts are already warm (the previous
 * attempt's ops). `earlyBelow` short-circuits once an attempt proves the total
 * at or under the caller's threshold (budget or ratchet) -- no attempt is spent
 * proving what is already proven. A voided attempt (negative delta = a scavenge
 * ran; total at/past SHRINK_CEILING) is retried, and the call fails closed by
 * die()-ing only when EVERY attempt voided.
 * @param {(i:number)=>void} fn
 * @param {number} ops
 * @param {number} warmup
 * @param {number} attempts
 * @param {number} [earlyBelow]
 */
export function allocTotalMin(fn, ops, warmup, attempts, earlyBelow) {
    let min = Infinity;
    let lastVoid = 0;
    for (let a = 0; a < attempts; a++) {
        const w = a === 0 ? warmup : 0;
        for (let i = 0; i < w; i++) fn(i);
        globalThis.gc();
        const s0 = newSpaceUsed();
        for (let i = 0; i < ops; i++) fn(i);
        const s1 = newSpaceUsed();
        const total = s1 - s0;
        if (total < 0 || total >= SHRINK_CEILING) { lastVoid = total; continue; }
        if (total < min) min = total;
        if (earlyBelow !== undefined && min <= earlyBelow) return min;
    }
    if (min === Infinity) {
        if (lastVoid < 0) die("allocTotalMin: new_space shrank mid-window on every attempt (" + lastVoid + " B last) -- a scavenge ran; the workload overflowed new space, shrink ops");
        die("allocTotalMin: new_space grew " + lastVoid + " B (>= " + SHRINK_CEILING + " B) on every attempt -- the window is at the scavenge ceiling, shrink ops");
    }
    return min;
}
