// file-upload.test.js -- createFileUpload state + validation + upload
//                        lifecycle + abort + retry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createFileUpload } from "../src/file-upload/index.js";

// Minimal File shim. jsdom's File works but we make it explicit here.
function mkFile(name, size, type = "text/plain") {
    const f = new File([new Uint8Array(size)], name, { type });
    return f;
}
function mkFileList(...files) {
    // We can't construct FileList directly; pass an array, addFiles accepts both.
    return files;
}
function mkDropZone() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
}
function mkInput() {
    const el = document.createElement("input");
    el.type = "file";
    document.body.appendChild(el);
    return el;
}
async function flushMicro() {
    for (let i = 0; i < 4; i++) await Promise.resolve();
}

// =====================================================================
// Construction + entries
// =====================================================================

test("default: empty entries", () => {
    setupDOM();
    const fu = createFileUpload();
    assert.deepEqual(fu.entries(), []);
    assert.equal(fu.isDragOver(), false);
    assert.equal(fu.totalProgress(), 0);
    assert.equal(fu.pendingCount(), 0);
    fu.destroy();
    teardownDOM();
});

// =====================================================================
// addFiles + validation
// =====================================================================

test("addFiles adds with no validation", () => {
    setupDOM();
    const fu = createFileUpload({ autoUpload: false });
    const f = mkFile("a.txt", 10);
    const entries = fu.addFiles(mkFileList(f));
    assert.equal(entries.length, 1);
    assert.equal(fu.entries().length, 1);
    assert.equal(fu.entries()[0].file, f);
    assert.equal(fu.entries()[0].status, "queued");
    fu.destroy();
    teardownDOM();
});

test("addFiles respects maxFiles", () => {
    setupDOM();
    const invalid = [];
    const fu = createFileUpload({
        autoUpload: false,
        maxFiles: 2,
        onInvalid: (f, r) => invalid.push([f.name, r]),
    });
    fu.addFiles([mkFile("a.txt", 10), mkFile("b.txt", 10), mkFile("c.txt", 10)]);
    assert.equal(fu.entries().length, 2);
    assert.deepEqual(invalid, [["c.txt", "max-files"]]);
    fu.destroy();
    teardownDOM();
});

test("addFiles respects maxSize", () => {
    setupDOM();
    const invalid = [];
    const fu = createFileUpload({
        autoUpload: false,
        maxSize: 100,
        onInvalid: (f, r) => invalid.push([f.name, r]),
    });
    fu.addFiles([mkFile("ok.txt", 50), mkFile("big.bin", 200)]);
    assert.equal(fu.entries().length, 1);
    assert.equal(invalid[0][1], "max-size");
    fu.destroy();
    teardownDOM();
});

test("accept matches by mime", () => {
    setupDOM();
    const invalid = [];
    const fu = createFileUpload({
        autoUpload: false,
        accept: "image/*",
        onInvalid: (f, r) => invalid.push([f.name, r]),
    });
    fu.addFiles([mkFile("photo.png", 10, "image/png"), mkFile("doc.pdf", 10, "application/pdf")]);
    assert.equal(fu.entries().length, 1);
    assert.equal(fu.entries()[0].file.name, "photo.png");
    assert.equal(invalid[0][1], "accept");
    fu.destroy();
    teardownDOM();
});

test("accept matches by extension", () => {
    setupDOM();
    const fu = createFileUpload({ autoUpload: false, accept: ".pdf,.txt" });
    fu.addFiles([mkFile("a.txt", 10), mkFile("b.pdf", 10), mkFile("c.png", 10, "image/png")]);
    const names = fu.entries().map(e => e.file.name);
    assert.deepEqual(names, ["a.txt", "b.pdf"]);
    fu.destroy();
    teardownDOM();
});

test("validate function rejects + forwards reason", () => {
    setupDOM();
    const invalid = [];
    const fu = createFileUpload({
        autoUpload: false,
        validate: (f) => f.name.endsWith(".bad") ? "blocked extension" : true,
        onInvalid: (f, r) => invalid.push([f.name, r]),
    });
    fu.addFiles([mkFile("ok.txt", 10), mkFile("x.bad", 10)]);
    assert.equal(fu.entries().length, 1);
    assert.deepEqual(invalid, [["x.bad", "blocked extension"]]);
    fu.destroy();
    teardownDOM();
});

