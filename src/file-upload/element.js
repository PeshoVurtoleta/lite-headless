// @zakkster/lite-headless / file-upload / element.js
//
// <lite-file-upload> wrapping createFileUpload. Auto-attaches the
// descendant `[data-file-input]` as the file input and any element with
// `[data-drop-zone]` (or the host itself if no descendant matches).
// Renders a file list into `[data-file-list]` if present, with one row
// per entry; each row has data attributes you can style + a built-in
// remove button.
//
// The wrapper does NOT mount per-row progress bars (would force a layout
// choice on you). Listen to `change` events + read `entries` to render
// your own progress UI, OR keep the row markup minimal and mount
// lite-progress per entry in your code.
//
//   <lite-file-upload accept="image/*,.pdf" multiple>
//       <div data-drop-zone>
//           Drop files here, or
//           <button data-file-pick>browse</button>
//       </div>
//       <ul data-file-list></ul>
//       <input data-file-input type="file" hidden>
//   </lite-file-upload>
//
// The `[data-file-pick]` button (if present) clicks the input on click.
//
// Reactive attrs (read once on attach):
//   accept              passed to createFileUpload
//   multiple            present = multiple files (default true)
//   max-files           number; default Infinity
//   max-size            bytes; default Infinity
//   auto-upload         "false" disables; default true
//
// Imperative API on host: see createFileUpload.
//
// Events:
//   change          { entries: FileEntry[] }
//   filesadded      { entries: FileEntry[] }
//   progress        { entry: FileEntry }
//   complete        { entry: FileEntry }
//   uploaderror     { entry: FileEntry, error: Error }
//   invalid         { file: File, reason: string }
//   alldone         (no detail)

import { define } from "@zakkster/lite-element";
import { effect } from "@zakkster/lite-signal";
import { createFileUpload } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

// Hoisted row template. The browser's C++ HTML parser builds this ONCE
// at module load; subsequent `content.cloneNode(true)` calls clone the
// DOM tree without re-invoking the parser. We then walk the cloned
// element via `children[i]` -- five direct DOM accesses replacing five
// selector-engine traversals per row.
//
// Layout invariants the row paint relies on:
//   children[0] = name span
//   children[1] = status span
//   children[2] = progress host span
//   children[3] = retry button (initially `hidden`)
//   children[4] = remove button
const _rowTemplate = document.createElement("template");
_rowTemplate.innerHTML =
    '<li class="lite-file-row" data-file-row>' +
        '<span class="lite-file-name" data-file-name></span>' +
        '<span class="lite-file-status" data-file-status></span>' +
        '<span class="lite-file-progress-host" data-file-progress-host></span>' +
        '<button type="button" class="lite-file-retry" data-file-retry hidden aria-label="Retry">retry</button>' +
        '<button type="button" class="lite-file-remove" data-file-remove aria-label="Remove">\u00d7</button>' +
    '</li>';

