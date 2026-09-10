# ADR 0010: adapter measurement forward

- Status: Accepted
- Date: 2026-09-08
- Scope: `src/floating-adapter.js` (createFloatingPositioner),
  `src/hover-card/index.js` (createHoverCard), the two llms API surfaces,
  `test/floating-adapter.test.js`, `test/hover-card.test.js`
- Session: v1.11.0 "adapter measurement forward" (non-breaking minor)

## Context

@zakkster/lite-floating 1.2.0 shipped the exact measurement-injection surface
ADR 0001's revisit trigger named: an injectable `getRect` (element rect) and
`getViewport` (viewport rect) resolved ONCE at `createFloating` construction,
so a caller can feed synthetic geometry and assert exact-pixel overflow
behavior with no real browser. The built-in engine (`src/_overlay/position.js`)
has carried the same two seams since day one -- that is what lets the happy-dom
suite pin coordinates to the pixel.

Before 1.2.0 the two lite-floating-backed paths -- the opt-in `floating-adapter`
and the native `hover-card` -- had NO way to accept a synthetic viewport, so
flip/shift on those paths could not be exact-pixel tested; only the built-in
engine could. This ADR records the rulings made when threading the 1.2.0 seam
through both paths. It satisfies HALF of ADR 0001's revisit trigger (the
measurement surface now exists); the OTHER half (the 2.0.0 default swap) remains
a separate, evidence-gated decision -- see R5.

## Decision R1 -- one measurement vocabulary

The forwarded options are named `getRect` and `getViewport`, byte-for-byte the
names the built-in engine uses (`src/_overlay/position.js:59-60`) and the names
lite-floating 1.2.0 uses (`node_modules/@zakkster/lite-floating/src/Core.js`).
Shared vocabulary is the entire point: an integrator who has written a `getRect`
for the built-in positioner can hand the SAME provider to the adapter or to
hover-card with no translation, and a test rig injects one viewport shape into
either engine. No new name, no per-engine dialect.

## Decision R2 -- forward reaches the options literal only; resolved once

Both providers are read ONCE at construction (adapter: beside `strategy` /
`autoUpdate`; hover-card: in the options destructure) and forwarded straight
into the existing `createFloating(...)` options literal. lite-floating itself
resolves `getRect` / `getViewport` once at construction into the closed-over
`readRect` / `readViewport`, so the hot compute path carries NO per-tick branch
and NO per-tick re-read. There is no new code on any update tick -- the forward
is two object keys on a literal that was already being built once per open.

## Decision R3 -- zero-cost default

Absent providers resolve to `undefined`, which is exactly what
`createFloating` receives when a caller omits them: it falls back to
`getBoundingClientRect` + the window viewport by identity, with zero added
allocation. The default (no-injection) path is byte-identical to the pre-1.11.0
path -- the same signals, the same compute, the same paint. Injection is opt-in
and pay-for-what-you-use; it costs a test rig two closures and costs the
default path nothing.

## Decision R4 -- peer floor `^1.2.0`, still optional

The dep range moves to `^1.2.0` (lite-floating stays an OPTIONAL peer).
Advertising the `getRect` / `getViewport` seam on a lite-floating version that
silently ignores it would fail OPEN -- an integrator would inject a viewport,
see it ignored, and get real-window numbers with no error. Suite law forbids
failing open on an unverified capability, so the seam is advertised only from
the floor that honors it. Default positioning still works on older
lite-floating; the injection seam simply is not offered there.

## Decision R5 -- the 2.0.0 default swap stays separate

Making lite-floating the DEFAULT engine and retiring the built-in overflow math
is a breaking change that ADR 0001 parked for 2.0.0. This release does NOT make
it. 1.11.0 only makes the opt-in adapter and the (already lite-floating-backed)
hover-card exact-pixel testable; it migrates no default and removes no code. The
default-swap decision remains separate and evidence-gated -- it will be re-opened
on its own, against its own assertions, not smuggled in behind a measurement
forward.

## Consequences

- ADR 0001's revisit trigger is now HALF satisfied: the measurement-injection
  surface exists and the exact-pixel happy-dom contracts pass on the adapter and
  hover-card paths (see the new A1-A3/A6 cases in
  `test/floating-adapter.test.js` and the flip case in
  `test/hover-card.test.js`). The 2.0.0 clause of that trigger is untouched.
- No default behavior changes and no hot-path allocation changes: the torture
  GATE is unchanged (`leak 0/0`, `alloc 0 B/op`, `gc major=0`, transient
  `gated=9/9`). The default path allocates exactly what it did in 1.10.0.
- `createHoverCard` now admits `getRect` / `getViewport` in its OPTION_KEYS; an
  unknown key still throws with a did-you-mean hint (fail closed, unchanged).
- If a future change finds itself adding a per-tick branch to honor these
  providers, that is the signal the forward has drifted from R2 -- STOP and
  re-open this ruling.
