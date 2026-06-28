// Type-tests for @zakkster/lite-headless.
//
// This file exists ONLY to be type-checked by `tsc --noEmit` against
// types.d.ts. It exercises every primitive's documented surface so
// any mismatch between types.d.ts and the actual JS factory signature
// surfaces as a TS error rather than at consumer build time.
//
// We don't actually run this code -- it's a compile-time contract
// check. Most expressions are wrapped in unused arrow functions or
// type-only assignments to keep TS happy without needing runtime
// values that don't exist in this environment (e.g. real DOM elements).
//
// Run:    npx tsc --noEmit
// Expect: no errors.

// =============================================================================
// Common types (root)
// =============================================================================

import type { OffFn, Reason, ReactiveAccessor, ChangeCallback } from "@zakkster/lite-headless";

// Spot-check common type shapes
const _off: OffFn = () => {};
const _reason1: Reason = undefined;
const _reason2: Reason = "click";
const _acc: ReactiveAccessor<number> = () => 42;
const _cb: ChangeCallback<string> = (v, r) => { v.toUpperCase(); r?.length; };

// Quiet "declared but never used" for these intentional probes
void _off; void _reason1; void _reason2; void _acc; void _cb;

// =============================================================================
// Helpers for the rest of the file
// =============================================================================

// A typed fake DOM element so we don't have to import dom-shim or use `as any`.
declare const el: Element;
declare const imgEl: HTMLImageElement;
declare const inputEl: HTMLInputElement;
declare const btnEl: HTMLButtonElement;

// =============================================================================
// Dialog
// =============================================================================

import { createDialog } from "@zakkster/lite-headless/dialog";
import type { DialogOptions, DialogInstance, DialogStatus } from "@zakkster/lite-headless/dialog";

(function testDialog() {
    const opts: DialogOptions = {
        modal: true,
        closeOnEscape: true,
        closeOnOutsideClick: true,
        initiallyOpen: false,
        onChange: (open: boolean, reason?: string) => { open.valueOf(); reason?.length; },
    };
    const d: DialogInstance = createDialog(opts);

    const isOpen: boolean = d.open();
    const status: DialogStatus = d.status();
    d.setOpen(true);
    d.setOpen(false, "esc");
    d.toggle();
    d.toggle("user");

    const off1: OffFn = d.attachTrigger(el);
    const off2: OffFn = d.attachContent(el);
    const off3: OffFn = d.attachOverlay(el);
    const off4: OffFn = d.attachClose(el);
    const off5: OffFn = d.attachInside(el);
    const off6: OffFn = d.attachTitle(el);
    const off7: OffFn = d.attachDescription(el);

    const destroyed: boolean = d.destroyed;
    d.destroy();

    void isOpen; void status; void off1; void off2; void off3; void off4;
    void off5; void off6; void off7; void destroyed;
});

// =============================================================================
// Popover, Tooltip, Drawer
// =============================================================================

import { createPopover } from "@zakkster/lite-headless/popover";
import { createTooltip } from "@zakkster/lite-headless/tooltip";
import { createDrawer } from "@zakkster/lite-headless/drawer";
import type { PopoverSide, PopoverAlign, DrawerSide } from "@zakkster/lite-headless/popover";
import type { DrawerStatus } from "@zakkster/lite-headless/drawer";

(function testOverlays() {
    const side: PopoverSide = "top";
    const align: PopoverAlign = "center";
    const drawerSide: DrawerSide = "right";

    const pop = createPopover({ side, align, offset: 8, flip: true });
    pop.setOpen(true, "trigger");
    pop.attachAnchor(el);
    pop.attachArrow(el);

    const tip = createTooltip({ delay: { open: 100, close: 200 } });
    tip.setOpen(true);
    tip.attachTrigger(el);

    const drawer = createDrawer({ side: drawerSide, modal: true, trapFocus: true });
    const dStatus: DrawerStatus = drawer.status();
    drawer.setOpen(true);
    drawer.show();
    drawer.hide();
    drawer.setSide("left");

    void side; void align; void drawerSide; void dStatus;
    void pop; void tip; void drawer;
});

// =============================================================================
// Combobox (generic)
// =============================================================================

