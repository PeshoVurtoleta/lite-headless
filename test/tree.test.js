// tree.test.js -- createTree end-to-end

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchClick } from "./_setup.js";
import { createTree } from "../src/tree/index.js";

function mkTree() {
    // Builds:
    //   src/        (expandable)
    //     index.js
    //     util.js   (disabled)
    //   docs/       (expandable)
    //     readme.md
    //   readme.md   (top-level leaf)
    const root = document.createElement("ul");

    const src = document.createElement("li");
    const srcChildren = document.createElement("ul");
    const srcIndex = document.createElement("li");
    srcIndex.textContent = "index.js";
    const srcUtil = document.createElement("li");
    srcUtil.textContent = "util.js";
    srcChildren.append(srcIndex, srcUtil);
    src.textContent = "src";
    src.appendChild(srcChildren);

    const docs = document.createElement("li");
    const docsChildren = document.createElement("ul");
    const docsReadme = document.createElement("li");
    docsReadme.textContent = "readme.md";
    docsChildren.append(docsReadme);
    docs.textContent = "docs";
    docs.appendChild(docsChildren);

    const topReadme = document.createElement("li");
    topReadme.textContent = "readme.md";

    root.append(src, docs, topReadme);
    document.body.appendChild(root);

    return { root, src, srcIndex, srcUtil, docs, docsReadme, topReadme };
}

function keydown(el, key) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function attachAll(tree, dom) {
    tree.attachRoot(dom.root);
    tree.attachNode(dom.src, "src");
    tree.attachNode(dom.srcIndex, "src/index.js");
    tree.attachNode(dom.srcUtil, "src/util.js", { disabled: true });
    tree.attachNode(dom.docs, "docs");
    tree.attachNode(dom.docsReadme, "docs/readme.md");
    tree.attachNode(dom.topReadme, "readme.md");
}

// -----------------------------------------------------------------
// lifecycle + ARIA
// -----------------------------------------------------------------

test("attachRoot writes role=tree", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    tree.attachRoot(dom.root);
    assert.equal(dom.root.getAttribute("role"), "tree");
    tree.destroy();
    teardownDOM();
});

test("multi-select root gets aria-multiselectable=true", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree({ selectionMode: "multiple" });
    tree.attachRoot(dom.root);
    assert.equal(dom.root.getAttribute("aria-multiselectable"), "true");
    tree.destroy();
    teardownDOM();
});

test("attachNode writes role=treeitem + aria-level + tabindex=-1", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    assert.equal(dom.src.getAttribute("role"), "treeitem");
    assert.equal(dom.src.getAttribute("aria-level"), "1");
    assert.equal(dom.srcIndex.getAttribute("aria-level"), "2");
    assert.equal(dom.src.getAttribute("tabindex"), "-1");
    tree.destroy();
    teardownDOM();
});

test("nodes with children get aria-expanded; leaves do not", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    assert.equal(dom.src.getAttribute("aria-expanded"), "false");      // has children, collapsed
    assert.equal(dom.docs.getAttribute("aria-expanded"), "false");
    assert.equal(dom.topReadme.hasAttribute("aria-expanded"), false);  // leaf
    assert.equal(dom.srcIndex.hasAttribute("aria-expanded"), false);
    tree.destroy();
    teardownDOM();
});

test("disabled nodes get aria-disabled=true", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    assert.equal(dom.srcUtil.getAttribute("aria-disabled"), "true");
    tree.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// parent inference
// -----------------------------------------------------------------

test("DOM-based parent inference: srcIndex's parent is src", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    // We test indirectly via aria-level (level 2 = parent exists)
    assert.equal(dom.srcIndex.getAttribute("aria-level"), "2");
    assert.equal(dom.docsReadme.getAttribute("aria-level"), "2");
    assert.equal(dom.topReadme.getAttribute("aria-level"), "1");
    tree.destroy();
    teardownDOM();
});

test("hasChildren is inferred when at least one child is attached", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    assert.equal(tree.hasChildren("src"), true);
    assert.equal(tree.hasChildren("docs"), true);
    assert.equal(tree.hasChildren("readme.md"), false);
    assert.equal(tree.hasChildren("src/index.js"), false);
    tree.destroy();
    teardownDOM();
});