test("multiple=false rejects subsequent files", () => {
    setupDOM();
    const invalid = [];
    const fu = createFileUpload({
        autoUpload: false,
        multiple: false,
        onInvalid: (f, r) => invalid.push([f.name, r]),
    });
    fu.addFiles([mkFile("a.txt", 10), mkFile("b.txt", 10)]);
    assert.equal(fu.entries().length, 1);
    assert.equal(invalid[0][1], "multiple-disabled");
    fu.destroy();
    teardownDOM();
});

// =====================================================================
// Upload lifecycle
// =====================================================================

test("onUpload drives entry from queued -> uploading -> done", async () => {
    setupDOM();
    const log = [];
    const fu = createFileUpload({
        autoUpload: true,
        onUpload: async (entry, { onProgress }) => {
            log.push("upload-start:" + entry.file.name);
            onProgress(50);
            await Promise.resolve();
            onProgress(100);
        },
        onComplete: (e) => log.push("complete:" + e.file.name),
    });
    const [entry] = fu.addFiles([mkFile("a.txt", 100)]);
    await flushMicro();
    await flushMicro();
    assert.equal(entry.status, "done");
    assert.equal(entry.bytesLoaded(), 100);
    assert.equal(entry.progress(), 1);
    assert.ok(log.includes("upload-start:a.txt"));
    assert.ok(log.includes("complete:a.txt"));
    fu.destroy();
    teardownDOM();
});

test("onUpload error path: entry transitions to 'error' + onError fires", async () => {
    setupDOM();
    const errors = [];
    const fu = createFileUpload({
        autoUpload: true,
        onUpload: async () => { throw new Error("network fail"); },
        onError: (e, err) => errors.push([e.file.name, err.message]),
    });
    const [entry] = fu.addFiles([mkFile("a.txt", 10)]);
    await flushMicro();
    await flushMicro();
    assert.equal(entry.status, "error");
    assert.equal(errors.length, 1);
    assert.equal(errors[0][0], "a.txt");
    fu.destroy();
    teardownDOM();
});

test("autoUpload=false: entries stay queued until uploadAll()", async () => {
    setupDOM();
    let started = 0;
    const fu = createFileUpload({
        autoUpload: false,
        onUpload: async () => { started++; },
    });
    fu.addFiles([mkFile("a.txt", 10), mkFile("b.txt", 10)]);
    await flushMicro();
    assert.equal(started, 0);
    assert.equal(fu.entries()[0].status, "queued");
    fu.uploadAll();
    await flushMicro();
    await flushMicro();
    assert.equal(started, 2);
    fu.destroy();
    teardownDOM();
});

// =====================================================================
// Abort + retry + removeEntry + clear
// =====================================================================

test("abort signals the controller + transitions to 'aborted'", async () => {
    setupDOM();
    const fu = createFileUpload({
        autoUpload: true,
        onUpload: async (entry, { signal }) => {
            await new Promise((res, rej) => {
                if (signal.aborted) rej(new DOMException("aborted", "AbortError"));
                signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
                setTimeout(res, 1000);
            });
        },
    });
    const [entry] = fu.addFiles([mkFile("a.txt", 10)]);
    await flushMicro();
    assert.equal(entry.status, "uploading");
    fu.abort(entry.id);
    await flushMicro();
    await flushMicro();
    assert.equal(entry.status, "aborted");
    fu.destroy();
    teardownDOM();
});

test("retry re-queues errored entry + restarts upload", async () => {
    setupDOM();
    let attempt = 0;
    const fu = createFileUpload({
        autoUpload: true,
        onUpload: async (entry, { onProgress }) => {
            attempt++;
            if (attempt === 1) throw new Error("first fail");
            onProgress(entry.bytesTotal);
        },
    });
    const [entry] = fu.addFiles([mkFile("a.txt", 10)]);
    await flushMicro();
    await flushMicro();
    assert.equal(entry.status, "error");
    fu.retry(entry.id);
    await flushMicro();
    await flushMicro();
    assert.equal(entry.status, "done");
    assert.equal(attempt, 2);
    fu.destroy();
    teardownDOM();
});