import { createCombobox } from "@zakkster/lite-headless/combobox";

(function testCombobox() {
    interface Country { code: string; name: string }

    const combo = createCombobox<Country>({
        items: [{ code: "US", name: "United States" }],
        getKey: (it: Country) => it.code,
        getLabel: (it: Country) => it.name,
        filter: (it: Country, q: string) => it.name.toLowerCase().includes(q.toLowerCase()),
        initialValue: null,
        onValueChange: (v: Country | null, r?: string) => { v?.code; r?.length; },
        onOpenChange: (open: boolean, r?: string) => { open.valueOf(); r?.length; },
    });
    const v: Country | null = combo.value();
    const isOpen: boolean = combo.open();
    combo.setValue({ code: "DE", name: "Germany" });
    combo.toggle("trigger");
    combo.attachTrigger(el);
    combo.attachListbox(el);
    combo.attachItem(el, { code: "US", name: "United States" });
    combo.attachInside(el);
    void v; void isOpen; void combo;
});

// =============================================================================
// Menu, Slider, Datepicker
// =============================================================================

import { createMenu } from "@zakkster/lite-headless/menu";
import { createSlider } from "@zakkster/lite-headless/slider";
import { createDatePicker } from "@zakkster/lite-headless/datepicker";
import type { DatePickerView } from "@zakkster/lite-headless/datepicker";

(function testMenuSliderDatepicker() {
    const menu = createMenu({ placement: "bottom-start", offset: 4, closeOnSelect: true, onSelect: (k: string) => k.length });
    menu.attachMenu(el);
    menu.attachItem(el, "save");
    menu.attachCheckboxItem(el, "show-line-numbers");
    menu.attachRadioItem(el, "view-mode-grid", "view-mode");
    menu.attachSeparator(el);
    menu.attachSubmenu(el, el);

    const s = createSlider({ min: 0, max: 100, step: 1, value: [25, 75], minStepsBetweenThumbs: 2 });
    const vals: number[] = s.value();
    s.setValue(50);
    s.setValue([10, 90]);
    s.attachThumb(el, 0);
    s.attachThumb(el, 1);

    const dp = createDatePicker({ value: new Date(), weekStartsOn: 1 });
    const v: Date | null = dp.value();
    const view: DatePickerView = dp.view();
    dp.setView("months");
    dp.setView("years");
    dp.goToPrevMonth();
    dp.goToNextMonth();
    dp.goToMonth(new Date());
    const days: Date[] = dp.getDaysInView();
    dp.attachGrid(el);
    dp.attachDay(el, new Date());
    dp.attachPrevMonth(el);
    dp.attachMonthLabel(el);

    void menu; void vals; void v; void view; void days;
});

// =============================================================================
// Split-panels, Stepper, Steps, Tabs
// =============================================================================

import { createSplitPanels } from "@zakkster/lite-headless/split-panels";
import { createStepper } from "@zakkster/lite-headless/stepper";
import { createSteps } from "@zakkster/lite-headless/steps";
import { createTabs } from "@zakkster/lite-headless/tabs";
import type { StepDefinition, StepStatus } from "@zakkster/lite-headless/steps";

(function testLayout() {
    const sp = createSplitPanels({
        orientation: "horizontal",
        layout: [50, 50],
        minSizes: [10, 10],
        collapsible: [true, false],
        snapPoints: [[0, 25, 50], [50, 75, 100]],
        onChange: (sz: number[], r?: string) => { sz.length; r?.length; },
    });
    sp.attachContainer(el);
    sp.collapsePanel(0);
    sp.expandPanel(0);

    const st = createStepper({ value: 5, min: 0, max: 10, step: 1 });
    st.increment("up");
    st.decrement("down");
    st.attachIncrement(el);
    st.attachDecrement(el);
    st.attachInput(inputEl);
    st.setMin(0); st.setMax(100); st.setStep(5);

    const steps: StepDefinition[] = [
        { id: "a", label: "Account" },
        { id: "b", label: "Billing", status: "current" satisfies StepStatus },
    ];
    const sm = createSteps({ steps, current: 1, allowBack: true });
    const sStatus: StepStatus = sm.statusOf(0);
    sm.next();
    sm.prev();
    sm.setCurrentById("a");
    sm.attachNextButton(el);
    sm.attachPrevButton(el);

    const tabs = createTabs({ value: "tab1", orientation: "horizontal", activationMode: "manual" });
    tabs.attachTab(el, "tab1");
    tabs.attachPanel(el, "tab1");

    void sp; void st; void steps; void sm; void sStatus; void tabs;
});