test("explicit hasChildren:true makes a node expandable even without children attached", () => {
    setupDOM();
    const root = document.createElement("ul");
    const folder = document.createElement("li");
    folder.textContent = "lazy folder";
    root.appendChild(folder);
    document.body.appendChild(root);

    const tree = createTree();
    tree.attachRoot(root);
    tree.attachNode(folder, "lazy", { hasChildren: true });
    assert.equal(tree.hasChildren("lazy"), true);
    assert.equal(folder.getAttribute("aria-expanded"), "false");
    tree.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// visibility / expand / collapse
// -----------------------------------------------------------------

test("initial visibility: only top-level nodes are visible", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    assert.deepEqual(tree._visible(), ["src", "docs", "readme.md"]);
    tree.destroy();
    teardownDOM();
});

test("defaultExpanded honors the initial set", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree({ defaultExpanded: ["src"] });
    attachAll(tree, dom);
    assert.deepEqual(tree._visible(), ["src", "src/index.js", "src/util.js", "docs", "readme.md"]);
    assert.equal(dom.src.getAttribute("aria-expanded"), "true");
    tree.destroy();
    teardownDOM();
});

test("expand/collapse mutate visibility", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    tree.expand("src");
    assert.deepEqual(tree._visible(), ["src", "src/index.js", "src/util.js", "docs", "readme.md"]);
    tree.collapse("src");
    assert.deepEqual(tree._visible(), ["src", "docs", "readme.md"]);
    tree.destroy();
    teardownDOM();
});

test("toggleExpanded flips state", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    tree.toggleExpanded("src");
    assert.equal(tree.isExpanded("src"), true);
    tree.toggleExpanded("src");
    assert.equal(tree.isExpanded("src"), false);
    tree.destroy();
    teardownDOM();
});

test("expandAll expands every node that has children", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    tree.expandAll();
    assert.deepEqual(tree.expanded().sort(), ["docs", "src"]);
    tree.destroy();
    teardownDOM();
});

test("collapseAll clears everything", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree({ defaultExpanded: ["src", "docs"] });
    attachAll(tree, dom);
    tree.collapseAll();
    assert.deepEqual(tree.expanded(), []);
    tree.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// selection
// -----------------------------------------------------------------

test("single-mode: click selects and replaces", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    dispatchClick(dom.topReadme);
    assert.equal(tree.selected(), "readme.md");
    tree.expand("src");
    dispatchClick(dom.srcIndex);
    assert.equal(tree.selected(), "src/index.js");
    tree.destroy();
    teardownDOM();
});

test("multi-mode: click toggles selection in/out of array", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree({ selectionMode: "multiple" });
    attachAll(tree, dom);
    tree.expand("src"); tree.expand("docs");
    dispatchClick(dom.srcIndex);
    dispatchClick(dom.docsReadme);
    assert.deepEqual(tree.selected(), ["src/index.js", "docs/readme.md"]);
    dispatchClick(dom.srcIndex);
    assert.deepEqual(tree.selected(), ["docs/readme.md"]);
    tree.destroy();
    teardownDOM();
});

test("disabled node refuses selection clicks", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    tree.expand("src");
    dispatchClick(dom.srcUtil);   // disabled
    assert.equal(tree.selected(), null);
    tree.destroy();
    teardownDOM();
});

test("aria-selected paint reflects selection", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    dispatchClick(dom.topReadme);
    assert.equal(dom.topReadme.getAttribute("aria-selected"), "true");
    assert.equal(dom.src.getAttribute("aria-selected"), "false");
    tree.destroy();
    teardownDOM();
});

test("setSelected (programmatic) accepts unknown keys (lazy-attach scenario)", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    tree.setSelected("not-yet-attached");
    assert.equal(tree.selected(), "not-yet-attached");
    tree.destroy();
    teardownDOM();
});

test("setDisabled on selected node clears the selection (auto-fallback)", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    dispatchClick(dom.topReadme);
    assert.equal(tree.selected(), "readme.md");
    tree.setDisabled("readme.md", true);
    assert.equal(tree.selected(), null);
    tree.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// keyboard
// -----------------------------------------------------------------

test("ArrowRight on collapsed-with-children expands", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    dom.src.focus();
    keydown(dom.src, "ArrowRight");
    assert.equal(tree.isExpanded("src"), true);
    tree.destroy();
    teardownDOM();
});

test("ArrowRight on expanded moves focus to first child", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree({ defaultExpanded: ["src"] });
    attachAll(tree, dom);
    dom.src.focus();
    keydown(dom.src, "ArrowRight");
    assert.equal(document.activeElement?._lhTreeKey, "src/index.js");
    tree.destroy();
    teardownDOM();
});

test("ArrowLeft on expanded collapses", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree({ defaultExpanded: ["src"] });
    attachAll(tree, dom);
    dom.src.focus();
    keydown(dom.src, "ArrowLeft");
    assert.equal(tree.isExpanded("src"), false);
    tree.destroy();
    teardownDOM();
});

test("ArrowLeft on collapsed-leaf moves focus to parent", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree({ defaultExpanded: ["src"] });
    attachAll(tree, dom);
    dom.srcIndex.focus();
    keydown(dom.srcIndex, "ArrowLeft");
    assert.equal(document.activeElement?._lhTreeKey, "src");
    tree.destroy();
    teardownDOM();
});

