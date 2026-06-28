// @zakkster/lite-headless / src/index.js
//
// Barrel re-export of every primitive's default factory + the shared
// type/utility surface. Subpath imports remain the bundler-recommended
// path:
//
//     import { createCard } from "@zakkster/lite-headless/card";
//
// This barrel exists so consumers preferring a single entry can use:
//
//     import { createCard, createDialog } from "@zakkster/lite-headless";
//
// Modern bundlers (esbuild, rollup, webpack 5+) tree-shake unused factories.
// If bundle size matters at scale, prefer the subpath imports.

export { createAccordion } from "./accordion/index.js";
export { createAffix } from "./affix/index.js";
export { createAlertDialog } from "./alert-dialog/index.js";
export { createAnchor } from "./anchor/index.js";
export { createAvatar, deriveInitials, hueFromString } from "./avatar/index.js";
export { createBackTop } from "./backtop/index.js";
export { createBadge } from "./badge/index.js";
export { createBanner } from "./banner/index.js";
export { createBreadcrumb } from "./breadcrumb/index.js";
export { createButton } from "./button/index.js";
export { createCalendar } from "./calendar/index.js";
export { createCard } from "./card/index.js";
export { createCarousel } from "./carousel/index.js";
export { createClipboard } from "./clipboard/index.js";
export { createColorPicker } from "./color-picker/index.js";
export { createCombobox } from "./combobox/index.js";
export { createCommandPalette } from "./command-palette/index.js";
export { createDatePicker } from "./datepicker/index.js";
export { createDescriptions } from "./descriptions/index.js";
export { createDialog } from "./dialog/index.js";
export { createDrawer } from "./drawer/index.js";
export { createEmptyState } from "./empty-state/index.js";
export { createFileUpload } from "./file-upload/index.js";
export { createFormField } from "./form-field/index.js";
export { createHoverCard } from "./hover-card/index.js";
export { createInlineEdit } from "./inline-edit/index.js";
export { createKanban } from "./kanban/index.js";
export { createMenu } from "./menu/index.js";
export { createMeter } from "./meter/index.js";
export { createNotificationCenter } from "./notification-center/index.js";
export { createPagination, buildItems } from "./pagination/index.js";
export { createPasswordInput } from "./password-input/index.js";
export { createPicture } from "./picture/index.js";
export { createPinInput } from "./pin-input/index.js";
export { createPopover } from "./popover/index.js";
export { createProgress } from "./progress/index.js";
export { createRadioGroup } from "./radio-group/index.js";
export { createRating } from "./rating/index.js";
export { createResult } from "./result/index.js";
export { createSeparator } from "./separator/index.js";
export { createSkeleton } from "./skeleton/index.js";
export { createSlider } from "./slider/index.js";
export { createSortable } from "./sortable/index.js";
export { createSplitPanels } from "./split-panels/index.js";
export { createStat } from "./stat/index.js";
export { createStepper } from "./stepper/index.js";
export { createSteps } from "./steps/index.js";
export { createSwitch } from "./switch/index.js";
export { createTabs } from "./tabs/index.js";
export { createTag } from "./tag/index.js";
export { createTagInput } from "./tag-input/index.js";
export { createTimeline } from "./timeline/index.js";
export { createToast } from "./toast/index.js";
export { createToggleGroup } from "./toggle-group/index.js";
export { createToolbar } from "./toolbar/index.js";
export { createTooltip } from "./tooltip/index.js";
export { createTour } from "./tour/index.js";
export { createTree } from "./tree/index.js";