// =============================================================================
// Accordion, Carousel, Pagination, Rating, Switch
// =============================================================================

import { createAccordion } from "@zakkster/lite-headless/accordion";
import { createCarousel } from "@zakkster/lite-headless/carousel";
import { createPagination } from "@zakkster/lite-headless/pagination";
import { createRating } from "@zakkster/lite-headless/rating";
import { createSwitch } from "@zakkster/lite-headless/switch";

(function testInteractive() {
    const acc = createAccordion({ type: "multiple", value: ["a"], collapsible: true });
    const accOpen: boolean = acc.isOpen("a");
    acc.setValue(["a", "b"]);
    acc.toggle("a");
    acc.open("a"); acc.close("a");
    acc.attachTrigger(el, "a");
    acc.attachPanel(el, "a");
    acc.focusFirst(); acc.focusLast(); acc.focusKey("a");

    const car = createCarousel({ initialIndex: 0, loop: true, autoplay: false, interval: 3000 });
    const idx: number = car.index();
    const playing: boolean = car.playing();
    car.next(); car.prev(); car.first(); car.last(); car.play(); car.pause(); car.toggle();
    car.go(5, "smooth");

    const pgn = createPagination({ pageCount: 20, page: 1, siblingCount: 1, boundaryCount: 1 });
    const page: number = pgn.page();
    pgn.next(); pgn.prev(); pgn.first(); pgn.last();

    const rat = createRating({ value: 3.5, max: 5, allowHalf: true, readOnly: false });
    rat.setValue(4);

    const sw = createSwitch({ checked: false });
    sw.toggle("click");

    void acc; void car; void idx; void playing; void pgn; void page; void rat; void sw;
});

// =============================================================================
// ToggleGroup, RadioGroup, Meter, Progress, Button
// =============================================================================

import { createToggleGroup } from "@zakkster/lite-headless/toggle-group";
import { createRadioGroup } from "@zakkster/lite-headless/radio-group";
import { createMeter } from "@zakkster/lite-headless/meter";
import { createProgress } from "@zakkster/lite-headless/progress";
import { createButton } from "@zakkster/lite-headless/button";

(function testInputs() {
    const tg = createToggleGroup({ type: "multiple", value: ["a"], disabled: false });
    const tgV: string | string[] = tg.value();
    tg.setValue(["a", "b"]);

    const rg = createRadioGroup({ value: "a" });
    const rgV: string = rg.value();
    rg.setValue("b", "key");

    const m = createMeter({ value: 0.7, low: 0.3, high: 0.8, optimum: 0.5 });
    m.setValue(0.5);

    const pr = createProgress({ value: null });   // indeterminate
    const isIndeterminate: boolean = pr.indeterminate();
    pr.setValue(0.5);
    pr.setValue(null);
    pr.setIndeterminate(true);

    const btn = createButton({ toggle: true, pressed: false });
    const isPressed: boolean = btn.isPressed();
    const isLoading: boolean = btn.isLoading();
    const isDisabled: boolean = btn.isDisabled();
    const canPress: boolean = btn.canPress();
    const isToggle: boolean = btn.toggle;
    btn.setPressed(true);
    btn.setLoading(true);
    btn.setDisabled(false);
    const result: Promise<number> = btn.runAsync(Promise.resolve(42));

    void tg; void tgV; void rg; void rgV; void m; void pr; void isIndeterminate;
    void btn; void isPressed; void isLoading; void isDisabled; void canPress;
    void isToggle; void result;
});

// =============================================================================
// Card, Tag, Badge, Timeline, Descriptions, Result
// =============================================================================

