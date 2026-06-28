// @zakkster/lite-headless / types.d.ts
//
// Public type surface for the JavaScript implementation in src/.
// All factory functions accept an optional options object and return
// an instance object with reactive accessors (call-style:
// `instance.value()` not `instance.value`), imperative mutators
// (`setValue(v, reason?)`), and attachment helpers
// (`attachX(el): OffFn`).
//
// Conventions:
//
//   - ReactiveAccessor<T> = () => T  — read the current value
//   - OffFn               = () => void  — disposer returned by attach*
//   - Reason              = string | undefined  — action descriptor
//                           passed through events ("click", "set",
//                           "drag", etc.)
//
// Element wrappers (the `lite-X` custom elements) extend HTMLElement
// with the same accessors/methods plus event types. See the global
// HTMLElementTagNameMap augmentation at the bottom of this file.

// =============================================================================
// Common types
// =============================================================================

/** Disposer returned by every `attachX()` method. Idempotent. */
export type OffFn = () => void;

/** Optional descriptor for the reason a mutation happened. */
export type Reason = string | undefined;

/** Call-style signal accessor. `() => T` returns the current value. */
export type ReactiveAccessor<T> = () => T;

/** Single-tab callback shape (option `onChange`, `onActivate`, etc.). */
export type ChangeCallback<T> = (value: T, reason?: string) => void;

// =============================================================================
// dialog
// =============================================================================
// Root entry - barrel re-export
// =============================================================================
//
// Mirrors src/index.js. Consumers using the bare-package import
// `import { createX } from "@zakkster/lite-headless"` get types from here.
// Subpath imports `from "@zakkster/lite-headless/<primitive>"` are also
// typed (each subpath has its own `declare module` block below).

declare module "@zakkster/lite-headless" {
    export { createAccordion } from "@zakkster/lite-headless/accordion";
    export { createAffix } from "@zakkster/lite-headless/affix";
    export { createAnchor } from "@zakkster/lite-headless/anchor";
    export { createAvatar, deriveInitials, hueFromString } from "@zakkster/lite-headless/avatar";
    export { createBackTop } from "@zakkster/lite-headless/backtop";
    export { createBadge } from "@zakkster/lite-headless/badge";
    export { createBanner } from "@zakkster/lite-headless/banner";
    export { createBreadcrumb } from "@zakkster/lite-headless/breadcrumb";
    export { createButton } from "@zakkster/lite-headless/button";
    export { createCalendar } from "@zakkster/lite-headless/calendar";
    export { createCard } from "@zakkster/lite-headless/card";
    export { createCarousel } from "@zakkster/lite-headless/carousel";
    export { createColorPicker } from "@zakkster/lite-headless/color-picker";
    export { createCombobox } from "@zakkster/lite-headless/combobox";
    export { createCommandPalette } from "@zakkster/lite-headless/command-palette";
    export { createDatePicker } from "@zakkster/lite-headless/datepicker";
    export { createDescriptions } from "@zakkster/lite-headless/descriptions";
    export { createDialog } from "@zakkster/lite-headless/dialog";
    export { createDrawer } from "@zakkster/lite-headless/drawer";
    export { createEmptyState } from "@zakkster/lite-headless/empty-state";
    export { createFileUpload } from "@zakkster/lite-headless/file-upload";
    export { createFormField } from "@zakkster/lite-headless/form-field";
    export { createInlineEdit } from "@zakkster/lite-headless/inline-edit";
    export { createKanban } from "@zakkster/lite-headless/kanban";
    export { createMenu } from "@zakkster/lite-headless/menu";
    export { createMeter } from "@zakkster/lite-headless/meter";
    export { createNotificationCenter } from "@zakkster/lite-headless/notification-center";
    export { createPagination, buildItems } from "@zakkster/lite-headless/pagination";
    export { createPicture } from "@zakkster/lite-headless/picture";
    export { createPinInput } from "@zakkster/lite-headless/pin-input";
    export { createPopover } from "@zakkster/lite-headless/popover";
    export { createProgress } from "@zakkster/lite-headless/progress";
    export { createRadioGroup } from "@zakkster/lite-headless/radio-group";
    export { createRating } from "@zakkster/lite-headless/rating";
    export { createResult } from "@zakkster/lite-headless/result";
    export { createSkeleton } from "@zakkster/lite-headless/skeleton";
    export { createSlider } from "@zakkster/lite-headless/slider";
    export { createSortable } from "@zakkster/lite-headless/sortable";
    export { createSplitPanels } from "@zakkster/lite-headless/split-panels";
    export { createStat } from "@zakkster/lite-headless/stat";
    export { createStepper } from "@zakkster/lite-headless/stepper";
    export { createSteps } from "@zakkster/lite-headless/steps";
    export { createSwitch } from "@zakkster/lite-headless/switch";
    export { createTabs } from "@zakkster/lite-headless/tabs";
    export { createTag } from "@zakkster/lite-headless/tag";
    export { createTagInput } from "@zakkster/lite-headless/tag-input";
    export { createTimeline } from "@zakkster/lite-headless/timeline";
    export { createToast } from "@zakkster/lite-headless/toast";
    export { createToggleGroup } from "@zakkster/lite-headless/toggle-group";
    export { createToolbar } from "@zakkster/lite-headless/toolbar";
    export { createTooltip } from "@zakkster/lite-headless/tooltip";
    export { createTour } from "@zakkster/lite-headless/tour";
    export { createTree } from "@zakkster/lite-headless/tree";
    export { createSeparator } from "@zakkster/lite-headless/separator";
    export { createClipboard } from "@zakkster/lite-headless/clipboard";
    export { createPasswordInput } from "@zakkster/lite-headless/password-input";
    export { createAlertDialog } from "@zakkster/lite-headless/alert-dialog";
    export { createHoverCard } from "@zakkster/lite-headless/hover-card";

    // --- type re-exports (so `import type { X } from "@zakkster/lite-headless"` resolves) ---
    export type { DialogStatus, DialogOptions, DialogInstance } from "@zakkster/lite-headless/dialog";
    export type { PopoverSide, PopoverAlign, PopoverStatus, PopoverOptions, PopoverInstance } from "@zakkster/lite-headless/popover";
    export type { TooltipStatus, TooltipOptions, TooltipInstance } from "@zakkster/lite-headless/tooltip";
    export type { DrawerSide, DrawerStatus, DrawerOptions, DrawerInstance } from "@zakkster/lite-headless/drawer";
    export type { ComboboxStatus, ComboboxOptions, ComboboxInstance } from "@zakkster/lite-headless/combobox";
    export type { MenuStatus, MenuOptions, MenuInstance } from "@zakkster/lite-headless/menu";
    export type { SliderOptions, SliderInstance } from "@zakkster/lite-headless/slider";
    export type { DatePickerView, DatePickerMode, DatePickerOptions, DatePickerInstance } from "@zakkster/lite-headless/datepicker";
    export type { SplitPanelsOptions, SplitPanelsInstance } from "@zakkster/lite-headless/split-panels";
    export type { StepperOptions, StepperInstance } from "@zakkster/lite-headless/stepper";
    export type { StepStatus, StepsOrientation, StepDefinition, StepsOptions, StepsInstance } from "@zakkster/lite-headless/steps";
    export type { TabsOptions, TabsInstance } from "@zakkster/lite-headless/tabs";
    export type { AccordionOptions, AccordionInstance } from "@zakkster/lite-headless/accordion";
    export type { CarouselOptions, CarouselInstance } from "@zakkster/lite-headless/carousel";
    export type { PaginationItem, PaginationOptions, PaginationInstance } from "@zakkster/lite-headless/pagination";
    export type { RatingOptions, RatingInstance } from "@zakkster/lite-headless/rating";
    export type { SwitchOptions, SwitchInstance } from "@zakkster/lite-headless/switch";
    export type { ToggleGroupType, ToggleGroupOrientation, ToggleGroupItem, ToggleGroupOptions, ToggleGroupInstance } from "@zakkster/lite-headless/toggle-group";
    export type { RadioGroupOptions, RadioGroupInstance } from "@zakkster/lite-headless/radio-group";
    export type { MeterState, MeterOptions, MeterInstance } from "@zakkster/lite-headless/meter";
    export type { ProgressVariant, ProgressOptions, ProgressInstance } from "@zakkster/lite-headless/progress";
    export type { ButtonOptions, ButtonInstance } from "@zakkster/lite-headless/button";
    export type { CardOptions, CardInstance } from "@zakkster/lite-headless/card";
    export type { TagIntent, TagOptions, TagInstance } from "@zakkster/lite-headless/tag";
    export type { BadgeIntent, BadgeOptions, BadgeInstance } from "@zakkster/lite-headless/badge";
    export type { TimelineItemType, TimelineOptions, TimelineInstance } from "@zakkster/lite-headless/timeline";
    export type { DescriptionsOptions, DescriptionsInstance } from "@zakkster/lite-headless/descriptions";
    export type { ResultStatus, ResultOptions, ResultInstance } from "@zakkster/lite-headless/result";
    export type { BannerKind, BannerOptions, BannerInstance } from "@zakkster/lite-headless/banner";
    export type { EmptyStateVariant, EmptyStateOptions, EmptyStateInstance } from "@zakkster/lite-headless/empty-state";
    export type { SkeletonOptions, SkeletonInstance } from "@zakkster/lite-headless/skeleton";
    export type { AvatarState, AvatarOptions, AvatarInstance } from "@zakkster/lite-headless/avatar";
    export type { BreadcrumbItem, BreadcrumbOptions, BreadcrumbInstance } from "@zakkster/lite-headless/breadcrumb";
    export type { PictureState, PictureSource, PictureOptions, PictureInstance } from "@zakkster/lite-headless/picture";
    export type { StatTrend, StatOptions, StatInstance } from "@zakkster/lite-headless/stat";
    export type { CalendarView, CalendarEvent, CalendarOptions, CalendarInstance } from "@zakkster/lite-headless/calendar";
    export type { KanbanColumn, KanbanCard, KanbanOptions, KanbanInstance } from "@zakkster/lite-headless/kanban";
    export type { SortableOrientation, SortableItem, SortableOptions, SortableInstance } from "@zakkster/lite-headless/sortable";
    export type { TreeNode, TreeOptions, TreeInstance } from "@zakkster/lite-headless/tree";
    export type { SeparatorOrientation, SeparatorOptions, SeparatorInstance } from "@zakkster/lite-headless/separator";
    export type { ClipboardOptions, ClipboardInstance } from "@zakkster/lite-headless/clipboard";
    export type { PasswordInputOptions, PasswordInputInstance } from "@zakkster/lite-headless/password-input";
    export type { AlertDialogOptions, AlertDialogInstance } from "@zakkster/lite-headless/alert-dialog";
    export type { HoverCardStatus, HoverCardPlacement, HoverCardOptions, HoverCardInstance } from "@zakkster/lite-headless/hover-card";
    export type { ToolbarOptions, ToolbarInstance } from "@zakkster/lite-headless/toolbar";
    export type { RGB, HSL, HSV, OKLCH, ColorPickerOptions, ColorPickerInstance } from "@zakkster/lite-headless/color-picker";
    export type { Command, CommandResult, CommandPaletteOptions, CommandPaletteInstance } from "@zakkster/lite-headless/command-palette";
    export type { FileEntryStatus, FileEntry, FileUploadOptions, FileUploadInstance } from "@zakkster/lite-headless/file-upload";
    export type { FormFieldOptions, FormFieldInstance } from "@zakkster/lite-headless/form-field";
    export type { InlineEditOptions, InlineEditInstance } from "@zakkster/lite-headless/inline-edit";
    export type { NotificationKind, NotificationItem, NotificationFilter, NotificationCenterOptions, NotificationCenterInstance } from "@zakkster/lite-headless/notification-center";
    export type { PinInputOptions, PinInputInstance } from "@zakkster/lite-headless/pin-input";
    export type { TagInputOptions, TagInputInstance } from "@zakkster/lite-headless/tag-input";
    export type { TourStep, TourOptions, TourInstance } from "@zakkster/lite-headless/tour";
    export type { ToastShowOptions, ToastHandle, ToastInstance } from "@zakkster/lite-headless/toast";
    export type { BackTopOptions, BackTopInstance } from "@zakkster/lite-headless/backtop";
    export type { AffixOptions, AffixInstance } from "@zakkster/lite-headless/affix";
    export type { AnchorOptions, AnchorInstance } from "@zakkster/lite-headless/anchor";
}