test("ArrowDown moves through visible nodes (skipping collapsed subtrees)", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    dom.src.focus();
    keydown(dom.src, "ArrowDown");
    assert.equal(document.activeElement?._lhTreeKey, "docs");
    keydown(dom.docs, "ArrowDown");
    assert.equal(document.activeElement?._lhTreeKey, "readme.md");
    tree.destroy();
    teardownDOM();
});

test("ArrowDown into expanded subtree descends", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree({ defaultExpanded: ["src"] });
    attachAll(tree, dom);
    dom.src.focus();
    keydown(dom.src, "ArrowDown");
    assert.equal(document.activeElement?._lhTreeKey, "src/index.js");
    tree.destroy();
    teardownDOM();
});

test("Enter selects the focused node", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    dom.topReadme.focus();
    keydown(dom.topReadme, "Enter");
    assert.equal(tree.selected(), "readme.md");
    tree.destroy();
    teardownDOM();
});

test("Space selects (alternative to Enter)", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    dom.topReadme.focus();
    keydown(dom.topReadme, " ");
    assert.equal(tree.selected(), "readme.md");
    tree.destroy();
    teardownDOM();
});

test("Home / End jump to first / last visible enabled", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree({ defaultExpanded: ["src", "docs"] });
    attachAll(tree, dom);
    dom.topReadme.focus();
    keydown(dom.topReadme, "Home");
    assert.equal(document.activeElement?._lhTreeKey, "src");
    keydown(dom.src, "End");
    assert.equal(document.activeElement?._lhTreeKey, "readme.md");
    tree.destroy();
    teardownDOM();
});

test("ArrowDown skips disabled nodes", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree({ defaultExpanded: ["src"] });
    attachAll(tree, dom);
    dom.srcIndex.focus();
    keydown(dom.srcIndex, "ArrowDown");
    // src/util.js is disabled, so jump to docs
    assert.equal(document.activeElement?._lhTreeKey, "docs");
    tree.destroy();
    teardownDOM();
});