import { createCard } from "@zakkster/lite-headless/card";
import { createTag } from "@zakkster/lite-headless/tag";
import { createBadge } from "@zakkster/lite-headless/badge";
import { createTimeline } from "@zakkster/lite-headless/timeline";
import { createDescriptions } from "@zakkster/lite-headless/descriptions";
import { createResult } from "@zakkster/lite-headless/result";
import type { TagIntent } from "@zakkster/lite-headless/tag";
import type { ResultStatus } from "@zakkster/lite-headless/result";
import type { TimelineItemType } from "@zakkster/lite-headless/timeline";

(function testDisplay() {
    const card = createCard({ collapsible: true, dismissible: true, defaultCollapsed: false });
    const collapsed: boolean = card.isCollapsed();
    card.setCollapsed(true, "user");
    card.dismiss("close-btn");
    card.reopen();

    const intent: TagIntent = "primary";
    const tag = createTag({ intent, closable: true, onClose: (r?: string) => r?.length });
    tag.setIntent("danger");

    const badge = createBadge({ count: 5, max: 99, dot: false });
    badge.increment(); badge.decrement(); badge.setCount(0);

    const tl = createTimeline({});
    const tlType: TimelineItemType = "warning";
    tl.attachItem(el, tlType);

    const desc = createDescriptions({ columns: 3, bordered: true });
    const descCols: number = desc.columns;
    const descBordered: boolean = desc.bordered;

    const status: ResultStatus = "success";
    const result = createResult({ status });
    const resStatus: ResultStatus = result.status;
    result.attachIcon(el);
    result.attachTitle(el);
    result.attachActions(el);

    void card; void collapsed; void intent; void tag; void badge; void tl; void tlType;
    void desc; void descCols; void descBordered; void status; void result; void resStatus;
});

// =============================================================================
// Banner, EmptyState, Skeleton, Avatar, Breadcrumb, Picture, Stat
// =============================================================================

import { createBanner } from "@zakkster/lite-headless/banner";
import { createEmptyState } from "@zakkster/lite-headless/empty-state";
import { createSkeleton } from "@zakkster/lite-headless/skeleton";
import { createAvatar } from "@zakkster/lite-headless/avatar";
import { createBreadcrumb } from "@zakkster/lite-headless/breadcrumb";
import { createPicture } from "@zakkster/lite-headless/picture";
import { createStat } from "@zakkster/lite-headless/stat";
import type { BannerKind } from "@zakkster/lite-headless/banner";

(function testContent() {
    const kind: BannerKind = "warning";
    const banner = createBanner({ kind, dismissible: true });
    banner.setOpen(true);
    banner.show("user");
    banner.dismiss();
    banner.setKind("info");
    const bannerOpen: boolean = banner.isOpen();

    const skel = createSkeleton({ ready: false, pendingSources: ["a", "b"] });
    skel.setReady(true);
    skel.resolve("a");
    skel.reset();
    skel.reveal();
    const ready: boolean = skel.ready();

    const empty = createEmptyState({ variant: "search" });
    empty.setVariant("default");
    empty.attachTitle(el);
    empty.attachDescription(el);
    empty.attachIcon(el);
    empty.attachActions(el);

    const avatar = createAvatar({ src: "u.jpg", name: "Jane Doe" });
    avatar.setSrc("new.jpg");
    avatar.attachImage(imgEl);
    avatar.attachFallback(el);
    const avState = avatar.state();
    const initials = avatar.initials();

    const bc = createBreadcrumb({ currentKey: "home" });
    const ck: string | null = bc.currentKey();
    const bcItems = bc.items();
    bc.setCurrent("settings");
    bc.attachList(el);
    bc.attachSeparator(el);

    const pic = createPicture({ src: "img.jpg" });
    pic.setSrc("img2.jpg");           // v1.0 runtime mutation
    const src: string = pic.src;
    const picState: "idle" | "loading" | "loaded" | "error" = pic.state();
    const activeSrc: string | null = pic.activeSrc;
    pic.retry();
    pic.attachImg(imgEl);

    const stat = createStat({ value: 100, label: "Revenue", unit: "$", format: (n: number) => n.toString(), animateOnChange: true });
    const v: number = stat.value();
    const dv: number = stat.displayValue();
    const lbl: string = stat.label();
    const unit: string = stat.unit();
    const trend: "up" | "down" | "flat" = stat.trend();
    stat.setValue(200);
    stat.setLabel("Total");
    stat.setUnit("€");
    stat.setTrend("up");
    stat.attachLabel(el); stat.attachValue(el); stat.attachUnit(el); stat.attachTrend(el);

    void kind; void banner; void bannerOpen; void empty; void skel; void ready;
    void avatar; void avState; void initials; void bc; void ck; void bcItems;
    void pic; void src; void picState; void activeSrc;
    void stat; void v; void dv; void lbl; void unit; void trend;
});

