// @zakkster/lite-headless / file-upload
//
// File upload coordinator. Manages a list of FileEntry records (one per
// File selected/dropped), tracks per-file upload status, exposes
// progress signals per file + aggregate, and wires drag-drop + file-input
// + per-file abort. Composes cleanly with @zakkster/lite-headless/progress
// (consumer mounts one progress per FileEntry, bound to entry.progress).
//
// What this owns
//
//   - `files` reactive array of FileEntry { id, file, status, progress,
//     error, bytesLoaded, bytesTotal }
//   - validation pipeline: per-file size + type checks before queue
//   - drag-drop state (`isDragOver` signal) for styling the drop zone
//   - per-file lifecycle (queued -> uploading -> done/error/aborted) via
//     a consumer-supplied `onUpload` driver
//   - abort handling via AbortController per entry
//
// What this does NOT own
//
//   - Actual XHR / fetch -- the consumer's `onUpload(entry, { signal,
//     onProgress })` runs the network request. Defaults to a no-op
//     "stays queued" if not provided, so apps that want to drag-drop
//     for client-side preview only also work.
//
//   - Server-side anything. This is pure client coordinator.
//
//   - Rendering the file list. Consumer iterates `entries()`.
//
// API
//
//   createFileUpload({
//       accept?:        string,           // mime / extension hint for
//                                         // the file input + drop filter
//                                         // (e.g. "image/*,.pdf")
//       multiple?:      boolean,          // default true
//       maxFiles?:      number,           // default Infinity
//       maxSize?:       number,           // bytes, default Infinity
//       validate?:      (file) => boolean | string,
//                                         // optional custom validator
//                                         // returns false / non-empty
//                                         // string to reject
//       autoUpload?:    boolean,          // default true: enqueued files
//                                         // start uploading immediately
//       onUpload?:      (entry, ctx) => Promise<void>,
//                                         // network driver
//       onFilesAdded?:  (entries) => void,
//       onProgress?:    (entry) => void,
//       onComplete?:    (entry) => void,
//       onError?:       (entry, err) => void,
//       onInvalid?:     (file, reason) => void,
//       onAllDone?:     () => void,       // fired when all queued/uploading
//                                         // transition to done/error
//   })
//
//   .entries()                            // readonly FileEntry[]
//   .isDragOver()                         // boolean
//   .totalProgress()                      // 0..1 aggregate of bytesLoaded
//                                         // over bytesTotal across all
//                                         // non-aborted entries
//   .pendingCount()                       // entries.filter(queued|uploading).length
//
//   .addFiles(fileList)                   // runs validate pipeline
//   .removeEntry(id)
//   .retry(id)                            // re-queue an errored entry
//   .clear()                              // remove all
//   .abort(id)                            // signal the entry's controller
//   .uploadAll()                          // imperative: start queued (if
//                                         // autoUpload=false you'd call this)
//
//   .attachDropZone(el)                   // wires dragenter/over/leave/drop
//                                         // + sets data-drag-over attr
//   .attachInput(inputEl)                 // wires change -> addFiles
//
//   .destroy()
//
// FileEntry shape (read-only fields)
//
//   {
//       id:           string,        // crypto.randomUUID() when available
//       file:         File,
//       status:       "queued" | "uploading" | "done" | "error" | "aborted",
//       progress:    Signal<number 0..1>,
//       bytesLoaded: Signal<number>,
//       bytesTotal:  number,         // file.size
//       error:       Error | null,
//       _ctrl:       AbortController,
//   }
//
//   The .progress signal is a real lite-signal you can pass to mountProgress
//   (or read in your own effect).

import { signal as makeSignal, effect, computed } from "@zakkster/lite-signal";

const noop = () => {};

function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

function _genId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        try { return crypto.randomUUID(); } catch (_) {}
    }
    return "fe-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

// Lightweight accept matcher. Accepts:
//   "image/*"           -> file.type starts with "image/"
//   ".pdf"              -> file.name endsWith ".pdf" (case-insensitive)
//   "application/json"  -> file.type === "application/json"
function _matchesAccept(file, acceptList) {
    if (!acceptList || acceptList.length === 0) return true;
    const name = (file.name || "").toLowerCase();
    const type = (file.type || "").toLowerCase();
    for (const a of acceptList) {
        if (!a) continue;
        if (a.startsWith(".")) {
            if (name.endsWith(a)) return true;
        } else if (a.endsWith("/*")) {
            const prefix = a.slice(0, -1);   // includes "/"
            if (type.startsWith(prefix)) return true;
        } else {
            if (type === a) return true;
        }
    }
    return false;
}