// =============================================================================

declare module "@zakkster/lite-headless/dialog" {
    export type DialogStatus = "closed" | "opening" | "open" | "closing";

    export interface DialogOptions {
        modal?: boolean;
        closeOnEscape?: boolean;
        closeOnOutsideClick?: boolean;
        initiallyOpen?: boolean;
        onChange?: (open: boolean, reason?: string) => void;
    }

    export interface DialogInstance {
        open: ReactiveAccessor<boolean>;
        status: ReactiveAccessor<DialogStatus>;
        setOpen(open: boolean, reason?: string): void;
        toggle(reason?: string): void;
        attachTrigger(el: Element): OffFn;
        attachContent(el: Element): OffFn;
        attachOverlay(el: Element): OffFn;
        attachClose(el: Element): OffFn;
        attachInside(el: Element): OffFn;
        attachTitle(el: Element): OffFn;
        attachDescription(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createDialog(opts?: DialogOptions): DialogInstance;
}
declare module "@zakkster/lite-headless/dialog/element" {}

// =============================================================================
// popover
// =============================================================================

declare module "@zakkster/lite-headless/popover" {
    export type PopoverSide = "top" | "right" | "bottom" | "left";
    export type PopoverAlign = "start" | "center" | "end";
    export type PopoverStatus = "closed" | "opening" | "open" | "closing";

    export interface PopoverOptions {
        side?: PopoverSide;
        align?: PopoverAlign;
        offset?: number;
        flip?: boolean;
        shift?: boolean;
        closeOnEscape?: boolean;
        closeOnOutsideClick?: boolean;
        trapFocus?: boolean;
        onChange?: (open: boolean, reason?: string) => void;
    }

    export interface PopoverInstance {
        open: ReactiveAccessor<boolean>;
        status: ReactiveAccessor<PopoverStatus>;
        setOpen(open: boolean, reason?: string): void;
        toggle(reason?: string): void;
        attachTrigger(el: Element): OffFn;
        attachAnchor(el: Element): OffFn;
        attachContent(el: Element): OffFn;
        attachArrow(el: Element): OffFn;
        attachClose(el: Element): OffFn;
        attachInside(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createPopover(opts?: PopoverOptions): PopoverInstance;
}
declare module "@zakkster/lite-headless/popover/element" {}

// =============================================================================
// tooltip
// =============================================================================

declare module "@zakkster/lite-headless/tooltip" {
    export type TooltipStatus = "closed" | "opening" | "open" | "closing";

    export interface TooltipOptions {
        side?: "top" | "right" | "bottom" | "left";
        align?: "start" | "center" | "end";
        offset?: number;
        flip?: boolean;
        delay?: number | { open?: number; close?: number };
        onChange?: (open: boolean, reason?: string) => void;
    }

    export interface TooltipInstance {
        open: ReactiveAccessor<boolean>;
        status: ReactiveAccessor<TooltipStatus>;
        setOpen(open: boolean, reason?: string): void;
        toggle(reason?: string): void;
        attachTrigger(el: Element): OffFn;
        attachAnchor(el: Element): OffFn;
        attachContent(el: Element): OffFn;
        attachArrow(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createTooltip(opts?: TooltipOptions): TooltipInstance;
}
declare module "@zakkster/lite-headless/tooltip/element" {}

// =============================================================================
// drawer
// =============================================================================

declare module "@zakkster/lite-headless/drawer" {
    export type DrawerSide = "left" | "right" | "top" | "bottom";
    export type DrawerStatus = "closed" | "opening" | "open" | "closing";

    export interface DrawerOptions {
        side?: DrawerSide;
        modal?: boolean;
        closeOnEscape?: boolean;
        closeOnOutsideClick?: boolean;
        trapFocus?: boolean;
        onChange?: (open: boolean, reason?: string) => void;
    }

    export interface DrawerInstance {
        // reactive
        open: ReactiveAccessor<boolean>;
        status: ReactiveAccessor<DrawerStatus>;
        side: ReactiveAccessor<DrawerSide>;
        // mutations
        setOpen(open: boolean, reason?: string): void;
        show(): void;
        hide(): void;
        setSide(side: DrawerSide): void;
        // attach
        attachContent(el: Element): OffFn;
        attachBackdrop(el: Element): OffFn;
        attachTrigger(el: Element): OffFn;
        attachCloseButton(el: Element): OffFn;
        attachTitle(el: Element): OffFn;
        attachDescription(el: Element): OffFn;
        // lifecycle
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createDrawer(opts?: DrawerOptions): DrawerInstance;
}
declare module "@zakkster/lite-headless/drawer/element" {}

// =============================================================================
// combobox
// =============================================================================

declare module "@zakkster/lite-headless/combobox" {
    export type ComboboxStatus = "closed" | "opening" | "open" | "closing";

    export interface ComboboxOptions<T = unknown> {
        items?: T[];
        getKey?: (item: T) => string;
        getLabel?: (item: T) => string;
        filter?: (item: T, query: string) => boolean;
        initialValue?: T | null;
        onValueChange?: (value: T | null, reason?: string) => void;
        onOpenChange?: (open: boolean, reason?: string) => void;
    }

    export interface ComboboxInstance<T = unknown> {
        open: ReactiveAccessor<boolean>;
        status: ReactiveAccessor<ComboboxStatus>;
        value: ReactiveAccessor<T | null>;
        setOpen(open: boolean, reason?: string): void;
        toggle(reason?: string): void;
        setValue(value: T | null, reason?: string): void;
        attachTrigger(el: Element): OffFn;
        attachListbox(el: Element): OffFn;
        attachItem(el: Element, item: T): OffFn;
        attachInside(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createCombobox<T = unknown>(opts?: ComboboxOptions<T>): ComboboxInstance<T>;
}
declare module "@zakkster/lite-headless/combobox/element" {}

// =============================================================================
// menu
// =============================================================================

declare module "@zakkster/lite-headless/menu" {
    export type MenuStatus = "closed" | "opening" | "open" | "closing";

    export interface MenuOptions {
        placement?: "top-start" | "top-end" | "bottom-start" | "bottom-end" | "right-start" | "left-start";
        offset?: number;
        closeOnSelect?: boolean;
        onSelect?: (key: string) => void;
    }

    export interface MenuInstance {
        open: ReactiveAccessor<boolean>;
        status: ReactiveAccessor<MenuStatus>;
        setOpen(open: boolean, reason?: string): void;
        toggle(reason?: string): void;
        attachTrigger(el: Element): OffFn;
        attachAnchor(el: Element): OffFn;
        attachContextTarget(el: Element): OffFn;
        attachMenu(el: Element): OffFn;
        attachItem(el: Element, key: string): OffFn;
        attachCheckboxItem(el: Element, key: string): OffFn;
        attachRadioItem(el: Element, key: string, groupKey?: string): OffFn;
        attachSeparator(el: Element): OffFn;
        attachSubmenu(parentItemEl: Element, submenuEl: Element): OffFn;
        attachInside(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createMenu(opts?: MenuOptions): MenuInstance;
}
declare module "@zakkster/lite-headless/menu/element" {}

// =============================================================================
// slider
// =============================================================================

declare module "@zakkster/lite-headless/slider" {
    export interface SliderOptions {
        min?: number;
        max?: number;
        step?: number;
        largeStep?: number;
        value?: number | number[];
        orientation?: "horizontal" | "vertical";
        inverted?: boolean;
        minStepsBetweenThumbs?: number;
        onChange?: (value: number[], reason?: string) => void;
    }

    export interface SliderInstance {
        value: ReactiveAccessor<number[]>;
        setValue(value: number | number[], reason?: string): void;
        setDisabled(disabled: boolean): void;
        // metadata accessors
        readonly min: number;
        readonly max: number;
        readonly step: number;
        readonly largeStep: number;
        readonly orientation: "horizontal" | "vertical";
        readonly inverted: boolean;
        readonly thumbCount: number;
        // attach
        attachTrack(el: Element): OffFn;
        attachRange(el: Element): OffFn;
        attachThumb(el: Element, index?: number): OffFn;
        attachLabel(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createSlider(opts?: SliderOptions): SliderInstance;
}
declare module "@zakkster/lite-headless/slider/element" {}

// =============================================================================
// datepicker
// =============================================================================

declare module "@zakkster/lite-headless/datepicker" {
    export type DatePickerView = "days" | "months" | "years";
    export type DatePickerMode = "single" | "range";

    export interface DatePickerOptions {
        value?: Date | null;
        mode?: DatePickerMode;
        min?: Date;
        max?: Date;
        weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
        view?: DatePickerView;
        onChange?: (value: Date | null, reason?: string) => void;
    }

    export interface DatePickerInstance {
        // reactive
        value: ReactiveAccessor<Date | null>;
        viewMonth: ReactiveAccessor<Date>;
        focusedDate: ReactiveAccessor<Date | null>;
        hoverDate: ReactiveAccessor<Date | null>;
        view: ReactiveAccessor<DatePickerView>;
        // mutations
        setValue(value: Date | null, reason?: string): void;
        setView(view: DatePickerView): void;
        cycleView(): void;
        // navigation
        goToPrevMonth(): void;
        goToNextMonth(): void;
        goToMonth(date: Date): void;
        // grid helpers
        getDaysInView(monthDate?: Date): Date[];
        getMonthsInView(yearAnchor?: Date): number[];
        getYearsInView(yearAnchor?: Date): number[];
        readonly weekStartsOn: number;
        readonly mode: DatePickerMode;
        // attach
        attachGrid(el: Element): OffFn;
        attachGridContainer(el: Element): OffFn;
        attachDay(el: Element, date: Date): OffFn;
        attachMonth(el: Element, month: number): OffFn;
        attachYear(el: Element, year: number): OffFn;
        attachPrevMonth(el: Element): OffFn;
        attachNextMonth(el: Element): OffFn;
        attachMonthLabel(el: Element): OffFn;
        // lifecycle
        destroy(): void;
        readonly destroyed: boolean;
        // metadata
        readonly minDate: Date | null;
        readonly maxDate: Date | null;
    }

    export function createDatePicker(opts?: DatePickerOptions): DatePickerInstance;
}
declare module "@zakkster/lite-headless/datepicker/element" {}

// =============================================================================
// split-panels
// =============================================================================

declare module "@zakkster/lite-headless/split-panels" {
    export interface SplitPanelsOptions {
        orientation?: "horizontal" | "vertical";
        layout?: number[];                  // initial sizes
        minSizes?: number[];
        maxSizes?: number[];
        collapsible?: boolean[];
        snapPoints?: number[][];
        onChange?: (sizes: number[], reason?: string) => void;
    }

    export interface SplitPanelsInstance {
        layout: ReactiveAccessor<number[]>;
        setLayout(sizes: number[], reason?: string): void;
        collapsePanel(index: number): void;
        expandPanel(index: number): void;
        attachContainer(el: Element): OffFn;
        attachPanel(el: Element, index: number): OffFn;
        attachHandle(el: Element, index: number): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createSplitPanels(opts?: SplitPanelsOptions): SplitPanelsInstance;
}
declare module "@zakkster/lite-headless/split-panels/element" {}

// =============================================================================
// stepper / steps
// =============================================================================

declare module "@zakkster/lite-headless/stepper" {
    export interface StepperOptions {
        value?: number;
        min?: number;
        max?: number;
        step?: number;
        format?: (value: number) => string;
        disabled?: boolean;
        onChange?: (value: number, reason?: string) => void;
    }

    export interface StepperInstance {
        value: ReactiveAccessor<number>;
        displayValue: ReactiveAccessor<string>;
        setValue(value: number, reason?: string): void;
        increment(reason?: string): void;
        decrement(reason?: string): void;
        setDisabled(disabled: boolean): void;
        // v0.7.11: dynamic constraints
        setMin(min: number): void;
        setMax(max: number): void;
        setStep(step: number): void;
        min(): number;
        max(): number;
        step(): number;
        // attachments
        attachInput(el: HTMLInputElement): OffFn;
        attachIncrement(el: Element): OffFn;
        attachDecrement(el: Element): OffFn;
        attachReadout(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createStepper(opts?: StepperOptions): StepperInstance;
}
declare module "@zakkster/lite-headless/stepper/element" {}

declare module "@zakkster/lite-headless/steps" {
    export type StepStatus = "pending" | "current" | "complete" | "error";
    export type StepsOrientation = "horizontal" | "vertical";

