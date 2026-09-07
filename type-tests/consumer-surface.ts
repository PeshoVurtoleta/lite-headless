// Consumer-surface type-test for @zakkster/lite-headless  (LH-03 guard).
//
// PURPOSE. This is the narrow declaration-parity guard the H9 session added.
// It imports the package the way an INSTALLED consumer does -- VALUE imports of
// the bare-package barrel re-exports and a sample of subpath helper exports --
// so a DANGLING barrel re-export (a name the "." barrel `declare module` block
// claims to re-export from a subpath but that does not actually resolve)
// surfaces as a "no exported member" error in THIS .ts consumer file.
//
// Why this catches the class WITHOUT flipping skipLibCheck: skipLibCheck:true
// only silences errors INSIDE .d.ts files. An unresolved value import in a .ts
// consumer is still reported. A global skipLibCheck:false is not an option here
// -- the package's tsconfig `paths` self-map every subpath back to types.d.ts,
// so a strict check of types.d.ts emits ~353 structural circular-augmentation
// errors (TS2666/TS2303). The full-surface signature parity lives in the
// block-scoped api-surface node:test gate (test/api-surface.test.js) and this
// file's sibling type-tests/api-surface.ts. See
// docs/decisions/0004-declaration-parity-via-node-test-gate.md.
//
// Run:    npx tsc --noEmit          (part of `npm run types`)
// Expect: no errors. To prove the guard bites, delete a name from a barrel
// re-export in types.d.ts and re-run -- tsc MUST fail in this file.

// --- The exact LH-03 class: helper names the bare-package "." entry re-exports
//     from their subpaths (types.d.ts:56 avatar, :80 pagination). ---
import {
    createAvatar,
    deriveInitials,   // barrel re-export <- ./avatar
    hueFromString,    // barrel re-export <- ./avatar
    createPagination,
    buildItems,       // barrel re-export <- ./pagination
} from "@zakkster/lite-headless";

// A real consumer also pulls factories straight from the barrel.
import { createToast, createDialog } from "@zakkster/lite-headless";

// NOTE on subpath-only helpers. Names that live ONLY on a subpath and are NOT
// re-exported by the bare barrel (color-picker math, datepicker helpers) cannot
// be import-probed here: the type-test tsconfig `paths` self-maps every subpath
// onto types.d.ts, so a subpath specifier resolves to the bare-package module
// and only bare-barrel names are visible (importing e.g. hsvToRgb from
// ".../color-picker" yields TS2305 against the bare module). Those subpath
// exports are guarded by the api-surface node:test gate (existence +
// declare-module) and by type-tests/api-surface.ts. This file's remit is the
// bare-barrel re-export class (LH-03).

// Exercise each barrel re-export as a VALUE (a type-only import would not prove
// the value export resolves). Return types are asserted where confirmed against
// types.d.ts; the rest are void-consumed so an unused-symbol rule cannot mask
// the probe.
const _initials: string = deriveInitials("Ada Lovelace");
const _hue: number = hueFromString("Ada");
const _items = buildItems(3, 20, 1, 1);

void createAvatar; void createPagination; void createToast; void createDialog;
void _initials; void _hue; void _items;