test("removeEntry deletes + aborts if uploading", async () => {
    setupDOM();
    let abortFired = false;
    const fu = createFileUpload({
        autoUpload: true,
        onUpload: async (entry, { signal }) => {
            signal.addEventListener("abort", () => { abortFired = true; });
            await new Promise(res => setTimeout(res, 1000));
        },
    });
    const [entry] = fu.addFiles([mkFile("a.txt", 10)]);
    await flushMicro();
    assert.equal(entry.status, "uploading");
    fu.removeEntry(entry.id);
    await flushMicro();
    assert.equal(fu.entries().length, 0);
    assert.equal(abortFired, true);
    fu.destroy();
    teardownDOM();
});

test("clear() removes all + aborts in-flight uploads", async () => {
    setupDOM();
    let aborts = 0;
    const fu = createFileUpload({
        autoUpload: true,
        onUpload: async (entry, { signal }) => {
            signal.addEventListener("abort", () => { aborts++; });
            await new Promise(res => setTimeout(res, 1000));
        },
    });
    fu.addFiles([mkFile("a.txt", 10), mkFile("b.txt", 10)]);
    await flushMicro();
    fu.clear();
    await flushMicro();
    assert.equal(fu.entries().length, 0);
    assert.equal(aborts, 2);
    fu.destroy();
    teardownDOM();
});

// =====================================================================
// totalProgress + pendingCount
// =====================================================================

test("totalProgress aggregates per-file bytesLoaded", async () => {
    setupDOM();
    const fu = createFileUpload({ autoUpload: false });
    fu.addFiles([mkFile("a.txt", 100), mkFile("b.txt", 100)]);
    assert.equal(fu.totalProgress(), 0);
    fu.entries()[0].bytesLoaded.set(50);
    fu.entries()[1].bytesLoaded.set(25);
    assert.equal(fu.totalProgress(), 0.375);   // 75/200
    fu.destroy();
    teardownDOM();
});

test("pendingCount reflects queued + uploading", async () => {
    setupDOM();
    const fu = createFileUpload({ autoUpload: false });
    fu.addFiles([mkFile("a.txt", 10), mkFile("b.txt", 10)]);
    assert.equal(fu.pendingCount(), 2);
    fu.removeEntry(fu.entries()[0].id);
    assert.equal(fu.pendingCount(), 1);
    fu.destroy();
    teardownDOM();
});

// =====================================================================
// attachDropZone
// =====================================================================

test("attachDropZone sets data-drop-zone + paints data-drag-over on dragenter", () => {
    setupDOM();
    const el = mkDropZone();
    const fu = createFileUpload();
    fu.attachDropZone(el);
    assert.equal(el.hasAttribute("data-drop-zone"), true);
    // jsdom doesn't expose DragEvent; fabricate via plain Event.
    const enter = new Event("dragenter", { bubbles: true, cancelable: true });
    el.dispatchEvent(enter);
    assert.equal(el.getAttribute("data-drag-over"), "true");
    const leave = new Event("dragleave", { bubbles: true });
    leave.relatedTarget = document.body;
    el.dispatchEvent(leave);
    assert.equal(el.hasAttribute("data-drag-over"), false);
    fu.destroy();
    teardownDOM();
});

test("drop event with files calls addFiles", () => {
    setupDOM();
    const el = mkDropZone();
    const fu = createFileUpload({ autoUpload: false });
    fu.attachDropZone(el);
    const f = mkFile("dropped.txt", 10);
    const ev = new Event("drop", { bubbles: true, cancelable: true });
    ev.dataTransfer = { files: [f] };
    el.dispatchEvent(ev);
    assert.equal(fu.entries().length, 1);
    assert.equal(fu.entries()[0].file.name, "dropped.txt");
    fu.destroy();
    teardownDOM();
});

// =====================================================================
// destroy
// =====================================================================

test("destroy clears attrs + makes methods no-ops", () => {
    setupDOM();
    const el = mkDropZone();
    const fu = createFileUpload();
    fu.attachDropZone(el);
    fu.destroy();
    assert.equal(el.hasAttribute("data-drop-zone"), false);
    fu.addFiles([mkFile("a.txt", 10)]);
    assert.equal(fu.destroyed, true);
    teardownDOM();
});

test("destroy is idempotent", () => {
    setupDOM();
    const fu = createFileUpload();
    fu.destroy();
    fu.destroy();
    assert.equal(fu.destroyed, true);
    teardownDOM();
});