    export interface StepDefinition {
        id: string;
        key?: string;
        label?: string;
        status?: StepStatus;
    }

    export interface StepsOptions {
        steps: StepDefinition[];
        current?: number;
        orientation?: StepsOrientation;
        allowBack?: boolean;
        onChange?: (currentIndex: number, reason?: string) => void;
    }

    export interface StepsInstance {
        // reactive
        steps: ReactiveAccessor<StepDefinition[]>;
        current: ReactiveAccessor<number>;
        currentStep: ReactiveAccessor<StepDefinition>;
        statusOf(index: number): StepStatus;
        isComplete(): boolean;
        progress(): number;
        // queries (non-reactive)
        getStep(index: number): StepDefinition | null;
        indexOf(id: string): number;
        canNavigateTo(index: number): boolean;
        // mutations
        setSteps(steps: StepDefinition[]): void;
        setCurrent(index: number, reason?: string): void;
        setCurrentById(id: string, reason?: string): void;
        next(reason?: string): void;
        prev(reason?: string): void;
        setStepStatus(index: number, status: StepStatus): void;
        clearAllErrors(): void;
        reset(): void;
        // attach
        attachRoot(el: Element): OffFn;
        attachStep(el: Element, key: string): OffFn;
        attachNextButton(el: Element): OffFn;
        attachPrevButton(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
        readonly orientation: StepsOrientation;
    }

    export function createSteps(opts: StepsOptions): StepsInstance;
}
declare module "@zakkster/lite-headless/steps/element" {}

// =============================================================================
// tabs
// =============================================================================

declare module "@zakkster/lite-headless/tabs" {
    export interface TabsOptions {
        value?: string;
        defaultValue?: string;
        orientation?: "horizontal" | "vertical";
        activationMode?: "automatic" | "manual";
        onChange?: (value: string, reason?: string) => void;
    }

    export interface TabsInstance {
        value: ReactiveAccessor<string>;
        setValue(value: string, reason?: string): void;
        setDisabled(disabled: boolean): void;
        next(reason?: string): void;
        prev(reason?: string): void;
        first(reason?: string): void;
        last(reason?: string): void;
        attachTablist(el: Element): OffFn;
        attachTab(el: Element, value: string): OffFn;
        attachPanel(el: Element, value: string): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createTabs(opts?: TabsOptions): TabsInstance;
}
declare module "@zakkster/lite-headless/tabs/element" {}

// =============================================================================
// accordion
// =============================================================================

declare module "@zakkster/lite-headless/accordion" {
    export interface AccordionOptions {
        type?: "single" | "multiple";
        value?: string | string[];
        collapsible?: boolean;
        onChange?: (value: string | string[], reason?: string) => void;
    }

    export interface AccordionInstance {
        value: ReactiveAccessor<string | string[]>;
        isOpen(key: string): boolean;
        setValue(value: string | string[], reason?: string): void;
        toggle(key: string, reason?: string): void;
        open(key: string, reason?: string): void;
        close(key: string, reason?: string): void;
        setDisabled(disabled: boolean): void;
        focusFirst(): void;
        focusLast(): void;
        focusKey(key: string): void;
        attachRoot(el: Element): OffFn;
        attachItem(el: Element, value: string): OffFn;
        attachTrigger(el: Element, value: string): OffFn;
        attachPanel(el: Element, value: string): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createAccordion(opts?: AccordionOptions): AccordionInstance;
}
declare module "@zakkster/lite-headless/accordion/element" {}

// =============================================================================
// carousel
// =============================================================================

declare module "@zakkster/lite-headless/carousel" {
    export interface CarouselOptions {
        initialIndex?: number;
        loop?: boolean;
        autoplay?: boolean;
        interval?: number;
        scrollBehavior?: "smooth" | "auto";
        onIndexChange?: (index: number, reason?: string) => void;
    }

    export interface CarouselInstance {
        index: ReactiveAccessor<number>;
        playing: ReactiveAccessor<boolean>;
        slideCount(): number;
        isPlaying(): boolean;
        go(index: number, behavior?: "smooth" | "auto"): void;
        next(): void;
        prev(): void;
        first(): void;
        last(): void;
        play(): void;
        pause(): void;
        toggle(): void;
        attachRoot(el: Element): OffFn;
        attachViewport(el: Element): OffFn;
        attachSlide(el: Element, index: number): OffFn;
        attachNext(el: Element): OffFn;
        attachPrev(el: Element): OffFn;
        attachIndicator(el: Element, index: number): OffFn;
        attachPlayPause(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createCarousel(opts?: CarouselOptions): CarouselInstance;
}
declare module "@zakkster/lite-headless/carousel/element" {}

// =============================================================================
// pagination
// =============================================================================

declare module "@zakkster/lite-headless/pagination" {
    export type PaginationItem =
        | { type: "page"; page: number; current: boolean }
        | { type: "ellipsis" };

    export interface PaginationOptions {
        pageCount: number;
        page?: number;
        siblingCount?: number;
        boundaryCount?: number;
        onChange?: (page: number, reason?: string) => void;
    }

    export interface PaginationInstance {
        page: ReactiveAccessor<number>;
        pageCount: ReactiveAccessor<number>;
        items: ReactiveAccessor<PaginationItem[]>;
        setPage(page: number, reason?: string): void;
        setPageCount(count: number): void;
        first(): void;
        last(): void;
        next(): void;
        prev(): void;
        attachRoot(el: Element): OffFn;
        attachPrev(el: Element): OffFn;
        attachNext(el: Element): OffFn;
        attachFirst(el: Element): OffFn;
        attachLast(el: Element): OffFn;
        attachPageList(el: Element): OffFn;
        markPage(el: Element, page: number): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createPagination(opts: PaginationOptions): PaginationInstance;
}
declare module "@zakkster/lite-headless/pagination/element" {}

// =============================================================================
// rating
// =============================================================================

declare module "@zakkster/lite-headless/rating" {
    export interface RatingOptions {
        value?: number;
        max?: number;
        step?: number;
        readOnly?: boolean;
        allowHalf?: boolean;
        onChange?: (value: number, reason?: string) => void;
    }

    export interface RatingInstance {
        // reactive
        value: ReactiveAccessor<number>;
        hoverValue: ReactiveAccessor<number>;
        displayValue: ReactiveAccessor<number>;
        isReadOnly: ReactiveAccessor<boolean>;
        // mutations
        setValue(value: number, reason?: string): void;
        setHoverValue(value: number): void;
        clear(reason?: string): void;
        setReadOnly(readOnly: boolean): void;
        // attach
        attachRoot(el: Element): OffFn;
        attachItem(el: Element, index: number): OffFn;
        attachRail(el: Element): OffFn;
        // lifecycle
        destroy(): void;
        readonly destroyed: boolean;
        readonly max: number;
        readonly step: number;
    }

    export function createRating(opts?: RatingOptions): RatingInstance;
}
declare module "@zakkster/lite-headless/rating/element" {}

// =============================================================================
// switch
// =============================================================================

declare module "@zakkster/lite-headless/switch" {
    export interface SwitchOptions {
        checked?: boolean;
        disabled?: boolean;
        onChange?: (checked: boolean, reason?: string) => void;
    }

    export interface SwitchInstance {
        isChecked: ReactiveAccessor<boolean>;
        disabled: ReactiveAccessor<boolean>;
        setChecked(checked: boolean, reason?: string): void;
        setDisabled(disabled: boolean): void;
        toggle(reason?: string): void;
        attachRoot(el: Element): OffFn;
        attachLabel(el: Element): OffFn;
        attachThumb(el: Element): OffFn;
        attachInput(el: HTMLInputElement): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createSwitch(opts?: SwitchOptions): SwitchInstance;
}
declare module "@zakkster/lite-headless/switch/element" {}

// =============================================================================
// toggle-group
// =============================================================================

declare module "@zakkster/lite-headless/toggle-group" {
    export type ToggleGroupType = "single" | "multiple";
    export type ToggleGroupOrientation = "horizontal" | "vertical";

    export interface ToggleGroupItem { key: string; disabled: boolean }

    export interface ToggleGroupOptions {
        type?: ToggleGroupType;
        value?: string | string[];
        disabled?: boolean;
        orientation?: ToggleGroupOrientation;
        onChange?: (value: string | string[], reason?: string) => void;
    }

    export interface ToggleGroupInstance {
        value: ReactiveAccessor<string | string[]>;
        disabled: ReactiveAccessor<boolean>;
        contains(key: string): boolean;
        items: ReactiveAccessor<ToggleGroupItem[]>;
        setValue(value: string | string[], reason?: string): void;
        setDisabled(disabled: boolean): void;
        setItemDisabled(key: string, disabled: boolean): void;
        toggleItem(key: string, reason?: string): void;
        attachRoot(el: Element): OffFn;
        attachItem(el: Element, key: string): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
        readonly type: ToggleGroupType;
        readonly orientation: ToggleGroupOrientation;
    }

    export function createToggleGroup(opts?: ToggleGroupOptions): ToggleGroupInstance;
}
declare module "@zakkster/lite-headless/toggle-group/element" {}

// =============================================================================
// radio-group
// =============================================================================

declare module "@zakkster/lite-headless/radio-group" {
    export interface RadioGroupOptions {
        value?: string;
        disabled?: boolean;
        onChange?: (value: string, reason?: string) => void;
    }

    export interface RadioGroupInstance {
        value: ReactiveAccessor<string>;
        isDisabled: ReactiveAccessor<boolean>;
        readonly checkedKey: string;
        readonly itemCount: number;
        setValue(value: string, reason?: string): void;
        setDisabled(disabled: boolean): void;
        setItemDisabled(key: string, disabled: boolean): void;
        attachRoot(el: Element): OffFn;
        attachItem(el: Element, value: string): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createRadioGroup(opts?: RadioGroupOptions): RadioGroupInstance;
}
declare module "@zakkster/lite-headless/radio-group/element" {}

// =============================================================================
// meter / progress
// =============================================================================

declare module "@zakkster/lite-headless/meter" {
    export type MeterState = "low" | "optimum" | "high" | "sub-optimum" | "sub-high";

    export interface MeterOptions {
        value?: number;
        min?: number;
        max?: number;
        low?: number;
        high?: number;
        optimum?: number;
    }

    export interface MeterInstance {
        value: ReactiveAccessor<number>;
        min: ReactiveAccessor<number>;
        max: ReactiveAccessor<number>;
        fraction: ReactiveAccessor<number>;
        state: ReactiveAccessor<MeterState>;
        setValue(value: number): void;
        setValueText(text: string): void;
        attachRoot(el: Element): OffFn;
        attachFill(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createMeter(opts?: MeterOptions): MeterInstance;
}
declare module "@zakkster/lite-headless/meter/element" {}

declare module "@zakkster/lite-headless/progress" {
    export type ProgressVariant = "determinate" | "indeterminate";

    export interface ProgressOptions {
        value?: number | null;
        min?: number;
        max?: number;
        variant?: ProgressVariant;
    }

    export interface ProgressInstance {
        value: ReactiveAccessor<number | null>;
        min: ReactiveAccessor<number>;
        max: ReactiveAccessor<number>;
        indeterminate: ReactiveAccessor<boolean>;
        fraction: ReactiveAccessor<number>;
        isComplete: ReactiveAccessor<boolean>;
        variant: ReactiveAccessor<ProgressVariant>;
        setValue(value: number | null): void;
        setMin(min: number): void;
        setMax(max: number): void;
        setIndeterminate(indeterminate: boolean): void;
        setValueText(text: string): void;
        attachRoot(el: Element): OffFn;
        attachBar(el: Element): OffFn;
        attachIndicator(el: Element): OffFn;
        attachLabel(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createProgress(opts?: ProgressOptions): ProgressInstance;
}
declare module "@zakkster/lite-headless/progress/element" {}

// =============================================================================
// button
// =============================================================================

declare module "@zakkster/lite-headless/button" {
    export interface ButtonOptions {
        toggle?: boolean;
        pressed?: boolean;
        disabled?: boolean;
        loading?: boolean;
        onPress?: (reason?: string) => void;
    }