// =============================================================================
// Calendar, Kanban, Sortable, Tree, Toolbar
// =============================================================================

import { createCalendar } from "@zakkster/lite-headless/calendar";
import { createKanban } from "@zakkster/lite-headless/kanban";
import { createSortable } from "@zakkster/lite-headless/sortable";
import { createTree } from "@zakkster/lite-headless/tree";
import { createToolbar } from "@zakkster/lite-headless/toolbar";
import type { TreeNode } from "@zakkster/lite-headless/tree";
import type { KanbanColumn, KanbanCard } from "@zakkster/lite-headless/kanban";

(function testStructured() {
    const cal = createCalendar({ selectedDate: new Date(), events: [{ id: "e1", date: new Date(), title: "X" }] });
    cal.setSelectedDate(null);
    cal.addEvent({ id: "e2", date: new Date() });
    cal.goToToday();
    cal.goToNextMonth();
    const evs = cal.eventsForDay(new Date());
    cal.attachGrid(el);
    cal.attachDayCell(el, new Date());

    const cols: KanbanColumn[] = [{ id: "todo" }, { id: "done" }];
    const cards: KanbanCard[] = [{ id: "c1", column: "todo" }];
    const kb = createKanban({ columns: cols, cards, inColumnSortable: true });
    kb.addCard({ id: "c2", column: "todo" });
    kb.updateCard("c1", { column: "done" });
    kb.moveCard("c1", "done", 0);
    const colList = kb.columns();
    const inTodo = kb.cardsInColumn("todo");

    const sort = createSortable({ orientation: "vertical" });
    sort.setOrder(["a", "b", "c"]);
    sort.move(0, 2);
    sort.swap("a", "b");
    sort.attachHandle(el, "a");

    const nodes: TreeNode[] = [{ key: "root", children: [{ key: "child" }] }];
    const tree = createTree({ nodes, expanded: ["root"] });
    const expanded: string[] = tree.expanded();
    tree.toggleExpanded("root");
    tree.select("child");
    tree.expandAll();
    tree.attachLabel(el, "root");

    const tb = createToolbar({ orientation: "horizontal" });
    tb.attachSeparator(el);
    tb.attachGroup(el);
    tb.focusFirst();

    void cal; void evs; void kb; void colList; void inTodo;
    void sort; void nodes; void tree; void expanded; void tb;
});

// =============================================================================
// ColorPicker, CommandPalette, FileUpload, FormField, InlineEdit
// =============================================================================

import { createColorPicker } from "@zakkster/lite-headless/color-picker";
import { createCommandPalette } from "@zakkster/lite-headless/command-palette";
import { createFileUpload } from "@zakkster/lite-headless/file-upload";
import { createFormField } from "@zakkster/lite-headless/form-field";
import { createInlineEdit } from "@zakkster/lite-headless/inline-edit";

