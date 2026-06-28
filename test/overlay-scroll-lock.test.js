// overlay/scroll-lock.test.js -- refcount + restore

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { lockScroll, _resetScrollLockForTests, _getScrollLockCount } from "../src/_overlay/scroll-lock.js";

function setBodyStyles(overflow, paddingRight) {
    document.body.style.overflow = overflow;
    document.body.style.paddingRight = paddingRight;
}

test("first lock sets overflow:hidden on body", () => {
    setupDOM();
    _resetScrollLockForTests();
    setBodyStyles("", "");
    const unlock = lockScroll();
    assert.equal(document.body.style.overflow, "hidden");
    assert.equal(_getScrollLockCount(), 1);
    unlock();
    _resetScrollLockForTests();
    teardownDOM();
});

test("last unlock restores previous overflow value", () => {
    setupDOM();
    _resetScrollLockForTests();
    setBodyStyles("auto", "10px");
    const unlock = lockScroll();
    unlock();
    assert.equal(document.body.style.overflow, "auto");
    assert.equal(document.body.style.paddingRight, "10px");
    teardownDOM();
});

test("nested locks: only first writes, only last restores", () => {
    setupDOM();
    _resetScrollLockForTests();
    setBodyStyles("scroll", "5px");
    const u1 = lockScroll();
    const u2 = lockScroll();
    const u3 = lockScroll();
    assert.equal(_getScrollLockCount(), 3);
    assert.equal(document.body.style.overflow, "hidden");

    u1();
    assert.equal(document.body.style.overflow, "hidden", "still locked while count>0");
    u2();
    assert.equal(document.body.style.overflow, "hidden");
    u3();
    assert.equal(document.body.style.overflow, "scroll", "restored to original");
    assert.equal(document.body.style.paddingRight, "5px");
    _resetScrollLockForTests();
    teardownDOM();
});

test("calling unlock twice is a no-op (doesn't decrement past zero)", () => {
    setupDOM();
    _resetScrollLockForTests();
    const u = lockScroll();
    u();
    u(); // second call: must not break the count
    const u2 = lockScroll(); // fresh lock after everything balanced
    assert.equal(_getScrollLockCount(), 1);
    u2();
    _resetScrollLockForTests();
    teardownDOM();
});

test("unlocks called out of order still drain to zero correctly", () => {
    setupDOM();
    _resetScrollLockForTests();
    const a = lockScroll();
    const b = lockScroll();
    const c = lockScroll();
    b();
    a();
    c();
    assert.equal(_getScrollLockCount(), 0);
    assert.equal(document.body.style.overflow, "");
    _resetScrollLockForTests();
    teardownDOM();
});