    export interface ButtonInstance {
        isPressed: ReactiveAccessor<boolean>;
        isLoading: ReactiveAccessor<boolean>;
        isDisabled: ReactiveAccessor<boolean>;
        canPress: ReactiveAccessor<boolean>;
        readonly toggle: boolean;   // whether the button is in toggle mode
        setPressed(pressed: boolean, reason?: string): void;
        setLoading(loading: boolean): void;
        setDisabled(disabled: boolean): void;
        runAsync<T>(promise: Promise<T>): Promise<T>;
        attachRoot(el: HTMLButtonElement): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createButton(opts?: ButtonOptions): ButtonInstance;
}
declare module "@zakkster/lite-headless/button/element" {}

// =============================================================================
// card
// =============================================================================

declare module "@zakkster/lite-headless/card" {
    export interface CardOptions {
        collapsible?: boolean;
        dismissible?: boolean;
        defaultCollapsed?: boolean;
        onCollapseChange?: (collapsed: boolean, reason?: string) => void;
        onDismiss?: (reason?: string) => void;
    }

    export interface CardInstance {
        isCollapsed(): boolean;
        isDismissed(): boolean;
        readonly collapsible: boolean;
        readonly dismissible: boolean;
        setCollapsed(collapsed: boolean, reason?: string): void;
        toggle(reason?: string): void;
        dismiss(reason?: string): void;
        reopen(): void;
        attachRoot(el: Element): OffFn;
        attachBody(el: Element): OffFn;
        attachCollapseTrigger(el: Element): OffFn;
        attachDismissButton(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createCard(opts?: CardOptions): CardInstance;
}
declare module "@zakkster/lite-headless/card/element" {}

// =============================================================================
// tag
// =============================================================================

declare module "@zakkster/lite-headless/tag" {
    export type TagIntent = "default" | "primary" | "success" | "info" | "warning" | "danger";

    export interface TagOptions {
        intent?: TagIntent;
        closable?: boolean;
        onClose?: (reason?: string) => void;
    }

    export interface TagInstance {
        intent: ReactiveAccessor<TagIntent>;
        isRemoved(): boolean;
        readonly closable: boolean;
        setIntent(intent: TagIntent): void;
        close(reason?: string): void;
        reset(): void;
        attachRoot(el: Element): OffFn;
        attachCloseButton(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createTag(opts?: TagOptions): TagInstance;
}
declare module "@zakkster/lite-headless/tag/element" {}

// =============================================================================
// badge
// =============================================================================

declare module "@zakkster/lite-headless/badge" {
    export type BadgeIntent = "default" | "primary" | "success" | "info" | "warning" | "danger";

    export interface BadgeOptions {
        count?: number;
        max?: number;
        dot?: boolean;
        intent?: BadgeIntent;
    }

    export interface BadgeInstance {
        count: ReactiveAccessor<number>;
        displayed: ReactiveAccessor<string>;     // formatted count (e.g. "99+")
        readonly isDot: boolean;
        readonly max: number;
        readonly intent: BadgeIntent;
        setCount(count: number): void;
        increment(): void;
        decrement(): void;
        reset(): void;
        attachRoot(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createBadge(opts?: BadgeOptions): BadgeInstance;
}
declare module "@zakkster/lite-headless/badge/element" {}

// =============================================================================
// timeline
// =============================================================================

declare module "@zakkster/lite-headless/timeline" {
    export type TimelineItemType = "default" | "success" | "info" | "warning" | "danger";

    export interface TimelineOptions {}

    export interface TimelineInstance {
        readonly itemCount: number;
        attachRoot(el: Element): OffFn;
        attachItem(el: Element, type?: TimelineItemType): OffFn;
        setItemType(el: Element, type: TimelineItemType): void;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createTimeline(opts?: TimelineOptions): TimelineInstance;
}
declare module "@zakkster/lite-headless/timeline/element" {}

// =============================================================================
// descriptions
// =============================================================================

declare module "@zakkster/lite-headless/descriptions" {
    export interface DescriptionsOptions {
        columns?: 1 | 2 | 3 | 4;
        bordered?: boolean;
    }

    export interface DescriptionsInstance {
        readonly columns: number;
        readonly bordered: boolean;
        attachRoot(el: Element): OffFn;
        attachItem(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createDescriptions(opts?: DescriptionsOptions): DescriptionsInstance;
}
declare module "@zakkster/lite-headless/descriptions/element" {}

// =============================================================================
// result
// =============================================================================

declare module "@zakkster/lite-headless/result" {
    export type ResultStatus = "success" | "error" | "warning" | "info" | "empty" | "404" | "403" | "500";

    export interface ResultOptions {
        status?: ResultStatus;
    }

    export interface ResultInstance {
        readonly status: ResultStatus;
        attachRoot(el: Element): OffFn;
        attachIcon(el: Element): OffFn;
        attachTitle(el: Element): OffFn;
        attachSubtitle(el: Element): OffFn;
        attachActions(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createResult(opts?: ResultOptions): ResultInstance;
}
declare module "@zakkster/lite-headless/result/element" {}

// =============================================================================
// banner
// =============================================================================

declare module "@zakkster/lite-headless/banner" {
    export type BannerKind = "info" | "success" | "warning" | "error";

    export interface BannerOptions {
        kind?: BannerKind;
        open?: boolean;
        dismissible?: boolean;
        onDismiss?: () => void;
    }

    export interface BannerInstance {
        isOpen: ReactiveAccessor<boolean>;
        kind: ReactiveAccessor<BannerKind>;
        setOpen(open: boolean, reason?: string): void;
        show(reason?: string): void;
        dismiss(reason?: string): void;
        setKind(kind: BannerKind): void;
        attachRoot(el: Element): OffFn;
        attachDismissButton(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createBanner(opts?: BannerOptions): BannerInstance;
}
declare module "@zakkster/lite-headless/banner/element" {}

// =============================================================================
// empty-state
// =============================================================================

declare module "@zakkster/lite-headless/empty-state" {
    export type EmptyStateVariant = "default" | "search" | "error";

    export interface EmptyStateOptions {
        variant?: EmptyStateVariant;
    }

    export interface EmptyStateInstance {
        variant: ReactiveAccessor<EmptyStateVariant>;
        setVariant(variant: EmptyStateVariant): void;
        attachRoot(el: Element): OffFn;
        attachTitle(el: Element): OffFn;
        attachDescription(el: Element): OffFn;
        attachIcon(el: Element): OffFn;
        attachActions(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createEmptyState(opts?: EmptyStateOptions): EmptyStateInstance;
}
declare module "@zakkster/lite-headless/empty-state/element" {}

// =============================================================================
// skeleton
// =============================================================================

declare module "@zakkster/lite-headless/skeleton" {
    export interface SkeletonOptions {
        ready?: boolean;
        pendingSources?: string[];
        onReadyChange?: (ready: boolean) => void;
    }

    export interface SkeletonInstance {
        ready: ReactiveAccessor<boolean>;
        pendingSources: ReactiveAccessor<string[]>;
        isResolved(source: string): boolean;
        setReady(ready: boolean): void;
        reveal(): void;
        conceal(): void;
        resolve(source: string): void;
        reset(): void;
        attachRoot(el: Element): OffFn;
        attachPlaceholder(el: Element): OffFn;
        attachContent(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createSkeleton(opts?: SkeletonOptions): SkeletonInstance;
}
declare module "@zakkster/lite-headless/skeleton/element" {}

// =============================================================================
// avatar
// =============================================================================

declare module "@zakkster/lite-headless/avatar" {
    export type AvatarState = "idle" | "loading" | "loaded" | "error" | "fallback";

    export interface AvatarOptions {
        src?: string;
        name?: string;
        alt?: string;
    }

    export interface AvatarInstance {
        state: ReactiveAccessor<AvatarState>;
        initials: ReactiveAccessor<string>;
        colorHash: ReactiveAccessor<number>;
        setSrc(src: string): void;
        attachRoot(el: Element): OffFn;
        attachImage(el: HTMLImageElement): OffFn;
        attachFallback(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createAvatar(opts?: AvatarOptions): AvatarInstance;
}
declare module "@zakkster/lite-headless/avatar/element" {}

// =============================================================================
// breadcrumb
// =============================================================================

declare module "@zakkster/lite-headless/breadcrumb" {
    export interface BreadcrumbItem { key: string; current: boolean }

    export interface BreadcrumbOptions {
        currentKey?: string;
        onItemClick?: (key: string, index: number) => void;
    }

    export interface BreadcrumbInstance {
        items: ReactiveAccessor<BreadcrumbItem[]>;
        currentKey: ReactiveAccessor<string | null>;
        setCurrent(key: string): void;
        attachRoot(el: Element): OffFn;
        attachList(el: Element): OffFn;
        attachItem(el: Element, key: string): OffFn;
        attachSeparator(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createBreadcrumb(opts?: BreadcrumbOptions): BreadcrumbInstance;
}
declare module "@zakkster/lite-headless/breadcrumb/element" {}

// =============================================================================
// picture
// =============================================================================

declare module "@zakkster/lite-headless/picture" {
    export type PictureState = "idle" | "loading" | "loaded" | "error";

    export interface PictureSource {
        src: string;
        type?: string;
        media?: string;
        minWidth?: number;
        maxWidth?: number;
    }

    export interface PictureOptions {
        src: string;   // required
        sources?: PictureSource[];
        placeholder?: string | null;
        lazy?: boolean;
        eager?: boolean;
        aspectRatio?: string | null;
        containerSources?: PictureSource[] | null;
        maxRetries?: number;
        rootMargin?: string;
        onStateChange?: (state: PictureState) => void;
        onLoad?: () => void;
        onError?: (err?: unknown) => void;
    }

    export interface PictureInstance {
        state: ReactiveAccessor<PictureState>;
        retry(): void;
        setSrc(next: string): void;
        attachRoot(el: Element): OffFn;
        attachImg(el: HTMLImageElement): OffFn;
        destroy(): void;
        readonly src: string;
        readonly activeSrc: string | null;
        readonly destroyed: boolean;
    }

    export function createPicture(opts: PictureOptions): PictureInstance;
}
declare module "@zakkster/lite-headless/picture/element" {}

// =============================================================================
// stat
// =============================================================================

declare module "@zakkster/lite-headless/stat" {
    export type StatTrend = "up" | "down" | "flat";

    export interface StatOptions {
        value?: number;
        label?: string;
        unit?: string;
        format?: (value: number) => string;
        animateOnChange?: boolean;
        tweenDuration?: number;
    }

    export interface StatInstance {
        value: ReactiveAccessor<number>;
        displayValue: ReactiveAccessor<number>;
        label: ReactiveAccessor<string>;
        unit: ReactiveAccessor<string>;
        trend: ReactiveAccessor<StatTrend>;
        setValue(value: number): void;
        setLabel(label: string): void;
        setUnit(unit: string): void;
        setTrend(trend: StatTrend): void;
        attachRoot(el: Element): OffFn;
        attachLabel(el: Element): OffFn;
        attachValue(el: Element): OffFn;
        attachUnit(el: Element): OffFn;
        attachTrend(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createStat(opts?: StatOptions): StatInstance;
}
declare module "@zakkster/lite-headless/stat/element" {}

// =============================================================================
// calendar
// =============================================================================

declare module "@zakkster/lite-headless/calendar" {
    export type CalendarView = "month" | "week" | "day";

    export interface CalendarEvent {
        id?: string;
        date: Date | string;
        title?: string;
        [key: string]: unknown;
    }

    export interface CalendarOptions {
        view?: CalendarView;
        selectedDate?: Date | null;
        events?: CalendarEvent[];
        weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
        onSelectionChange?: (date: Date | null) => void;
    }

    export interface CalendarInstance {
        // reactive
        view: ReactiveAccessor<CalendarView>;
        events: ReactiveAccessor<CalendarEvent[]>;
        selectedDate: ReactiveAccessor<Date | null>;
        // mutations
        setView(view: CalendarView): void;
        setSelectedDate(date: Date | null): void;
        setEvents(events: CalendarEvent[]): void;
        addEvent(event: CalendarEvent): void;
        removeEvent(id: string): void;
        updateEvent(id: string, patch: Partial<CalendarEvent>): void;
        // navigation
        goToPrevMonth(): void;
        goToNextMonth(): void;
        goToToday(): void;
        // queries
        eventsForDay(date: Date): CalendarEvent[];
        getEvent(id: string): CalendarEvent | null;
        getDaysInView(): Date[];
        readonly weekStartsOn: number;
        // attach
        attachRoot(el: Element): OffFn;
        attachGrid(el: Element): OffFn;
        attachMonthLabel(el: Element): OffFn;
        attachPrevMonth(el: Element): OffFn;
        attachNextMonth(el: Element): OffFn;
        attachDayCell(el: Element, date: Date): OffFn;
        attachEvent(el: Element, eventId: string): OffFn;
        // lifecycle
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createCalendar(opts?: CalendarOptions): CalendarInstance;
}
declare module "@zakkster/lite-headless/calendar/element" {}

// =============================================================================
// kanban
// =============================================================================

declare module "@zakkster/lite-headless/kanban" {
    export interface KanbanColumn { id: string; title?: string }
    export interface KanbanCard { id: string; column: string; [key: string]: unknown }