(function testForm() {
    const cp = createColorPicker({ value: "#ff0000", alpha: 1 });
    cp.setHex("#00ff00", "swatch");
    cp.setHue(120, "slider");
    cp.setBrightness(0.5, "area");
    cp.setAlpha(0.8);
    const brightness: number = cp.brightness();
    const rgb = cp.rgb();
    cp.attachArea(el);
    cp.attachAreaHandle(el);
    cp.attachHueSlider(el);
    cp.attachHueHandle(el);
    cp.attachAlphaSlider(el);
    cp.attachAlphaHandle(el);
    cp.attachSwatch(el);

    const cmdp = createCommandPalette({
        commands: [{ id: "save", label: "Save", action: () => {}, keywords: ["disk"] }],
        shortcut: "Meta+K",
    });
    cmdp.setQuery("sa");
    cmdp.register({ id: "open", label: "Open" });
    cmdp.unregister("open");
    cmdp.open();
    cmdp.toggle();
    cmdp.invoke("save");
    cmdp.next();
    cmdp.attachInput(inputEl);
    cmdp.attachList(el);
    cmdp.attachEmpty(el);
    const isOpen: boolean = cmdp.isOpen();
    const results = cmdp.results();

    const fu = createFileUpload({ multiple: true, accept: "image/*", maxSize: 1024 * 1024 });
    fu.attachInput(inputEl);
    fu.attachDropZone(el);
    const entries = fu.entries();
    fu.uploadAll();

    const ff = createFormField({ required: true });
    ff.setValid(false, "Invalid email");
    ff.setTouched(true);
    ff.reset();
    ff.attachLabel(el);
    ff.attachControl(inputEl);
    ff.attachErrorText(el);

    const ie = createInlineEdit({ value: "name" });
    ie.startEdit();
    ie.commit();
    ie.cancel();
    ie.setDraftValue("draft");
    ie.attachInput(inputEl);
    ie.attachTrigger(el);

    void cp; void brightness; void rgb; void cmdp; void isOpen; void results;
    void fu; void entries; void ff; void ie;
});

// =============================================================================
// NotificationCenter, PinInput, TagInput, Tour, Toast
// =============================================================================

import { createNotificationCenter } from "@zakkster/lite-headless/notification-center";
import { createPinInput } from "@zakkster/lite-headless/pin-input";
import { createTagInput } from "@zakkster/lite-headless/tag-input";
import { createTour } from "@zakkster/lite-headless/tour";
import { createToast } from "@zakkster/lite-headless/toast";
import type { NotificationItem } from "@zakkster/lite-headless/notification-center";

(function testFeedback() {
    const initial: NotificationItem[] = [{ id: "n1", title: "Hi", body: "World", read: false, kind: "info" }];
    const nc = createNotificationCenter({ notifications: initial });
    const unread: number = nc.unreadCount();
    nc.add({ id: "n2", title: "New" });
    nc.update("n1", { read: true });
    nc.remove("n2");
    nc.markRead("n1");
    nc.markAllRead();
    nc.clearByKind("info");
    nc.clearRead();
    nc.setFilter({ kind: "warning" });
    nc.clearFilter();

    const pin = createPinInput({ length: 6, type: "numeric", mask: true });
    pin.clear();
    pin.submit();
    pin.focusInput();
    const pinLen: number = pin.length;
    const pinComplete: boolean = pin.isComplete();
    pin.attachInput(inputEl, 0);

    const tags = createTagInput({ value: ["a"], delimiter: ",", maxTags: 10 });
    tags.addTag("b");
    tags.removeTag("a");
    tags.removeLast();
    const tagCount: number = tags.count();
    const canAdd: boolean = tags.canAddMore();
    tags.setTags(["x", "y", "z"]);

    const tour = createTour();
    tour.addStep({ id: "s1", target: el, title: "Step 1" });
    tour.start();
    tour.next();
    tour.goTo("s1");
    tour.skip();
    tour.finish();
    tour.attachStepContent(el);

    const toast = createToast({});
    const h = toast.show("Saved!", { kind: "success", duration: 3000 });
    h.dismiss();
    h.update("New message");
    toast.clear();

    void initial; void nc; void unread; void pin; void pinLen; void pinComplete;
    void tags; void tagCount; void canAdd; void tour; void toast; void h;
});

// =============================================================================
// BackTop, Affix, Anchor (Tier-2 navigation)
// =============================================================================

import { createBackTop } from "@zakkster/lite-headless/backtop";
import { createAffix } from "@zakkster/lite-headless/affix";
import { createAnchor } from "@zakkster/lite-headless/anchor";