// Scoped-query helper. `host.querySelector` walks the entire descendant
// tree, so a `<lite-file-upload>` nested inside another would steal its
// child's `[data-drop-zone]`. We filter the match through `belongsToHost`.
function scopedQuery(host, selector) {
    const el = host.querySelector(selector);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

define("lite-file-upload", (host, scope) => {
    const accept = host.getAttribute("accept") || "";
    // multiple defaults to true (matches the primitive). Set
    // multiple="false" explicitly to disable.
    const multiple = host.getAttribute("multiple") !== "false";
    const autoUpload = host.getAttribute("auto-upload") !== "false";
    const maxFiles = (() => {
        const a = host.getAttribute("max-files");
        if (!a) return Infinity;
        const n = Number(a);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : Infinity;
    })();
    const maxSize = (() => {
        const a = host.getAttribute("max-size");
        if (!a) return Infinity;
        const n = Number(a);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : Infinity;
    })();

    // Network driver. The host can supply one via the `onUpload` property
    // BEFORE the upgrade. We capture it here. If not provided, a simulated
    // driver runs that completes after 1.5s with linear progress (handy
    // for the demo, but apps should override).
    const userDriver = typeof host.onUpload === "function" ? host.onUpload : null;
    const onUpload = userDriver || (async (entry, { signal, onProgress }) => {
        // Default demo driver: ramp progress to 1 over ~1.5s. Honors
        // abort.
        const total = entry.bytesTotal || 1;
        const steps = 20;
        const stepBytes = total / steps;
        const stepMs = 75;
        for (let i = 1; i <= steps; i++) {
            await new Promise((res, rej) => {
                const t = setTimeout(res, stepMs);
                if (signal) {
                    if (signal.aborted) { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); return; }
                    signal.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); }, { once: true });
                }
            });
            onProgress(Math.min(total, Math.floor(stepBytes * i)));
        }
    });

    const fu = createFileUpload({
        accept, multiple, maxFiles, maxSize, autoUpload,
        onUpload,
        onFilesAdded: (entries) => {
            host.dispatchEvent(new CustomEvent("filesadded", { detail: { entries }, bubbles: true }));
            host.dispatchEvent(new CustomEvent("change", { detail: { entries: fu.entries() }, bubbles: true }));
        },
        onProgress: (entry) => {
            host.dispatchEvent(new CustomEvent("progress", { detail: { entry }, bubbles: true }));
        },
        onComplete: (entry) => {
            host.dispatchEvent(new CustomEvent("complete", { detail: { entry }, bubbles: true }));
            host.dispatchEvent(new CustomEvent("change", { detail: { entries: fu.entries() }, bubbles: true }));
        },
        onError: (entry, error) => {
            host.dispatchEvent(new CustomEvent("uploaderror", { detail: { entry, error }, bubbles: true }));
        },
        onInvalid: (file, reason) => {
            host.dispatchEvent(new CustomEvent("invalid", { detail: { file, reason }, bubbles: true }));
        },
        onAllDone: () => {
            host.dispatchEvent(new CustomEvent("alldone", { bubbles: true }));
        },
    });

    // Attach drop zone: prefer a [data-drop-zone] descendant, else the host
    // itself. `scopedQuery` rejects matches living inside a nested
    // `<lite-file-upload>`.
    let _attachedDropZone = null;
    let _attachedDropOff = null;
    function syncDropZone() {
        const next = scopedQuery(host, "[data-drop-zone]") || host;
        if (next === _attachedDropZone) return;
        if (_attachedDropOff) _attachedDropOff();
        _attachedDropZone = next;
        _attachedDropOff = fu.attachDropZone(next);
    }
    syncDropZone();

    // Attach file input
    let _attachedInput = null;
    let _attachedInputOff = null;
    function syncInput() {
        const next = scopedQuery(host, "[data-file-input]");
        if (next === _attachedInput) return;
        if (_attachedInputOff) _attachedInputOff();
        _attachedInput = next;
        if (next) _attachedInputOff = fu.attachInput(next);
        else      _attachedInputOff = null;
    }
    syncInput();

    // Wire data-file-pick click -> input click
    let _attachedPicker = null;
    let _attachedPickerOff = null;
    function syncPicker() {
        const next = scopedQuery(host, "[data-file-pick]");
        if (next === _attachedPicker) return;
        if (_attachedPickerOff) _attachedPickerOff();
        _attachedPicker = next;
        if (next) {
            const handler = (ev) => {
                ev.preventDefault();
                if (_attachedInput) _attachedInput.click();
            };
            next.addEventListener("click", handler);
            _attachedPickerOff = () => next.removeEventListener("click", handler);
        } else {
            _attachedPickerOff = null;
        }
    }
    syncPicker();

    // Render the file list reactively. One row per entry with built-in
    // remove button. Status + name shown; progress bar mounted only if
    // the consumer puts [data-file-progress-host] on the row (which the
    // wrapper does -- so consumers can target it). The wrapper does NOT
    // mount a lite-progress -- that's the consumer's choice, both for
    // import-weight and styling reasons.
    let _listEl = null;
    function syncListEl() {
        const next = scopedQuery(host, "[data-file-list]");
        if (next !== _listEl) _listEl = next;
    }
    syncListEl();

    // Per-row record. The status/retry-hidden caches let the paint effect
    // skip DOM writes when the values match the last frame -- which is
    // the common case once an upload settles into a steady state.
    //   { el, entryId, nameEl, statusEl, removeBtn, retryBtn,
    //     progressHost, _status, _retryHidden, _name }
    const _rows = [];
    const stopRowPaint = effect(() => {
        const list = fu.entries();
        if (!_listEl) return;
        // Shrink
        while (_rows.length > list.length) {
            const r = _rows.pop();
            r.el.remove();
        }
        // Grow. Each new row is cloned from the hoisted template -- no
        // HTML parse, no querySelector walks. The five role elements
        // live at known child indices (see _rowTemplate doc above).
        while (_rows.length < list.length) {
            const frag = _rowTemplate.content.cloneNode(true);
            const el = frag.firstElementChild;
            const children = el.children;
            const rec = {
                el,
                entryId: null,
                nameEl: children[0],
                statusEl: children[1],
                progressHost: children[2],
                retryBtn: children[3],
                removeBtn: children[4],
                _name: "",
                _status: "",
                _retryHidden: true,    // matches template's initial `hidden` attr
            };
            rec.removeBtn.addEventListener("click", () => {
                if (rec.entryId) fu.removeEntry(rec.entryId);
            });
            rec.retryBtn.addEventListener("click", () => {
                if (rec.entryId) fu.retry(rec.entryId);
            });
            _rows.push(rec);
            _listEl.appendChild(el);
        }
        // Diff-update each row. Writes ONLY happen when the cached
        // last-painted value disagrees with the entry's current value;
        // a 100-row list with one in-flight upload becomes one row's
        // status write per progress tick rather than 100.
        for (let i = 0; i < list.length; i++) {
            const entry = list[i];
            const r = _rows[i];
            if (r.entryId !== entry.id) {
                r.entryId = entry.id;
                r.el.setAttribute("data-entry-id", entry.id);
                const name = entry.file.name;
                if (r._name !== name) {
                    r.nameEl.textContent = name;
                    r._name = name;
                }
            }
            const status = entry.status;
            if (r._status !== status) {
                r.el.setAttribute("data-status", status);
                r.statusEl.textContent = status;
                r._status = status;
            }
            const wantHidden = !(status === "error" || status === "aborted");
            if (r._retryHidden !== wantHidden) {
                r.retryBtn.hidden = wantHidden;
                r._retryHidden = wantHidden;
            }
        }
    });

    const mo = new MutationObserver(() => {
        syncDropZone();
        syncInput();
        syncPicker();
        syncListEl();
    });
    mo.observe(host, { childList: true, subtree: true });

    // Imperative surface
    host._fileUploadInstance = fu;
    host.addFiles    = (fl) => fu.addFiles(fl);
    host.removeEntry = (id) => fu.removeEntry(id);
    host.retry       = (id) => fu.retry(id);
    host.clear       = () => fu.clear();
    host.abort       = (id) => fu.abort(id);
    host.uploadAll   = () => fu.uploadAll();
    Object.defineProperty(host, "entries",       { get: () => fu.entries(),       configurable: true });
    Object.defineProperty(host, "isDragOver",    { get: () => fu.isDragOver(),    configurable: true });
    Object.defineProperty(host, "totalProgress", { get: () => fu.totalProgress(), configurable: true });
    Object.defineProperty(host, "pendingCount",  { get: () => fu.pendingCount(),  configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        stopRowPaint();
        if (_attachedDropOff)   _attachedDropOff();
        if (_attachedInputOff)  _attachedInputOff();
        if (_attachedPickerOff) _attachedPickerOff();
        for (const r of _rows) r.el.remove();
        _rows.length = 0;
        fu.destroy();
    });
});