    export interface KanbanOptions {
        columns?: KanbanColumn[];
        cards?: KanbanCard[];
        inColumnSortable?: boolean;
        enableHtml5Dnd?: boolean;
        onChange?: (cards: KanbanCard[], reason?: string) => void;
    }

    export interface KanbanInstance {
        // reactive
        columns: ReactiveAccessor<KanbanColumn[]>;
        cards: ReactiveAccessor<KanbanCard[]>;
        cardsInColumn(columnId: string): KanbanCard[];
        cardsInColumnReactive(columnId: string): ReactiveAccessor<KanbanCard[]>;
        // queries
        getCard(id: string): KanbanCard | null;
        getColumn(id: string): KanbanColumn | null;
        // mutations
        addColumn(col: KanbanColumn): void;
        removeColumn(id: string): void;
        addCard(card: KanbanCard): void;
        removeCard(id: string): void;
        updateCard(id: string, patch: Partial<KanbanCard>): void;
        moveCard(cardId: string, toColumn: string, toIndex?: number, reason?: string): void;
        // attach
        attachColumn(el: Element, columnId: string): OffFn;
        attachCard(el: Element, cardId: string): OffFn;
        attachHandle(el: Element, cardId: string): OffFn;
        attachDropZone(el: Element, columnId: string): OffFn;
        attachDraggable(el: Element, cardId: string): OffFn;
        // lifecycle
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createKanban(opts?: KanbanOptions): KanbanInstance;
}
declare module "@zakkster/lite-headless/kanban/element" {}

// =============================================================================
// sortable
// =============================================================================

declare module "@zakkster/lite-headless/sortable" {
    export type SortableOrientation = "vertical" | "horizontal";

    export interface SortableItem { key: string; disabled: boolean }

    export interface SortableOptions {
        orientation?: SortableOrientation;
        disabled?: boolean;
        onChange?: (order: string[], reason?: string) => void;
    }

    export interface SortableInstance {
        // reactive
        order: ReactiveAccessor<string[]>;
        items: ReactiveAccessor<SortableItem[]>;
        dragging: ReactiveAccessor<string | null>;
        grabbed: ReactiveAccessor<string | null>;
        // imperative
        move(from: number, to: number, reason?: string): void;
        swap(fromKey: string, toKey: string, reason?: string): void;
        setOrder(order: string[], reason?: string): void;
        insertAt(key: string, index: number): void;
        removeKey(key: string): void;
        setDisabled(disabled: boolean): void;
        setItemDisabled(key: string, disabled: boolean): void;
        isDragging(): boolean;
        dragKey(): string | null;
        // attach
        attachRoot(el: Element): OffFn;
        attachItem(el: Element, key: string): OffFn;
        attachHandle(el: Element, key: string): OffFn;
        // lifecycle
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createSortable(opts?: SortableOptions): SortableInstance;
}
declare module "@zakkster/lite-headless/sortable/element" {}

// =============================================================================
// tree
// =============================================================================

declare module "@zakkster/lite-headless/tree" {
    export interface TreeNode {
        key: string;
        label?: string;
        children?: TreeNode[];
        disabled?: boolean;
        [key: string]: unknown;
    }

    export interface TreeOptions {
        nodes: TreeNode[];
        expanded?: string[];
        selected?: string | null;
        disabled?: boolean;
        onSelect?: (key: string | null, reason?: string) => void;
        onExpand?: (keys: string[], reason?: string) => void;
    }

    export interface TreeInstance {
        // signals
        selected: ReactiveAccessor<string | null>;
        expanded: ReactiveAccessor<string[]>;
        isSelected(key: string): boolean;
        isExpanded(key: string): boolean;
        isVisible(key: string): boolean;
        hasChildren(key: string): boolean;
        // mutations
        setSelected(key: string | null, reason?: string): void;
        setExpanded(keys: string[]): void;
        select(key: string, reason?: string): void;
        deselect(reason?: string): void;
        toggleSelected(key: string, reason?: string): void;
        expand(key: string): void;
        collapse(key: string): void;
        toggleExpanded(key: string): void;
        expandAll(): void;
        collapseAll(): void;
        setDisabled(disabled: boolean): void;
        // navigation
        focusKey(key: string): void;
        // attach
        attachRoot(el: Element): OffFn;
        attachNode(el: Element, key: string): OffFn;
        attachLabel(el: Element, key: string): OffFn;
        // lifecycle
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createTree(opts: TreeOptions): TreeInstance;
}
declare module "@zakkster/lite-headless/tree/element" {}

// =============================================================================
// toolbar
// =============================================================================

declare module "@zakkster/lite-headless/toolbar" {
    export interface ToolbarOptions {
        orientation?: "horizontal" | "vertical";
    }

    export interface ToolbarInstance {
        attachRoot(el: Element): OffFn;
        attachItem(el: Element, key?: string): OffFn;
        attachSeparator(el: Element): OffFn;
        attachGroup(el: Element): OffFn;
        setItemDisabled(key: string, disabled: boolean): void;
        focusFirst(): void;
        focusLast(): void;
        focusItem(key: string): void;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createToolbar(opts?: ToolbarOptions): ToolbarInstance;
}
declare module "@zakkster/lite-headless/toolbar/element" {}

// =============================================================================
// color-picker
// =============================================================================

declare module "@zakkster/lite-headless/color-picker" {
    export interface RGB { r: number; g: number; b: number; a: number }
    export interface HSL { h: number; s: number; l: number; a: number }
    export interface HSV { h: number; s: number; v: number; a: number }
    export interface OKLCH { l: number; c: number; h: number; a: number }

    export interface ColorPickerOptions {
        value?: string;                  // hex, rgb(), hsl() — parsed at construction
        alpha?: number;
        onChange?: (hex: string, reason?: string) => void;
    }

    export interface ColorPickerInstance {
        // reactive accessors
        hue: ReactiveAccessor<number>;
        saturation: ReactiveAccessor<number>;
        brightness: ReactiveAccessor<number>;
        alpha: ReactiveAccessor<number>;
        hsv: ReactiveAccessor<HSV>;
        rgb: ReactiveAccessor<RGB>;
        hex: ReactiveAccessor<string>;
        hsl: ReactiveAccessor<HSL>;
        oklch: ReactiveAccessor<OKLCH>;
        // mutations
        setHue(h: number, reason?: string): void;
        setSaturation(s: number, reason?: string): void;
        setBrightness(v: number, reason?: string): void;
        setAlpha(a: number, reason?: string): void;
        setHsv(hsv: Partial<HSV>, reason?: string): void;
        setRgb(rgb: Partial<RGB>, reason?: string): void;
        setHex(hex: string, reason?: string): void;
        setOklch(oklch: Partial<OKLCH>, reason?: string): void;
        // attach helpers
        attachRoot(el: Element): OffFn;
        attachArea(el: Element): OffFn;
        attachAreaHandle(el: Element): OffFn;
        attachHueSlider(el: Element): OffFn;
        attachHueHandle(el: Element): OffFn;
        attachAlphaSlider(el: Element): OffFn;
        attachAlphaHandle(el: Element): OffFn;
        attachSwatch(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createColorPicker(opts?: ColorPickerOptions): ColorPickerInstance;
}
declare module "@zakkster/lite-headless/color-picker/element" {}

// =============================================================================
// command-palette
// =============================================================================

declare module "@zakkster/lite-headless/command-palette" {
    export interface Command {
        id: string;
        label: string;
        action?: () => void;
        keywords?: string[];
        when?: () => boolean;
        section?: string;
    }

    export interface CommandResult {
        id: string;
        command: Command;
        score: number;
        matches: Array<[number, number]>;
    }

    export interface CommandPaletteOptions {
        commands?: Command[];
        shortcut?: string;
        maxResults?: number;
    }

    export interface CommandPaletteInstance {
        // reactive
        isOpen: ReactiveAccessor<boolean>;
        query: ReactiveAccessor<string>;
        results: ReactiveAccessor<CommandResult[]>;
        activeIndex: ReactiveAccessor<number>;
        // command registry
        register(command: Command): void;
        unregister(id: string): void;
        clear(): void;
        clearRecents(): void;
        commands(): Command[];
        recents(): string[];
        refresh(): void;
        // imperative
        open(reason?: string): void;
        close(reason?: string): void;
        toggle(reason?: string): void;
        setQuery(query: string): void;
        invoke(id: string): void;
        invokeActive(): void;
        setActive(index: number): void;
        next(): void;
        prev(): void;
        // attach
        attachInput(el: HTMLInputElement): OffFn;
        attachList(el: Element): OffFn;
        attachEmpty(el: Element): OffFn;
        markItem(el: Element, id: string): OffFn;
        // lifecycle
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createCommandPalette(opts?: CommandPaletteOptions): CommandPaletteInstance;
}
declare module "@zakkster/lite-headless/command-palette/element" {}

// =============================================================================
// file-upload
// =============================================================================

declare module "@zakkster/lite-headless/file-upload" {
    export type FileEntryStatus = "queued" | "uploading" | "done" | "error" | "aborted";

    export interface FileEntry {
        id: string;
        file: File;
        status: FileEntryStatus;
        progress: ReactiveAccessor<number>;
        bytesLoaded: ReactiveAccessor<number>;
        bytesTotal: number;
        error: string | null;
    }

    export interface FileUploadOptions {
        multiple?: boolean;
        accept?: string;
        maxSize?: number;
        maxFiles?: number;
        upload?: (entry: FileEntry, signal?: AbortSignal) => Promise<void>;
        validate?: (file: File) => boolean | string;
        onAdd?: (entry: FileEntry) => void;
        onReject?: (file: File, reason: string) => void;
    }

    export interface FileUploadInstance {
        // reactive
        entries: ReactiveAccessor<FileEntry[]>;
        isDragOver: ReactiveAccessor<boolean>;
        totalProgress: ReactiveAccessor<number>;
        pendingCount: ReactiveAccessor<number>;
        // mutations
        addFiles(files: File[] | FileList): void;
        removeEntry(id: string): void;
        retry(id: string): void;
        clear(): void;
        abort(id: string): void;
        uploadAll(): Promise<void>;
        // attach
        attachDropZone(el: Element): OffFn;
        attachInput(el: HTMLInputElement): OffFn;
        // lifecycle
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createFileUpload(opts?: FileUploadOptions): FileUploadInstance;
}
declare module "@zakkster/lite-headless/file-upload/element" {}

// =============================================================================
// form-field
// =============================================================================

declare module "@zakkster/lite-headless/form-field" {
    export interface FormFieldOptions {
        valid?: boolean;
        errorMessage?: string;
        required?: boolean;
        touched?: boolean;
    }

    export interface FormFieldInstance {
        valid: ReactiveAccessor<boolean>;
        errorMessage: ReactiveAccessor<string>;
        required: ReactiveAccessor<boolean>;
        touched: ReactiveAccessor<boolean>;
        showsError: ReactiveAccessor<boolean>;
        setValid(valid: boolean, errorMessage?: string): void;
        setRequired(required: boolean): void;
        setTouched(touched: boolean): void;
        reset(): void;
        attachRoot(el: Element): OffFn;
        attachLabel(el: Element): OffFn;
        attachControl(el: HTMLElement): OffFn;
        attachHelperText(el: Element): OffFn;
        attachErrorText(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createFormField(opts?: FormFieldOptions): FormFieldInstance;
}
declare module "@zakkster/lite-headless/form-field/element" {}

// =============================================================================
// inline-edit
// =============================================================================

declare module "@zakkster/lite-headless/inline-edit" {
    export interface InlineEditOptions {
        value?: string;
        placeholder?: string;
        validate?: (s: string) => boolean | string;
        onChange?: (value: string, reason?: string) => void;
    }

