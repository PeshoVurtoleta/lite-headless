# ADR 0002: Cross-module option-key seams are private, not public API

- Status: Accepted
- Date: 2026-08-31
- Scope: dialog, alert-dialog (the shared `DIALOG_OPTION_KEYS` option-key seam),
  and any future `X_OPTION_KEYS` list needed by more than one primitive

## Context

`createAlertDialog` is `createDialog` with a stricter dismiss policy, so both
factories validate construction options against the identical surface. That
surface was expressed as a single pipe-delimited string, `DIALOG_OPTION_KEYS`,
that alert-dialog imported from the dialog module to feed the shared
`checkOptions` validator.

Because `./dialog` is a real exports subpath, `export const DIALOG_OPTION_KEYS`
made that string a live export of the `./dialog` module namespace. The
api-surface gate enumerates every live export and requires each one to be either
declared in its subpath's own `declare module` block in types.d.ts or pinned in
the `undocumented` allowlist. `DIALOG_OPTION_KEYS` sat in that allowlist as the
31st of its 32 entries (`./pagination#buildItems` was the 32nd and last) -- a
live export with no declaration, carried only to keep the gate green. The
question for H6b: ratify it (declare it) or demote it.

## Options

### A. DECLARE -- add `DIALOG_OPTION_KEYS` to the ./dialog declare-module block

Rejected. The value is a pipe-delimited string, an encoding private to
`checkOptions`. Declaring it would freeze that encoding as a public contract for
zero consumer value: no README, no `llms.txt`, and no types.d.ts block ever
mentioned it, and it never reached bare-package importers because the root
barrel (`src/index.js`) uses explicit named re-exports and never forwarded it.
Nothing documented depends on it; declaring it would only manufacture a public
promise about an internal format. Cycle 5 had already reverted a speculative
declaration of exactly this symbol precisely to avoid ratifying it in a patch --
a minor is the right place to rule on it, and the ruling is: do not ratify.

### B. RELOCATE -- move the shared list into the private validator module

Chosen. `DIALOG_OPTION_KEYS` moves into `src/_validate.js`, exported alongside
`checkOptions`. Both dialog and alert-dialog import it from there. `src/_validate.js`
is not reachable through any `package.json` exports subpath, so the surface
enumerator can never see it: after the move, `./dialog`'s live exports are
exactly `["createDialog"]` and the `undocumented` allowlist is empty. Relocation
beats the alternative of an underscore rename (`_DIALOG_OPTION_KEYS`), which
would still be a live export of `./dialog` needing either its own declaration or
its own allowlist pin -- trading one gate debt for another. The rule
generalizes: a cross-primitive seam belongs in a private `src/_*` module the
exports map cannot reach, so it is structurally impossible for the enumerator to
count it as surface.

### C. STATUS QUO -- keep the allowlist pin

Rejected. It leaves a live, undeclared, undocumented export on `./dialog` and a
standing allowlist budget whose only member is an internal encoding. The pin
existed to defer this decision; deferring it again wins nothing and keeps the
surface gate certifying a symbol that no consumer should build against.

## Consequences

- `./dialog` exposes exactly `createDialog`; the `undocumented` allowlist is
  empty (pin 32 -> 0). Every remaining live export is declared in its subpath's
  own declare-module block.
- No documented surface is removed: `DIALOG_OPTION_KEYS` appeared in no README,
  `llms.txt`, or types.d.ts, and was never in the root barrel, so no bare-package
  or documented consumer could have imported it.
- alert-dialog's validation is unchanged byte-for-byte: the same pipe-delimited
  string reaches the same `checkOptions`, so the unknown-option error text is
  identical to before the move.
- Going forward, any `X_OPTION_KEYS` list needed by more than one primitive lives
  in `src/_validate.js` (or another `src/_*` module) and is never reachable
  through an exports subpath, so it never becomes surface the gate must account
  for.

## Revisit trigger

Reconsider only if a documented, supported use case emerges for a consumer to
read a factory's option-key set at runtime. At that point the right shape is a
purpose-built, declared accessor with a stable return type -- not a re-exported
pipe-delimited string whose format is an internal detail of `checkOptions`.