export function createFileUpload(options = {}) {
    const {
        accept = "",
        multiple = true,
        maxFiles = Infinity,
        maxSize = Infinity,
        validate = null,
        autoUpload = true,
        onUpload = null,
        onFilesAdded,
        onProgress,
        onComplete,
        onError,
        onInvalid,
        onAllDone,
    } = options;

    const acceptList = accept
        ? accept.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
        : [];

    const _entries = makeSignal([]);
    const _isDragOver = makeSignal(false);
    let _destroyed = false;
    let _dropZoneEl = null;
    let _inputEl = null;
    let _dropOff = null;
    let _inputOff = null;
    let _lastAllDoneNotified = true;   // start true; flips false on first add

    // Aggregate totalProgress as a computed over per-entry bytesLoaded.
    // We use a memoized computed so subscribers (effects in the consumer)
    // only re-run when the aggregate changes.
    const _totalProgress = computed(() => {
        const list = _entries();
        let loaded = 0, total = 0;
        for (const e of list) {
            if (e.status === "aborted") continue;
            loaded += e.bytesLoaded();
            total  += e.bytesTotal;
        }
        if (total === 0) return 0;
        return loaded / total;
    });

    const _pendingCount = computed(() => {
        const list = _entries();
        let n = 0;
        for (const e of list) {
            if (e.status === "queued" || e.status === "uploading") n++;
        }
        return n;
    });

    // ----- validation ------------------------------------------------

    function _validateFile(file, alreadyQueued) {
        if (alreadyQueued >= maxFiles) return { ok: false, reason: "max-files" };
        if (file.size > maxSize)        return { ok: false, reason: "max-size" };
        if (!_matchesAccept(file, acceptList)) {
            return { ok: false, reason: "accept" };
        }
        if (validate) {
            let result;
            try { result = validate(file); } catch (err) {
                try { console.error("lite-file-upload: validate threw:", err); } catch (_) {}
                return { ok: false, reason: "validate" };
            }
            if (result === false || (typeof result === "string" && result.length > 0)) {
                return { ok: false, reason: typeof result === "string" ? result : "validate" };
            }
        }
        return { ok: true };
    }

    function _makeEntry(file) {
        const bytesLoaded = makeSignal(0);
        const progress = computed(() => {
            const t = file.size;
            if (t === 0) return 0;
            return Math.min(1, bytesLoaded() / t);
        });
        return {
            id: _genId(),
            file,
            status: "queued",
            progress,
            bytesLoaded,
            bytesTotal: file.size,
            error: null,
            _ctrl: typeof AbortController !== "undefined" ? new AbortController() : null,
        };
    }

    function _replaceEntry(id, mutator) {
        const list = _entries.peek();
        const idx = list.findIndex(e => e.id === id);
        if (idx < 0) return null;
        const next = list.slice();
        // The entry object itself is mutable (status changes), but we
        // produce a new array reference so effects watching entries()
        // re-run on the structural change.
        const e = list[idx];
        if (mutator) mutator(e);
        next[idx] = e;
        _entries.set(next);
        return e;
    }

    function _notifyAllDoneIfApplicable() {
        if (_lastAllDoneNotified) return;
        if (_pendingCount.peek() === 0 && _entries.peek().length > 0) {
            _lastAllDoneNotified = true;
            if (onAllDone) {
                try { onAllDone(); } catch (err) {
                    try { console.error("lite-file-upload: onAllDone threw:", err); } catch (_) {}
                }
            }
        }
    }

    // ----- upload driver ---------------------------------------------

    async function _startUpload(entry) {
        if (_destroyed) return;
        if (entry.status !== "queued") return;
        if (!onUpload) {
            // No driver provided -- entries just sit in "queued". Useful
            // for client-side-only previews (e.g. drag images for an
            // editor, never network them).
            return;
        }
        _replaceEntry(entry.id, (e) => { e.status = "uploading"; e.error = null; });
        const onProg = (loadedBytes) => {
            if (_destroyed) return;
            if (entry.status === "aborted") return;
            const safe = Math.max(0, Math.min(entry.bytesTotal, loadedBytes | 0));
            entry.bytesLoaded.set(safe);
            // Touching entries() so a totalProgress computed dependent on
            // structural reads stays correct -- but bytesLoaded.set already
            // signals through the per-entry signal, and totalProgress
            // recomputes via its dependency on each entry's bytesLoaded.
            // No need to bump the array signal here.
            if (onProgress) {
                try { onProgress(entry); } catch (err) {
                    try { console.error("lite-file-upload: onProgress threw:", err); } catch (_) {}
                }
            }
        };
        const ctx = {
            signal: entry._ctrl ? entry._ctrl.signal : undefined,
            onProgress: onProg,
        };
        try {
            await onUpload(entry, ctx);
            if (_destroyed) return;
            // Settle: bytesLoaded -> bytesTotal so progress reads 1.
            entry.bytesLoaded.set(entry.bytesTotal);
            _replaceEntry(entry.id, (e) => { e.status = "done"; e.error = null; });
            if (onComplete) {
                try { onComplete(entry); } catch (err) {
                    try { console.error("lite-file-upload: onComplete threw:", err); } catch (_) {}
                }
            }
        } catch (err) {
            if (_destroyed) return;
            // Distinguish abort vs network error.
            const isAbort = err && (err.name === "AbortError" || err.code === 20);
            _replaceEntry(entry.id, (e) => {
                e.status = isAbort ? "aborted" : "error";
                e.error = isAbort ? null : err;
            });
            if (!isAbort && onError) {
                try { onError(entry, err); } catch (err2) {
                    try { console.error("lite-file-upload: onError threw:", err2); } catch (_) {}
                }
            }
        }
        _notifyAllDoneIfApplicable();
    }

    // ----- public reactive -------------------------------------------

    function entries()       { return _entries(); }
    function isDragOver()    { return _isDragOver(); }
    function totalProgress() { return _totalProgress(); }
    function pendingCount()  { return _pendingCount(); }

    // ----- public methods --------------------------------------------

    function addFiles(fileList) {
        if (_destroyed) return [];
        const list = Array.isArray(fileList)
            ? fileList
            : (fileList && typeof fileList.length === "number" && typeof fileList[0] !== "undefined" || fileList?.length === 0)
                ? Array.from(fileList)
                : [fileList];

        const cur = _entries.peek();
        const accepted = [];
        let queuedCount = cur.length;
        for (const f of list) {
            if (!multiple && (cur.length > 0 || accepted.length > 0)) {
                if (onInvalid) {
                    try { onInvalid(f, "multiple-disabled"); } catch (_) {}
                }
                continue;
            }
            const r = _validateFile(f, queuedCount);
            if (!r.ok) {
                if (onInvalid) {
                    try { onInvalid(f, r.reason); } catch (_) {}
                }
                continue;
            }
            const entry = _makeEntry(f);
            accepted.push(entry);
            queuedCount++;
        }
        if (accepted.length === 0) return [];
        const next = multiple ? cur.concat(accepted) : accepted;
        _entries.set(next);
        _lastAllDoneNotified = false;
        if (onFilesAdded) {
            try { onFilesAdded(accepted); } catch (err) {
                try { console.error("lite-file-upload: onFilesAdded threw:", err); } catch (_) {}
            }
        }
        if (autoUpload) {
            for (const e of accepted) _startUpload(e);
        }
        return accepted;
    }

    function removeEntry(id) {
        const list = _entries.peek();
        const idx = list.findIndex(e => e.id === id);
        if (idx < 0) return false;
        const entry = list[idx];
        // If uploading, abort first.
        if (entry.status === "uploading" && entry._ctrl) {
            try { entry._ctrl.abort(); } catch (_) {}
        }
        const next = list.slice(0, idx).concat(list.slice(idx + 1));
        _entries.set(next);
        _notifyAllDoneIfApplicable();
        return true;
    }

    function retry(id) {
        const list = _entries.peek();
        const entry = list.find(e => e.id === id);
        if (!entry) return false;
        if (entry.status !== "error" && entry.status !== "aborted") return false;
        // Fresh controller (the old one is now aborted/used).
        if (typeof AbortController !== "undefined") {
            entry._ctrl = new AbortController();
        }
        entry.bytesLoaded.set(0);
        _replaceEntry(id, (e) => { e.status = "queued"; e.error = null; });
        _lastAllDoneNotified = false;
        if (autoUpload) _startUpload(entry);
        return true;
    }

    function clear() {
        const list = _entries.peek();
        for (const e of list) {
            if (e.status === "uploading" && e._ctrl) {
                try { e._ctrl.abort(); } catch (_) {}
            }
        }
        _entries.set([]);
    }

    function abort(id) {
        const list = _entries.peek();
        const entry = list.find(e => e.id === id);
        if (!entry) return false;
        if (entry.status !== "uploading") return false;
        if (entry._ctrl) {
            try { entry._ctrl.abort(); } catch (_) {}
        }
        return true;
    }

    function uploadAll() {
        if (_destroyed) return;
        const list = _entries.peek();
        for (const e of list) {
            if (e.status === "queued") _startUpload(e);
        }
    }

    // ----- attach drop zone ------------------------------------------

    function attachDropZone(el) {
        if (!el || _destroyed) return noop;
        if (_dropOff) _dropOff();
        _dropZoneEl = el;
        setAttr(el, "data-drop-zone", "");

        // We MUST preventDefault on dragenter+over to enable a drop.
        function onDragEnter(ev) {
            ev.preventDefault();
            _isDragOver.set(true);
        }
        function onDragOver(ev) {
            ev.preventDefault();
            if (!_isDragOver.peek()) _isDragOver.set(true);
        }
        function onDragLeave(ev) {
            // dragleave fires for child elements too; only clear when we
            // actually leave the drop zone. Test: relatedTarget is null OR
            // is outside the drop zone.
            const target = ev.relatedTarget;
            if (target && el.contains(target)) return;
            _isDragOver.set(false);
        }
        function onDrop(ev) {
            ev.preventDefault();
            _isDragOver.set(false);
            const dt = ev.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                addFiles(dt.files);
            }
        }

        el.addEventListener("dragenter", onDragEnter);
        el.addEventListener("dragover",  onDragOver);
        el.addEventListener("dragleave", onDragLeave);
        el.addEventListener("drop",      onDrop);

        _dropOff = () => {
            el.removeEventListener("dragenter", onDragEnter);
            el.removeEventListener("dragover",  onDragOver);
            el.removeEventListener("dragleave", onDragLeave);
            el.removeEventListener("drop",      onDrop);
            removeAttr(el, "data-drop-zone");
            removeAttr(el, "data-drag-over");
            if (_dropZoneEl === el) _dropZoneEl = null;
        };
        return _dropOff;
    }

    // Paint data-drag-over on the drop zone reactively.
    const stopDragPaint = effect(() => {
        const over = _isDragOver();
        if (_dropZoneEl) {
            if (over) setAttr(_dropZoneEl, "data-drag-over", "true");
            else      removeAttr(_dropZoneEl, "data-drag-over");
        }
    });

    // ----- attach file input -----------------------------------------

    function attachInput(inputEl) {
        if (!inputEl || _destroyed) return noop;
        if (_inputOff) _inputOff();
        _inputEl = inputEl;
        // Set type if not already set; respect existing attributes.
        if (inputEl.tagName === "INPUT" && inputEl.type !== "file") {
            inputEl.type = "file";
        }
        if (acceptList.length > 0 && !inputEl.hasAttribute("accept")) {
            inputEl.setAttribute("accept", accept);
        }
        if (multiple && !inputEl.hasAttribute("multiple")) {
            inputEl.setAttribute("multiple", "");
        }

        function onChange() {
            if (_destroyed) return;
            if (inputEl.files && inputEl.files.length > 0) {
                addFiles(inputEl.files);
                // Reset the input so the same file can be re-selected
                // after removal (browsers debounce identical selections).
                try { inputEl.value = ""; } catch (_) {}
            }
        }

        inputEl.addEventListener("change", onChange);

        _inputOff = () => {
            inputEl.removeEventListener("change", onChange);
            if (_inputEl === inputEl) _inputEl = null;
        };
        return _inputOff;
    }

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        // Abort any in-flight uploads.
        for (const e of _entries.peek()) {
            if (e.status === "uploading" && e._ctrl) {
                try { e._ctrl.abort(); } catch (_) {}
            }
        }
        stopDragPaint();
        if (_dropOff)  try { _dropOff(); }  catch (_) {}
        if (_inputOff) try { _inputOff(); } catch (_) {}
        _dropOff = null;
        _inputOff = null;
        _dropZoneEl = null;
        _inputEl = null;
    }

    return {
        entries, isDragOver, totalProgress, pendingCount,
        addFiles, removeEntry, retry, clear, abort, uploadAll,
        attachDropZone, attachInput,
        destroy,
        get destroyed() { return _destroyed; },
    };
}