test("* (star) expands all siblings of the focused node", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    dom.src.focus();
    keydown(dom.src, "*");
    // src + docs are siblings at level 1, both have children -- both should expand
    assert.deepEqual(tree.expanded().sort(), ["docs", "src"]);
    tree.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// edge cases
// -----------------------------------------------------------------

test("throws on invalid selectionMode", () => {
    assert.throws(() => createTree({ selectionMode: "bogus" }),
        /selectionMode must be "single" or "multiple"/);
});

test("throws if attachNode called without key", () => {
    setupDOM();
    const tree = createTree();
    const el = document.createElement("li");
    assert.throws(() => tree.attachNode(el), /key is required/);
    tree.destroy();
    teardownDOM();
});

test("destroy is idempotent and stops further changes", () => {
    setupDOM();
    const dom = mkTree();
    const tree = createTree();
    attachAll(tree, dom);
    tree.destroy();
    tree.destroy();
    assert.equal(tree.destroyed, true);
    tree.expand("src");
    assert.deepEqual(tree.expanded(), []);
    teardownDOM();
});

test("data-tree-toggle child element toggles expand without selecting", () => {
    setupDOM();
    const root = document.createElement("ul");
    const folder = document.createElement("li");
    folder.textContent = "Folder ";
    const toggle = document.createElement("span");
    toggle.setAttribute("data-tree-toggle", "");
    toggle.textContent = "▶";
    folder.appendChild(toggle);
    const child = document.createElement("li");
    child.textContent = "Child";
    folder.appendChild(child);
    root.appendChild(folder);
    document.body.appendChild(root);

    const tree = createTree();
    tree.attachRoot(root);
    tree.attachNode(folder, "folder");
    tree.attachNode(child, "child");

    dispatchClick(toggle);
    assert.equal(tree.isExpanded("folder"), true);
    assert.equal(tree.selected(), null, "toggle did not select the row");

    // Click on the row body (not the toggle) selects
    dispatchClick(folder);
    assert.equal(tree.selected(), "folder");
    teardownDOM();
});

test("nested chevron click only toggles its OWN treeitem, not ancestors (regression)", () => {
    // v0.7.10 regression. Before the fix, clicking a chevron inside a
    // deeply-nested treeitem would bubble up through ancestor treeitem
    // <li> elements; each ancestor's click handler walked from
    // e.target to el and found the data-tree-toggle attribute on the
    // chevron (which itself has no _lhTreeKey), then incorrectly
    // toggled itself. Clicking the chevron for src/utils ended up
    // toggling BOTH src/utils AND src.
    setupDOM();
    const root = document.createElement("ul");
    const parent = document.createElement("li");
    const parentToggle = document.createElement("span");
    parentToggle.setAttribute("data-tree-toggle", "");
    parent.appendChild(parentToggle);
    parent.appendChild(document.createTextNode("parent"));
    const childList = document.createElement("ul");
    const child = document.createElement("li");
    const childToggle = document.createElement("span");
    childToggle.setAttribute("data-tree-toggle", "");
    child.appendChild(childToggle);
    child.appendChild(document.createTextNode("child"));
    const leaf = document.createElement("li");
    leaf.textContent = "leaf";
    const leafList = document.createElement("ul");
    leafList.appendChild(leaf);
    child.appendChild(leafList);
    childList.appendChild(child);
    parent.appendChild(childList);
    root.appendChild(parent);
    document.body.appendChild(root);

    const tree = createTree({ defaultExpanded: ["parent"] });
    tree.attachRoot(root);
    tree.attachNode(parent, "parent");
    tree.attachNode(child, "child");
    tree.attachNode(leaf, "leaf");

    // initial: parent open, child closed
    assert.equal(tree.isExpanded("parent"), true);
    assert.equal(tree.isExpanded("child"), false);

    // click child's chevron -- should open child, leave parent open
    dispatchClick(childToggle);
    assert.equal(tree.isExpanded("child"), true, "child opened");
    assert.equal(tree.isExpanded("parent"), true, "parent unchanged (BUG: was toggled off)");

    // click child's chevron again -- should close child, leave parent open
    dispatchClick(childToggle);
    assert.equal(tree.isExpanded("child"), false, "child closed");
    assert.equal(tree.isExpanded("parent"), true, "parent still unchanged");

    tree.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// v0.7.11: O(1) hasChildren + cached visibleFlat
// -----------------------------------------------------------------

test("hasChildren is O(1) (regression: was O(N))", () => {
    // Build a 200-node tree (a root with 100 children, each having 1 grandchild).
    // The old implementation scanned every _nodes entry per hasChildren call;
    // 200 paint iterations * 200 scans = 40k iterations per single click.
    // We don't measure time (flaky on shared CI) but we can verify correctness
    // at scale and that no exception escapes.
    setupDOM();
    const root = document.createElement("ul");
    document.body.appendChild(root);
    const tree = createTree();
    tree.attachRoot(root);

    const rootKey = "root";
    const rootLi = document.createElement("li");
    root.appendChild(rootLi);
    tree.attachNode(rootLi, rootKey);

    for (let i = 0; i < 100; i++) {
        const parentLi = document.createElement("li");
        rootLi.appendChild(parentLi);
        tree.attachNode(parentLi, "p" + i);

        const childLi = document.createElement("li");
        parentLi.appendChild(childLi);
        tree.attachNode(childLi, "p" + i + "/c");
    }

    // Root has 100 children
    assert.equal(tree.hasChildren("root"), true);
    // Each parent has exactly 1 child
    assert.equal(tree.hasChildren("p0"), true);
    assert.equal(tree.hasChildren("p99"), true);
    // Leaves have no children
    assert.equal(tree.hasChildren("p0/c"), false);
    assert.equal(tree.hasChildren("p99/c"), false);

    // Detach a child -- parent should still report hasChildren correctly
    // (here we detach p0/c via a fresh test by direct removal isn't trivial;
    // instead verify via setDisabled that disabled doesn't affect hasChildren)
    tree.setDisabled("p0/c", true);
    assert.equal(tree.hasChildren("p0"), true, "disabled child still counts");

    tree.destroy();
    teardownDOM();
});

test("visibleFlat cache invalidates on expand/collapse + attach (regression)", () => {
    // The cache is an implementation detail; correctness check: rapid
    // queries before/after structural changes return updated lists.
    setupDOM();
    const root = document.createElement("ul");
    const folder = document.createElement("li");
    const child1 = document.createElement("li");
    const child2 = document.createElement("li");
    folder.append(child1, child2);
    root.appendChild(folder);
    document.body.appendChild(root);

    const tree = createTree({ defaultExpanded: ["folder"] });
    tree.attachRoot(root);
    tree.attachNode(folder, "folder");
    tree.attachNode(child1, "child1");
    tree.attachNode(child2, "child2");

    // 1. baseline: 3 visible keys
    assert.deepEqual(tree._visible(), ["folder", "child1", "child2"]);

    // 2. collapse -- cache should rebuild on next query
    tree.collapse("folder");
    assert.deepEqual(tree._visible(), ["folder"]);

    // 3. expand again -- cache rebuilds
    tree.expand("folder");
    assert.deepEqual(tree._visible(), ["folder", "child1", "child2"]);

    // 4. attach a new node -- cache invalidates
    const child3 = document.createElement("li");
    folder.appendChild(child3);
    tree.attachNode(child3, "child3");
    assert.deepEqual(tree._visible(), ["folder", "child1", "child2", "child3"]);

    tree.destroy();
    teardownDOM();
});
