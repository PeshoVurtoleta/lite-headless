# Recipe: server refresh mid-edit -- lite-form reinitialize + form-field, without losing the draft

Cross-package: [`@zakkster/lite-form`](https://www.npmjs.com/package/@zakkster/lite-form)
(state + the merge engine) + `@zakkster/lite-headless/form-field` (ARIA + paint).

A poll tick, a websocket push, or a "someone else edited this record" refresh
arrives WHILE the user is typing. lite-form's `reinitialize(next, policy)` merges
the server snapshot into a live form in ONE batch: pristine fields adopt the new
value silently, and a field the user is editing keeps its draft while the server
value re-seeds underneath. This recipe wires that merge to form-field and paints
the AFTERMATH -- a conflict list with per-row keep-mine / take-server actions --
off `toPatch()`, with no side bookkeeping.

Verified against PUBLISHED lite-form `^1.3.0` (installs 1.4.0). The seam and every
assertion below are exercised in `test/lite-form-server-data.test.js` and ruled in
`docs/decisions/0009-server-data-recipes-and-the-zero-source-ruling.md`.

For the WRITE path (posting the minimal diff back, the 409 lane, the busy submit
button) see the companion `docs/recipes/lite-form-patch-submit.md`.

## Install

    npm i @zakkster/lite-form @zakkster/lite-signal @zakkster/lite-project @zakkster/lite-headless

`@zakkster/lite-project` is a static peer of lite-form (its projection engine) --
install it even if you never pass `source`.

## The safety is by construction -- the recipe owns the aftermath

A focused input's draft is a dirty overlay. `reinitialize(next, policy)` in the
default (non-source) mode NEVER overwrites a dirty conflict: the draft stays
visible, the baseline re-seeds underneath it, and the whole merge lands in one
batch with exactly one baseline bump -- so a bound input NEVER flickers through the
server value. That safety is lite-form's; you do NOT debounce the merge, guard on
"is this field focused", or snapshot-and-restore. Your job is the aftermath: paint
which fields now conflict and offer two honest actions.

## The merge table

`reinitialize(next, policy)` classifies each field. `n` is the incoming server
value, `d` is the current draft:

| field state          | condition                              | outcome                                                        |
| -------------------- | -------------------------------------- | ------------------------------------------------------------- |
| pristine             | (any)                                  | ADOPT `n` silently; touched clears                            |
| dirty, values agree  | `Object.is(n, d)` OR `policy(n, d) === true` | ECHO: overlay cleared, field pristine at `n`; touched clears |
| dirty, values differ | neither of the above                   | CONFLICT: draft kept masking `n`; baseline re-seeds to `n` (so `reset()` lands `n`, and `toPatch().from === n`); touched SURVIVES |

`Object.is(n, d)` force-echoes BEFORE the policy runs, so an equal pair can never
stay overlaid. Only a policy return of exactly `=== true` confirms an echo.

> [!WARNING]
> **Always pass a policy.** One-arg `reinitialize(next)` is DESTRUCTIVE: it
> re-seeds like `initialValues`, dropping EVERY edit, clearing touched and submit
> state, and re-seeding absent paths to `undefined`. That is a full form reset to
> the server snapshot -- never what a poll tick wants. A poll tick MUST pass a
> policy. The strictest, safest merge is `reinitialize(next, () => false)`: adopt
> every pristine field, keep every draft as a conflict, echo nothing.

## The wiring

    import { createForm }      from "@zakkster/lite-form";
    import { createFormField } from "@zakkster/lite-headless/form-field";
    import { effect }          from "@zakkster/lite-signal";

    const form = createForm({
        initialValues: { title: "", body: "", priority: "low" },
        validators: {
            title: (v) => (v ? null : "Title is required"),
        },
        validateOn: "change",
    });

    // One form-field per leaf; defer the reveal gate to lite-form (single gate).
    function bindField(path, rootEl, labelEl, inputEl, errorEl) {
        const field = form.field(path);
        const ff = createFormField({ showErrorsBeforeTouched: true });
        ff.attachRoot(rootEl);
        ff.attachLabel(labelEl);
        ff.attachControl(inputEl);
        ff.attachErrorText(errorEl);

        effect(() => { const e = field.error(); ff.setValid(e == null, e); });
        effect(() => { ff.setTouched(field.touched()); });
        effect(() => { ff.setPending(field.isValidating()); });

        effect(() => { inputEl.value = field.value(); });   // value binding
        inputEl.addEventListener("input", (ev) => field.set(ev.target.value));
        inputEl.addEventListener("blur",  () => field.blur());
        return { field, ff };
    }

    // A poll tick / socket push: a synchronous merge, no transport in the form.
    function onServerSnapshot(next) {
        form.reinitialize(next, () => false);   // strict merge: keep drafts
        paintConflicts();
    }

## The conflict list -- straight off toPatch()

After the merge, `toPatch()` returns `[{path, from, to}]` for exactly the dirty
paths. In this POST-MERGE window `from` is the SERVER value (the baseline re-seeded
underneath the conflict) and `to` is the user's draft. A conflict row renders
directly off the patch entry -- no separate "what did the server send" map:

    function paintConflicts() {
        const patch = form.toPatch();        // untracked, read-only, effect-safe
        conflictListEl.replaceChildren();
        for (const entry of patch) {
            const row  = document.createElement("li");
            const mine = document.createElement("span");
            mine.textContent = "you: " + String(entry.to);      // the draft
            const srv  = document.createElement("span");
            srv.textContent  = "server: " + String(entry.from); // the server value

            const keep = document.createElement("button");
            keep.textContent = "keep mine";
            keep.addEventListener("click", () => {
                // no-op: the draft already masks the server value. The row simply
                // stays until the user resolves it another way or submits.
            });

            const take = document.createElement("button");
            take.textContent = "take server";
            take.addEventListener("click", () => {
                form.field(entry.path).reset();   // lands entry.from; clears touched
                paintConflicts();                 // repaint: this row drops out
            });

            row.append(mine, srv, keep, take);
            conflictListEl.append(row);
        }
    }

- **take-server** is `field.reset()`. It lands `entry.from` in the value (and the
  bound `effect` repaints the input), and because `reset()` also clears touched,
  the form-field root's `data-touched` drops. Document that; do not defend it.
- **keep-mine** is a no-op. The draft already masks the server value; the patch
  entry stays (`dirty()` is still `true`) so the field posts on the next submit.

> [!NOTE]
> **A conflict is not a validity state.** Do NOT invent a `setConflict` hook on
> form-field. If you want a per-field conflict style, set your OWN `data-conflict`
> attribute on the form-field root: `attachRoot`'s effect only toggles its own
> five attributes (`data-invalid`, `data-required`, `data-touched`,
> `data-shows-error`, `data-validating`), so a consumer-owned `data-conflict` is
> never clobbered.

## Object-valued fields need a structural policy

Object leaves are deep-copied on BOTH sides of the merge, so `Object.is(n, d)`
always fails for them -- under the default policy every refresh reports a PHANTOM
conflict on an object field even when the content is identical. Pass a structural
policy that compares by content for those paths:

    form.reinitialize(next, (n, d) => {
        // echo (accept the server value) when the content is equal
        if (n && d && typeof n === "object" && typeof d === "object") {
            return JSON.stringify(n) === JSON.stringify(d);
        }
        return false;   // primitives: strict, keep the draft as a conflict
    });

## The policy is PURE -- no mutations, no side effects

The policy is `(n, d) => boolean` and NOTHING else. Any mutating form call from
inside it -- `form.field(p).set(v)`, `setValues`, a `reinitialize` re-entry -- throws
a `TypeError` (the re-entrancy latch: verdicts are pre-scanned against a snapshot,
so applying them over mutated state would be silent corruption). Do not log into a
signal, do not `field.set`, do not stash the verdict anywhere. And because the
whole merge is atomic, a THROWING policy mutates nothing at all: the form is
byte-identical to before the call. That is lite-form's guarantee -- lean on it.

## Source-mode forms refresh differently

If you built the form with `createForm({ source })` (ENGINE mode -- projecting a
live keyed source), a server refresh comes through the source, and you fold
agreeing overlays with `reconcile(policy)`, not `reinitialize`. Two-arg
`reinitialize` throws in source mode by design (and it also throws on a form with
DECLARED `arrays` -- keyed row merge is a recorded future design). Both cases are
one paragraph, not a lane: this recipe covers flat / dotted default-mode forms,
which is the overwhelming majority. Declared field arrays are out of scope here.

## See also

- `docs/recipes/lite-form-patch-submit.md` -- the write path: post the minimal
  diff, the 409 lane, the busy submit button.
- `docs/recipes/lite-form-field.md` -- the one-reveal-gate wiring these bindings
  reuse.
- `docs/decisions/0009-server-data-recipes-and-the-zero-source-ruling.md` -- the
  rulings and the conflict-row mapping law.
- lite-form's `llms.txt` -- the merge table (`reinitialize`), `toPatch()`, and
  `reconcile`.