(function testNavigation() {
    const bt = createBackTop({ threshold: 200, smooth: true, onActivate: (r?: string) => r?.length });
    bt.attachTarget(window);
    bt.attachTarget(el);
    bt.attachTarget(null);
    bt.attachButton(btnEl);
    bt.scrollToTop("api");

    const af = createAffix({ offsetTop: 64, root: el, onChange: (p: boolean) => p.valueOf() });
    const pinned: boolean = af.isPinned();
    af.attachRoot(el);

    const a = createAnchor({ root: el, offsetTop: 0, smooth: false, onChange: (k: string | null) => k?.length });
    const key: string | null = a.activeKey();
    const lc: number = a.linkCount;
    a.attachLink(el, el, "intro");
    a.attachLink(el, el);   // key omitted -- uses element id

    void bt; void af; void pinned; void a; void key; void lc;
});

// =============================================================================
// HTMLElementTagNameMap augmentation
// =============================================================================

(function testElementTagMap() {
    // querySelector returns the right typed element for each tag
    const d = document.querySelector("lite-dialog");
    if (d) {
        const isOpen: boolean = d.isOpen;
        d.setOpen(true);
        d.toggle("user");
        void isOpen;
    }

    const pop = document.querySelector("lite-popover");
    if (pop) {
        pop.toggle();
    }

    const car = document.querySelector("lite-carousel");
    if (car) {
        const i: number = car.index;
        car.next();
        car.prev();
        car.go(5);
        void i;
    }

    const tg = document.querySelector("lite-toggle-group");
    if (tg) {
        const v: string | string[] = tg.value;
        const has: boolean = tg.contains("a");
        tg.setValue(["a", "b"]);
        tg.toggleItem("a");
        tg.setItemDisabled("a", true);
        void v; void has;
    }

    const pic = document.querySelector("lite-picture");
    if (pic) {
        const s: "idle" | "loading" | "loaded" | "error" = pic.state;
        pic.setSrc("new.jpg");
        void s;
    }

    const a = document.querySelector("lite-anchor");
    if (a) {
        const k: string | null = a.activeKey;
        const lc: number = a.linkCount;
        void k; void lc;
    }

    // wrapper-specific quirks that the wrapper-vs-primitive audit caught:
    const sw = document.querySelector("lite-switch");
    if (sw) {
        // host exposes `checked` (primitive uses `isChecked`)
        const checked: boolean = sw.checked;
        sw.setChecked(false);
        sw.toggle();
        void checked;
    }

    const rt = document.querySelector("lite-rating");
    if (rt) {
        // host exposes `value` (matches primitive `value()`)
        const rv: number = rt.value;
        const dv: number = rt.displayValue;
        const ro: boolean = rt.isReadOnly;
        rt.setValue(4);
        rt.clear();
        rt.setReadOnly(true);
        void rv; void dv; void ro;
    }

    const btn = document.querySelector("lite-button");
    if (btn) {
        // host exposes `isDisabled` (matches primitive `isDisabled()`)
        const pressed: boolean = btn.isPressed;
        const dis: boolean = btn.isDisabled;
        btn.setPressed(true);
        void pressed; void dis;
    }

    const dr = document.querySelector("lite-drawer");
    if (dr) {
        // host exposes show/hide instead of toggle
        dr.show();
        dr.hide();
        dr.setSide("right");
        const isOpen: boolean = dr.isOpen;
        void isOpen;
    }

    const sp = document.querySelector("lite-split-panels");
    if (sp) {
        // host uses layout/setLayout, not sizes/setSizes
        const layout: number[] = sp.layout;
        sp.setLayout([30, 70]);
        sp.collapsePanel(0);
        void layout;
    }

    const av = document.querySelector("lite-avatar");
    if (av) {
        const st = av.state;
        const initials: string = av.initials;
        av.setSrc("x.jpg");
        void st; void initials;
    }

    const bn = document.querySelector("lite-banner");
    if (bn) {
        const op: boolean = bn.isOpen;
        bn.show();
        bn.dismiss();
        bn.setKind("error");
        void op;
    }

    const pg = document.querySelector("lite-progress");
    if (pg) {
        const frac: number = pg.fraction;
        const done: boolean = pg.isComplete;
        pg.setMin(0); pg.setMax(100); pg.setIndeterminate(true);
        void frac; void done;
    }
});