    export interface InlineEditInstance {
        value: ReactiveAccessor<string>;
        draftValue: ReactiveAccessor<string>;
        isEditing: ReactiveAccessor<boolean>;
        isInvalid: ReactiveAccessor<boolean>;
        setValue(value: string, reason?: string): void;
        setDraftValue(value: string): void;
        startEdit(): void;
        commit(): void;
        cancel(): void;
        attachRoot(el: Element): OffFn;
        attachDisplay(el: Element): OffFn;
        attachInput(el: HTMLInputElement): OffFn;
        attachTrigger(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createInlineEdit(opts?: InlineEditOptions): InlineEditInstance;
}
declare module "@zakkster/lite-headless/inline-edit/element" {}

// =============================================================================
// notification-center
// =============================================================================

declare module "@zakkster/lite-headless/notification-center" {
    export type NotificationKind = "info" | "success" | "warning" | "error";

    export interface NotificationItem {
        id: string;
        title?: string;
        body?: string;
        kind?: NotificationKind;
        timestamp?: number;
        read?: boolean;
        meta?: Record<string, unknown> | null;
    }

    export interface NotificationFilter {
        kind?: NotificationKind;
        read?: boolean;
    }

    export interface NotificationCenterOptions {
        notifications?: NotificationItem[];
        filter?: NotificationFilter | null;
    }

    export interface NotificationCenterInstance {
        // reactive
        notifications: ReactiveAccessor<NotificationItem[]>;
        visible: ReactiveAccessor<NotificationItem[]>;
        filter: ReactiveAccessor<NotificationFilter | null>;
        unreadCount: ReactiveAccessor<number>;
        // queries
        getNotification(id: string): NotificationItem | null;
        // mutations
        add(notif: NotificationItem): void;
        remove(id: string): void;
        update(id: string, patch: Partial<NotificationItem>): void;
        markRead(id: string): void;
        markUnread(id: string): void;
        markAllRead(): void;
        clearAll(): void;
        clearByKind(kind: NotificationKind): void;
        clearRead(): void;
        setNotifications(notifs: NotificationItem[]): void;
        setFilter(filter: NotificationFilter | null): void;
        clearFilter(): void;
        // attach
        attachRoot(el: Element): OffFn;
        attachItem(el: Element, id: string): OffFn;
        attachUnreadBadge(el: Element): OffFn;
        attachClearAllButton(el: Element): OffFn;
        attachMarkAllReadButton(el: Element): OffFn;
        // lifecycle
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createNotificationCenter(opts?: NotificationCenterOptions): NotificationCenterInstance;
}
declare module "@zakkster/lite-headless/notification-center/element" {}

// =============================================================================
// pin-input
// =============================================================================

declare module "@zakkster/lite-headless/pin-input" {
    export interface PinInputOptions {
        length?: number;
        value?: string;
        type?: "numeric" | "alphanumeric";
        mask?: boolean;
        onChange?: (value: string, reason?: string) => void;
        onComplete?: (value: string) => void;
    }

    export interface PinInputInstance {
        value: ReactiveAccessor<string>;
        isComplete: ReactiveAccessor<boolean>;
        position: ReactiveAccessor<number>;
        setValue(value: string, reason?: string): void;
        setPosition(position: number): void;
        clear(): void;
        submit(): void;
        focusInput(index?: number): void;
        attachRoot(el: Element): OffFn;
        attachInput(el: HTMLInputElement, index: number): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
        readonly length: number;
    }

    export function createPinInput(opts?: PinInputOptions): PinInputInstance;
}
declare module "@zakkster/lite-headless/pin-input/element" {}

// =============================================================================
// tag-input
// =============================================================================

declare module "@zakkster/lite-headless/tag-input" {
    export interface TagInputOptions {
        value?: string[];
        delimiter?: string | RegExp;
        maxTags?: number;
        validate?: (tag: string) => boolean | string;
        onChange?: (tags: string[], reason?: string) => void;
    }

    export interface TagInputInstance {
        tags: ReactiveAccessor<string[]>;
        count: ReactiveAccessor<number>;
        canAddMore: ReactiveAccessor<boolean>;
        activeIndex: ReactiveAccessor<number>;
        inputValue: ReactiveAccessor<string>;
        addTag(tag: string, reason?: string): void;
        removeTag(tag: string, reason?: string): void;
        removeLast(reason?: string): void;
        clear(reason?: string): void;
        setTags(tags: string[]): void;
        setActiveIndex(index: number): void;
        focusInput(): void;
        attachRoot(el: Element): OffFn;
        attachInput(el: HTMLInputElement): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createTagInput(opts?: TagInputOptions): TagInputInstance;
}
declare module "@zakkster/lite-headless/tag-input/element" {}

// =============================================================================
// tour
// =============================================================================

declare module "@zakkster/lite-headless/tour" {
    export interface TourStep {
        id: string;
        target: string | Element;
        title?: string;
        body?: string;
        placement?: "top" | "right" | "bottom" | "left";
    }

    export interface TourOptions {
        steps?: TourStep[];
        onChange?: (step: TourStep | null, reason?: string) => void;
        onFinish?: () => void;
    }

    export interface TourInstance {
        // step registry
        addStep(step: TourStep): void;
        removeStep(id: string): void;
        steps: ReactiveAccessor<TourStep[]>;
        count(): number;
        // accessors
        current: ReactiveAccessor<number>;
        currentStep: ReactiveAccessor<TourStep | null>;
        isActive: ReactiveAccessor<boolean>;
        isFirst: ReactiveAccessor<boolean>;
        isLast: ReactiveAccessor<boolean>;
        // navigation
        start(stepId?: string): void;
        next(): void;
        prev(): void;
        goTo(stepId: string): void;
        skip(): void;
        finish(): void;
        // attach
        attachRoot(el: Element): OffFn;
        attachStepContent(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createTour(opts?: TourOptions): TourInstance;
}
declare module "@zakkster/lite-headless/tour/element" {}

// =============================================================================
// toast
// =============================================================================

declare module "@zakkster/lite-headless/toast" {
    export interface ToastShowOptions {
        urgent?: boolean;
        duration?: number;
        kind?: "info" | "success" | "warning" | "error";
        title?: string;
        body?: string;
        id?: string;
    }

    export interface ToastHandle {
        id: string;
        el: Element | null;
        dismiss(reason?: string): void;
        update(newContent: Node | string, newOpts?: ToastShowOptions): void;
    }

    export interface ToastInstance {
        count: ReactiveAccessor<number>;
        hovering: ReactiveAccessor<boolean>;
        focused: ReactiveAccessor<boolean>;
        show(content: Node | string, opts?: ToastShowOptions): ToastHandle;
        dismiss(id: string, reason?: string): void;
        clear(): void;
        getEntries(): Array<{ id: string; urgent: boolean }>;
        attachRoot(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createToast(opts?: object): ToastInstance;
}
declare module "@zakkster/lite-headless/toast/element" {}

// =============================================================================
// backtop / affix / anchor  (Tier-2 navigation)
// =============================================================================

declare module "@zakkster/lite-headless/backtop" {
    export interface BackTopOptions {
        threshold?: number;
        smooth?: boolean;
        onActivate?: (reason?: string) => void;
    }

    export interface BackTopInstance {
        isVisible(): boolean;
        threshold(): number;
        readonly smooth: boolean;
        attachTarget(target: Element | Window | null): OffFn;
        attachButton(buttonEl: Element): OffFn;
        scrollToTop(reason?: string): void;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createBackTop(opts?: BackTopOptions): BackTopInstance;
}
declare module "@zakkster/lite-headless/backtop/element" {}

declare module "@zakkster/lite-headless/affix" {
    export interface AffixOptions {
        offsetTop?: number;
        root?: Element | null;
        onChange?: (pinned: boolean) => void;
    }

    export interface AffixInstance {
        isPinned(): boolean;
        offsetTop(): number;
        attachRoot(targetEl: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createAffix(opts?: AffixOptions): AffixInstance;
}
declare module "@zakkster/lite-headless/affix/element" {}

declare module "@zakkster/lite-headless/anchor" {
    export interface AnchorOptions {
        root?: Element | null;
        offsetTop?: number;
        smooth?: boolean;
        onChange?: (key: string | null) => void;
    }

    export interface AnchorInstance {
        activeKey(): string | null;
        readonly linkCount: number;
        attachRoot(linkContainerEl: Element): OffFn;
        attachLink(linkEl: Element, sectionEl: Element, key?: string): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createAnchor(opts?: AnchorOptions): AnchorInstance;
}
declare module "@zakkster/lite-headless/anchor/element" {}

// =============================================================================
// Element wrapper interfaces
//
// Each `<lite-X>` custom element extends HTMLElement with the
// imperative API exposed by its primitive (host accessors / methods).
// The wrapper also dispatches CustomEvents named in the per-primitive
// llms.txt; we keep them as untyped CustomEvent here to avoid
// re-modeling DOM event interfaces.
// =============================================================================

// =============================================================================
// separator  (1.0.0)
// =============================================================================

declare module "@zakkster/lite-headless/separator" {
    export type SeparatorOrientation = "horizontal" | "vertical";

    export interface SeparatorOptions {
        orientation?: SeparatorOrientation;
        decorative?: boolean;
    }

    export interface SeparatorInstance {
        orientation: ReactiveAccessor<SeparatorOrientation>;
        readonly isDecorative: boolean;
        setOrientation(orientation: SeparatorOrientation): void;
        attachRoot(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createSeparator(opts?: SeparatorOptions): SeparatorInstance;
}
declare module "@zakkster/lite-headless/separator/element" {}

// =============================================================================
// clipboard  (1.0.0)
// =============================================================================

declare module "@zakkster/lite-headless/clipboard" {
    export interface ClipboardOptions {
        value?: string;
        timeout?: number;
        write?: (text: string) => Promise<unknown>;
        onCopy?: (text: string) => void;
        onError?: (err: unknown) => void;
    }

    export interface ClipboardInstance {
        value: ReactiveAccessor<string>;
        isCopied: ReactiveAccessor<boolean>;
        isError: ReactiveAccessor<boolean>;
        setValue(value: string): void;
        copy(): Promise<boolean>;
        reset(): void;
        attachRoot(el: Element): OffFn;
        attachTrigger(el: Element): OffFn;
        attachIndicator(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createClipboard(opts?: ClipboardOptions): ClipboardInstance;
}
declare module "@zakkster/lite-headless/clipboard/element" {}

// =============================================================================
// password-input  (1.0.0)
// =============================================================================

declare module "@zakkster/lite-headless/password-input" {
    export interface PasswordInputOptions {
        visible?: boolean;
        onVisibilityChange?: (visible: boolean) => void;
    }

    export interface PasswordInputInstance {
        isVisible: ReactiveAccessor<boolean>;
        setVisible(visible: boolean): void;
        toggle(): void;
        show(): void;
        hide(): void;
        attachInput(el: Element): OffFn;
        attachToggle(el: Element): OffFn;
        attachRoot(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createPasswordInput(opts?: PasswordInputOptions): PasswordInputInstance;
}
declare module "@zakkster/lite-headless/password-input/element" {}

// =============================================================================
// alert-dialog  (1.0.0) -- same shapes as dialog
// =============================================================================

declare module "@zakkster/lite-headless/alert-dialog" {
    export type AlertDialogOptions = import("@zakkster/lite-headless/dialog").DialogOptions;
    export type AlertDialogInstance = import("@zakkster/lite-headless/dialog").DialogInstance;
    export function createAlertDialog(opts?: AlertDialogOptions): AlertDialogInstance;
}
declare module "@zakkster/lite-headless/alert-dialog/element" {}

// =============================================================================
// hover-card  (1.0.0) -- positioned by @zakkster/lite-floating
// =============================================================================

declare module "@zakkster/lite-headless/hover-card" {
    export type HoverCardStatus = "closed" | "opening" | "open" | "closing";
    export type HoverCardPlacement =
        | "top" | "top-start" | "top-end"
        | "right" | "right-start" | "right-end"
        | "bottom" | "bottom-start" | "bottom-end"
        | "left" | "left-start" | "left-end";

    export interface HoverCardOptions {
        open?: ReactiveAccessor<boolean>;
        defaultOpen?: boolean;
        onOpenChange?: (open: boolean, reason?: string) => void;
        placement?: HoverCardPlacement;
        offset?: number;
        flip?: boolean;
        shift?: boolean;
        openDelay?: number;
        closeDelay?: number;
        closeOnEscape?: boolean;
        container?: Element | null;
        transition?: boolean;
    }

    export interface HoverCardInstance {
        open: ReactiveAccessor<boolean>;
        status: ReactiveAccessor<HoverCardStatus>;
        setOpen(open: boolean, reason?: string): void;
        toggle(reason?: string): void;
        attachRoot(el: Element): OffFn;
        attachTrigger(el: Element): OffFn;
        attachAnchor(el: Element): OffFn;
        attachContent(el: Element): OffFn;
        attachArrow(el: Element): OffFn;
        destroy(): void;
        readonly destroyed: boolean;
    }

    export function createHoverCard(opts?: HoverCardOptions): HoverCardInstance;
}
declare module "@zakkster/lite-headless/hover-card/element" {}

declare global {
    interface LiteDialogElement extends HTMLElement {
        readonly isOpen: boolean;
        readonly status: import("@zakkster/lite-headless/dialog").DialogStatus;
        setOpen(open: boolean, reason?: string): void;
        toggle(reason?: string): void;
        readonly _dialogInstance: import("@zakkster/lite-headless/dialog").DialogInstance;
    }

    interface LitePopoverElement extends HTMLElement {
        readonly isOpen: boolean;
        readonly status: import("@zakkster/lite-headless/popover").PopoverStatus;
        setOpen(open: boolean, reason?: string): void;
        toggle(reason?: string): void;
        readonly _popoverInstance: import("@zakkster/lite-headless/popover").PopoverInstance;
    }

    interface LiteTooltipElement extends HTMLElement {
        readonly isOpen: boolean;
        setOpen(open: boolean, reason?: string): void;
        toggle(reason?: string): void;
        readonly _tooltipInstance: import("@zakkster/lite-headless/tooltip").TooltipInstance;
    }

    interface LiteDrawerElement extends HTMLElement {
        readonly isOpen: boolean;
        readonly side: import("@zakkster/lite-headless/drawer").DrawerSide;
        readonly status: import("@zakkster/lite-headless/drawer").DrawerStatus;
        setOpen(open: boolean): void;
        show(): void;
        hide(): void;
        setSide(side: import("@zakkster/lite-headless/drawer").DrawerSide): void;
        readonly _drawerInstance: import("@zakkster/lite-headless/drawer").DrawerInstance;
    }

    interface LiteComboboxElement<T = unknown> extends HTMLElement {
        readonly value: T | null;
        readonly query: string;
        readonly isOpen: boolean;
        setValue(value: T | null, reason?: string): void;
        setQuery(q: string): void;
        setOpen(open: boolean, reason?: string): void;
        readonly _comboboxInstance: import("@zakkster/lite-headless/combobox").ComboboxInstance<T>;
    }

    interface LiteMenuElement extends HTMLElement {
        readonly isOpen: boolean;
        setOpen(open: boolean, reason?: string): void;
        readonly _menuInstance: import("@zakkster/lite-headless/menu").MenuInstance;
    }

    interface LiteSliderElement extends HTMLElement {
        readonly value: number[];
        setValue(value: number | number[], reason?: string): void;
        readonly _sliderInstance: import("@zakkster/lite-headless/slider").SliderInstance;
    }

    interface LiteDatepickerElement extends HTMLElement {
        readonly value: Date | null;
        readonly view: import("@zakkster/lite-headless/datepicker").DatePickerView;
        setValue(value: Date | null, reason?: string): void;
        setView(view: import("@zakkster/lite-headless/datepicker").DatePickerView): void;
        readonly _datepickerInstance: import("@zakkster/lite-headless/datepicker").DatePickerInstance;
    }

    interface LiteSplitPanelsElement extends HTMLElement {
        readonly layout: number[];
        setLayout(sizes: number[], reason?: string): void;
        collapsePanel(index: number): void;
        expandPanel(index: number, sizeOverride?: number): void;
        reconcile(): void;
        readonly _splitPanelsInstance: import("@zakkster/lite-headless/split-panels").SplitPanelsInstance;
    }

    interface LiteStepperElement extends HTMLElement {
        readonly value: number;
        setValue(value: number, reason?: string): void;
        increment(reason?: string): void;
        decrement(reason?: string): void;
        readonly _stepperInstance: import("@zakkster/lite-headless/stepper").StepperInstance;
    }

    interface LiteStepsElement extends HTMLElement {
        readonly index: number;
        readonly currentStep: import("@zakkster/lite-headless/steps").StepDefinition;
        setCurrent(index: number, reason?: string): void;
        setCurrentById(id: string, reason?: string): void;
        setStepStatus(id: string, status: import("@zakkster/lite-headless/steps").StepStatus): void;
        clearAllErrors(): void;
        next(reason?: string): void;
        prev(reason?: string): void;
        readonly _stepsInstance: import("@zakkster/lite-headless/steps").StepsInstance;
    }

    interface LiteTabsElement extends HTMLElement {
        readonly value: string;
        setValue(value: string, reason?: string): void;
        setDisabled(key: string, disabled: boolean): void;
        next(reason?: string): void;
        prev(reason?: string): void;
        first(reason?: string): void;
        last(reason?: string): void;
        readonly _tabsInstance: import("@zakkster/lite-headless/tabs").TabsInstance;
    }

    interface LiteAccordionElement extends HTMLElement {
        readonly value: string | string[];
        setValue(value: string | string[], reason?: string): void;
        toggle(key: string, reason?: string): void;
        open(key: string, reason?: string): void;
        close(key: string, reason?: string): void;
        setDisabled(key: string, disabled: boolean): void;
        readonly _accordionInstance: import("@zakkster/lite-headless/accordion").AccordionInstance;
    }

    interface LiteCarouselElement extends HTMLElement {
        readonly index: number;
        readonly slideCount: number;
        go(index: number): void;
        next(): void;
        prev(): void;
        play(): void;
        pause(): void;
        readonly _carouselInstance: import("@zakkster/lite-headless/carousel").CarouselInstance;
    }

    interface LitePaginationElement extends HTMLElement {
        readonly page: number;
        readonly pageCount: number;
        setPage(page: number, reason?: string): void;
        next(): void;
        prev(): void;
        readonly _paginationInstance: import("@zakkster/lite-headless/pagination").PaginationInstance;
    }

    interface LiteRatingElement extends HTMLElement {
        readonly value: number;
        readonly displayValue: number;
        readonly isReadOnly: boolean;
        setValue(value: number, reason?: string): void;
        clear(): void;
        setReadOnly(readOnly: boolean): void;
        readonly _ratingInstance: import("@zakkster/lite-headless/rating").RatingInstance;
    }

    interface LiteSwitchElement extends HTMLElement {
        readonly checked: boolean;
        readonly disabled: boolean;
        setChecked(checked: boolean, reason?: string): void;
        setDisabled(disabled: boolean): void;
        toggle(reason?: string): void;
        readonly _switchInstance: import("@zakkster/lite-headless/switch").SwitchInstance;
    }

    interface LiteToggleGroupElement extends HTMLElement {
        readonly value: string | string[];
        readonly disabled: boolean;
        readonly type: import("@zakkster/lite-headless/toggle-group").ToggleGroupType;
        setValue(value: string | string[], reason?: string): void;
        toggleItem(key: string, reason?: string): void;
        contains(key: string): boolean;
        setDisabled(disabled: boolean): void;
        setItemDisabled(key: string, disabled: boolean): void;
        readonly _toggleGroupInstance: import("@zakkster/lite-headless/toggle-group").ToggleGroupInstance;
    }

    interface LiteRadioGroupElement extends HTMLElement {
        readonly value: string;
        readonly checkedKey: string;
        readonly isDisabled: boolean;
        readonly itemCount: number;
        setValue(value: string, reason?: string): void;
        setDisabled(disabled: boolean): void;
        setItemDisabled(keyOrEl: string | Element, disabled: boolean): void;
        readonly _radioGroupInstance: import("@zakkster/lite-headless/radio-group").RadioGroupInstance;
    }

    interface LiteMeterElement extends HTMLElement {
        readonly value: number;
        setValue(value: number): void;
        readonly _meterInstance: import("@zakkster/lite-headless/meter").MeterInstance;
    }

    interface LiteProgressElement extends HTMLElement {
        readonly value: number | null;
        readonly fraction: number;
        readonly isComplete: boolean;
        setValue(value: number | null): void;
        setMin(min: number): void;
        setMax(max: number): void;
        setIndeterminate(indeterminate: boolean): void;
        setValueText(text: string): void;
        readonly _progressInstance: import("@zakkster/lite-headless/progress").ProgressInstance;
    }

    interface LiteButtonElement extends HTMLElement {
        readonly isPressed: boolean;
        readonly isLoading: boolean;
        readonly isDisabled: boolean;
        readonly canPress: boolean;
        setPressed(pressed: boolean, reason?: string): void;
        setDisabled(disabled: boolean): void;
        setLoading(loading: boolean): void;
        runAsync<T>(promise: Promise<T>): Promise<T>;
        readonly _buttonInstance: import("@zakkster/lite-headless/button").ButtonInstance;
    }

    interface LiteCardElement extends HTMLElement {
        readonly isCollapsed: boolean;
        readonly isDismissed: boolean;
        setCollapsed(collapsed: boolean, reason?: string): void;
        toggle(reason?: string): void;
        collapse(reason?: string): void;
        expand(reason?: string): void;
        dismiss(reason?: string): void;
        reopen(): void;
        readonly _cardInstance: import("@zakkster/lite-headless/card").CardInstance;
    }

    interface LiteTagElement extends HTMLElement {
        readonly intent: import("@zakkster/lite-headless/tag").TagIntent;
        readonly isRemoved: boolean;
        setIntent(intent: import("@zakkster/lite-headless/tag").TagIntent): void;
        close(reason?: string): void;
        reset(): void;
        readonly _tagInstance: import("@zakkster/lite-headless/tag").TagInstance;
    }

    interface LiteBadgeElement extends HTMLElement {
        readonly count: number;
        readonly displayed: string;
        setCount(count: number): void;
        increment(by?: number): void;
        decrement(by?: number): void;
        reset(): void;
        readonly _badgeInstance: import("@zakkster/lite-headless/badge").BadgeInstance;
    }

    interface LiteTimelineElement extends HTMLElement {
        readonly itemCount: number;
        setItemType(el: Element, type: import("@zakkster/lite-headless/timeline").TimelineItemType): void;
        readonly _timelineInstance: import("@zakkster/lite-headless/timeline").TimelineInstance;
    }

    interface LiteDescriptionsElement extends HTMLElement {
        readonly columns: number;
        readonly bordered: boolean;
        readonly _descriptionsInstance: import("@zakkster/lite-headless/descriptions").DescriptionsInstance;
    }

    interface LiteResultElement extends HTMLElement {
        readonly status: import("@zakkster/lite-headless/result").ResultStatus;
        readonly _resultInstance: import("@zakkster/lite-headless/result").ResultInstance;
    }

    interface LiteBannerElement extends HTMLElement {
        readonly isOpen: boolean;
        readonly kind: import("@zakkster/lite-headless/banner").BannerKind;
        setOpen(open: boolean): void;
        show(): void;
        dismiss(reason?: string): void;
        setKind(kind: import("@zakkster/lite-headless/banner").BannerKind): void;
        readonly _bannerInstance: import("@zakkster/lite-headless/banner").BannerInstance;
    }

    interface LiteEmptyStateElement extends HTMLElement {
        readonly _emptyStateInstance: import("@zakkster/lite-headless/empty-state").EmptyStateInstance;
    }

    interface LiteSkeletonElement extends HTMLElement {
        readonly loading: boolean;
        setLoading(loading: boolean): void;
        readonly _skeletonInstance: import("@zakkster/lite-headless/skeleton").SkeletonInstance;
    }

    interface LiteAvatarElement extends HTMLElement {
        readonly state: import("@zakkster/lite-headless/avatar").AvatarState;
        readonly initials: string;
        readonly colorHash: number;
        setSrc(src: string): void;
        readonly _avatarInstance: import("@zakkster/lite-headless/avatar").AvatarInstance;
    }

    interface LiteBreadcrumbElement extends HTMLElement {
        readonly current: string | null;
        setCurrent(key: string): void;
        readonly _breadcrumbInstance: import("@zakkster/lite-headless/breadcrumb").BreadcrumbInstance;
    }

    interface LitePictureElement extends HTMLElement {
        readonly state: import("@zakkster/lite-headless/picture").PictureState;
        readonly src: string;
        setSrc(src: string): void;
        retry(): void;
        readonly _pictureInstance: import("@zakkster/lite-headless/picture").PictureInstance;
    }

    interface LiteStatElement extends HTMLElement {
        readonly value: number;
        readonly displayValue: number;
        readonly label: string;
        readonly unit: string;
        readonly trend: "up" | "down" | "flat";
        setValue(value: number): void;
        setLabel(label: string): void;
        setUnit(unit: string): void;
        setTrend(trend: "up" | "down" | "flat"): void;
        readonly _statInstance: import("@zakkster/lite-headless/stat").StatInstance;
    }

    interface LiteCalendarElement extends HTMLElement {
        readonly value: Date | null;
        setValue(value: Date | null): void;
        readonly _calendarInstance: import("@zakkster/lite-headless/calendar").CalendarInstance;
    }

    interface LiteKanbanElement extends HTMLElement {
        readonly columns: import("@zakkster/lite-headless/kanban").KanbanColumn[];
        readonly cards: import("@zakkster/lite-headless/kanban").KanbanCard[];
        cardsInColumn(columnId: string): import("@zakkster/lite-headless/kanban").KanbanCard[];
        getCard(id: string): import("@zakkster/lite-headless/kanban").KanbanCard | null;
        getColumn(id: string): import("@zakkster/lite-headless/kanban").KanbanColumn | null;
        moveCard(cardId: string, toColumn: string, toIndex?: number, reason?: string): void;
        addCard(card: import("@zakkster/lite-headless/kanban").KanbanCard): void;
        removeCard(id: string): void;
        updateCard(id: string, patch: Partial<import("@zakkster/lite-headless/kanban").KanbanCard>): void;
        addColumn(col: import("@zakkster/lite-headless/kanban").KanbanColumn): void;
        removeColumn(id: string): void;
        readonly _kanbanInstance: import("@zakkster/lite-headless/kanban").KanbanInstance;
    }

    interface LiteSortableElement extends HTMLElement {
        readonly items: import("@zakkster/lite-headless/sortable").SortableItem[];
        readonly order: string[];
        readonly isDragging: boolean;
        move(key: string, idx: number): void;
        swap(a: string, b: string): void;
        setOrder(order: string[]): void;
        insertAt(key: string, idx: number): void;
        removeKey(key: string): void;
        setItemDisabled(key: string, disabled: boolean): void;
        readonly _sortableInstance: import("@zakkster/lite-headless/sortable").SortableInstance;
    }

    interface LiteTreeElement extends HTMLElement {
        readonly expanded: string[];
        readonly selected: string | null;
        expand(key: string, reason?: string): void;
        collapse(key: string, reason?: string): void;
        toggleExpanded(key: string, reason?: string): void;
        select(key: string, reason?: string): void;
        deselect(reason?: string): void;
        toggleSelected(key: string, reason?: string): void;
        setSelected(key: string | null, reason?: string): void;
        setExpanded(keys: string[], reason?: string): void;
        readonly _treeInstance: import("@zakkster/lite-headless/tree").TreeInstance;
    }

    interface LiteToolbarElement extends HTMLElement {
        readonly _toolbarInstance: import("@zakkster/lite-headless/toolbar").ToolbarInstance;
    }

    interface LiteColorPickerElement extends HTMLElement {
        readonly hex: string;
        readonly rgb: import("@zakkster/lite-headless/color-picker").RGB;
        readonly hsv: import("@zakkster/lite-headless/color-picker").HSV;
        setHex(hex: string): void;
        setRgb(rgb: Partial<import("@zakkster/lite-headless/color-picker").RGB>): void;
        setHsv(hsv: Partial<import("@zakkster/lite-headless/color-picker").HSV>): void;
        setOklch(oklch: Partial<import("@zakkster/lite-headless/color-picker").OKLCH>): void;
        setAlpha(alpha: number): void;
        readonly _colorPickerInstance: import("@zakkster/lite-headless/color-picker").ColorPickerInstance;
    }

    interface LiteCommandPaletteElement extends HTMLElement {
        readonly isOpen: boolean;
        readonly query: string;
        setOpen(open: boolean, reason?: string): void;
        setQuery(query: string): void;
        readonly _commandPaletteInstance: import("@zakkster/lite-headless/command-palette").CommandPaletteInstance;
    }

    interface LiteFileUploadElement extends HTMLElement {
        readonly files: File[];
        addFiles(files: File[] | FileList): void;
        removeFile(file: File): void;
        clear(): void;
        readonly _fileUploadInstance: import("@zakkster/lite-headless/file-upload").FileUploadInstance;
    }

    interface LiteFormFieldElement extends HTMLElement {
        readonly error: string | null;
        setError(error: string | null): void;
        readonly _formFieldInstance: import("@zakkster/lite-headless/form-field").FormFieldInstance;
    }

    interface LiteInlineEditElement extends HTMLElement {
        readonly value: string;
        readonly editing: boolean;
        setValue(value: string, reason?: string): void;
        startEditing(): void;
        cancelEditing(): void;
        commitEditing(): void;
        readonly _inlineEditInstance: import("@zakkster/lite-headless/inline-edit").InlineEditInstance;
    }

    interface LiteNotificationCenterElement extends HTMLElement {
        readonly items: import("@zakkster/lite-headless/notification-center").NotificationItem[];
        readonly unreadCount: number;
        setItems(items: import("@zakkster/lite-headless/notification-center").NotificationItem[]): void;
        markRead(key: string): void;
        markAllRead(): void;
        dismiss(key: string): void;
        readonly _notificationCenterInstance: import("@zakkster/lite-headless/notification-center").NotificationCenterInstance;
    }

    interface LitePinInputElement extends HTMLElement {
        readonly value: string;
        setValue(value: string, reason?: string): void;
        clear(): void;
        readonly _pinInputInstance: import("@zakkster/lite-headless/pin-input").PinInputInstance;
    }

    interface LiteTagInputElement extends HTMLElement {
        readonly value: string[];
        addTag(tag: string, reason?: string): void;
        removeTag(tag: string, reason?: string): void;
        setValue(tags: string[]): void;
        readonly _tagInputInstance: import("@zakkster/lite-headless/tag-input").TagInputInstance;
    }

    interface LiteTourElement extends HTMLElement {
        readonly index: number;
        readonly running: boolean;
        start(): void;
        next(): void;
        prev(): void;
        finish(): void;
        readonly _tourInstance: import("@zakkster/lite-headless/tour").TourInstance;
    }

    interface LiteToastElement extends HTMLElement {
        push(toast: import("@zakkster/lite-headless/toast").ToastItem): string;
        dismiss(key: string): void;
        dismissAll(): void;
        readonly _toastInstance: import("@zakkster/lite-headless/toast").ToastInstance;
    }

    interface LiteBackTopElement extends HTMLElement {
        readonly isVisible: boolean;
        readonly threshold: number;
        scrollToTop(reason?: string): void;
        readonly _backtopInstance: import("@zakkster/lite-headless/backtop").BackTopInstance;
    }

    interface LiteAffixElement extends HTMLElement {
        readonly isPinned: boolean;
        readonly offsetTop: number;
        readonly _affixInstance: import("@zakkster/lite-headless/affix").AffixInstance;
    }

    interface LiteAnchorElement extends HTMLElement {
        readonly activeKey: string | null;
        readonly linkCount: number;
        readonly _anchorInstance: import("@zakkster/lite-headless/anchor").AnchorInstance;
    }

    // ---- HTMLElementTagNameMap registry ----
    interface LiteSeparatorElement extends HTMLElement {
        readonly orientation: "horizontal" | "vertical";
        setOrientation(orientation: "horizontal" | "vertical"): void;
        readonly _separatorInstance: import("@zakkster/lite-headless/separator").SeparatorInstance;
    }

    interface LiteClipboardElement extends HTMLElement {
        value: string;
        readonly copied: boolean;
        copy(): Promise<boolean>;
        reset(): void;
        setValue(value: string): void;
        readonly _clipboardInstance: import("@zakkster/lite-headless/clipboard").ClipboardInstance;
    }

    interface LitePasswordInputElement extends HTMLElement {
        visible: boolean;
        toggle(): void;
        show(): void;
        hide(): void;
        setVisible(visible: boolean): void;
        readonly _passwordInputInstance: import("@zakkster/lite-headless/password-input").PasswordInputInstance;
    }

    interface LiteAlertDialogElement extends HTMLElement {
        readonly isOpen: boolean;
        readonly status: import("@zakkster/lite-headless/dialog").DialogStatus;
        setOpen(open: boolean, reason?: string): void;
        toggle(reason?: string): void;
        readonly _alertDialogInstance: import("@zakkster/lite-headless/dialog").DialogInstance;
    }

    interface LiteHoverCardElement extends HTMLElement {
        readonly isOpen: boolean;
        readonly status: import("@zakkster/lite-headless/hover-card").HoverCardStatus;
        setOpen(open: boolean, reason?: string): void;
        toggle(reason?: string): void;
        readonly _hoverCardInstance: import("@zakkster/lite-headless/hover-card").HoverCardInstance;
    }

    interface HTMLElementTagNameMap {
        "lite-dialog":              LiteDialogElement;
        "lite-popover":             LitePopoverElement;
        "lite-tooltip":             LiteTooltipElement;
        "lite-drawer":              LiteDrawerElement;
        "lite-combobox":            LiteComboboxElement;
        "lite-menu":                LiteMenuElement;
        "lite-slider":              LiteSliderElement;
        "lite-datepicker":          LiteDatepickerElement;
        "lite-split-panels":        LiteSplitPanelsElement;
        "lite-stepper":             LiteStepperElement;
        "lite-steps":               LiteStepsElement;
        "lite-tabs":                LiteTabsElement;
        "lite-accordion":           LiteAccordionElement;
        "lite-carousel":            LiteCarouselElement;
        "lite-pagination":          LitePaginationElement;
        "lite-rating":              LiteRatingElement;
        "lite-switch":              LiteSwitchElement;
        "lite-toggle-group":        LiteToggleGroupElement;
        "lite-radio-group":         LiteRadioGroupElement;
        "lite-meter":               LiteMeterElement;
        "lite-progress":            LiteProgressElement;
        "lite-button":              LiteButtonElement;
        "lite-card":                LiteCardElement;
        "lite-tag":                 LiteTagElement;
        "lite-badge":               LiteBadgeElement;
        "lite-timeline":            LiteTimelineElement;
        "lite-descriptions":        LiteDescriptionsElement;
        "lite-result":              LiteResultElement;
        "lite-banner":              LiteBannerElement;
        "lite-empty-state":         LiteEmptyStateElement;
        "lite-skeleton":            LiteSkeletonElement;
        "lite-avatar":              LiteAvatarElement;
        "lite-breadcrumb":          LiteBreadcrumbElement;
        "lite-picture":             LitePictureElement;
        "lite-stat":                LiteStatElement;
        "lite-calendar":            LiteCalendarElement;
        "lite-kanban":              LiteKanbanElement;
        "lite-sortable":            LiteSortableElement;
        "lite-tree":                LiteTreeElement;
        "lite-toolbar":             LiteToolbarElement;
        "lite-color-picker":        LiteColorPickerElement;
        "lite-command-palette":     LiteCommandPaletteElement;
        "lite-file-upload":         LiteFileUploadElement;
        "lite-form-field":          LiteFormFieldElement;
        "lite-inline-edit":         LiteInlineEditElement;
        "lite-notification-center": LiteNotificationCenterElement;
        "lite-pin-input":           LitePinInputElement;
        "lite-tag-input":           LiteTagInputElement;
        "lite-tour":                LiteTourElement;
        "lite-toast":               LiteToastElement;
        "lite-backtop":             LiteBackTopElement;
        "lite-affix":               LiteAffixElement;
        "lite-anchor":              LiteAnchorElement;
        "lite-separator":           LiteSeparatorElement;
        "lite-clipboard":           LiteClipboardElement;
        "lite-password-input":      LitePasswordInputElement;
        "lite-alert-dialog":        LiteAlertDialogElement;
        "lite-hover-card":          LiteHoverCardElement;
    }
}

// Required to make this a module rather than a script.
export {};
