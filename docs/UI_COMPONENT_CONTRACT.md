# UI Component Contract

This is the enforceable implementation contract for the component inventory supplied with the project. It translates the Professional UI Design Standards Rulebook into one code-level UI system.

## Non-negotiable rule

The same semantic component must use the same anatomy, typography, icon position, padding, radius, border, focus treatment, disabled treatment, loading geometry, terminology and state names everywhere. Screens may choose only documented **size**, **density**, **tone** or **layout** variants; they must not create route-specific visual versions of an existing component.

`app/ui-standards.css` is the final normalization layer and `components/ui` is the reusable behavior layer. `app/ui-static.css` contains extracted route presentation only and loads before the standards layer, so it cannot redefine core component contracts.

## Foundation tokens

| Contract | Standard |
|---|---|
| Base spacing | 4px scale |
| Desktop / tablet / mobile page gutter | 32 / 20 / 16px |
| Preferred control | 48px |
| Standard product control | 44px |
| Compact desktop control | 40px minimum |
| Touch target | 48 × 48px preferred |
| Default radius | 8px |
| Default icon | 20px |
| Body typography | 16px / 24px; compact 14px / 20px |
| Standard content max | 1440px |
| Focus | Shared 2px high-contrast ring, independent from brand accent |
| Text contrast | 4.5:1 minimum |
| UI boundary/focus contrast | 3:1 minimum |
| Motion | Shared 100 / 150 / 200 / 300ms steps; reduced-motion safe |

## Common state matrix

Interactive components use only the applicable states from this vocabulary:

`default → hover → focus-visible → active/pressed → selected/checked → loading → disabled → read-only → error → success`

State changes must keep geometry stable. Error, success, selection and status must not depend on color alone.

## Form-control anatomy

`Label → control → helper text → validation message`

- Label remains visible after entry; placeholder is an example, never the label.
- Label/helper/error are programmatically associated with the field.
- Input/select use the shared 40 / 44 / 48px size axis.
- Textarea minimum height is 96px and vertical resize remains available where layout permits.
- Errors use text plus visual boundary treatment; entered values survive failed validation/submission.
- Text-like input, select and textarea markup outside `components/ui` is blocked by `verify-ui-standards.cjs`.

## Action-control anatomy

- One dominant primary action per task region.
- `primary / secondary / tertiary / destructive` are semantic variants, not route colors.
- `compact / default / large` are the supported size axis.
- Icon-only controls require an accessible name and the common target/focus treatment.
- Async loading prevents duplicate submission and preserves button geometry.
- Legacy generic `.btn` actions have been migrated to the shared `Button`; specialized controls such as tabs, menu rows, toolbar toggles and canvas controls retain purpose-specific markup but are normalized by the same tokens/focus rules.

## Overlay contract

Dialog, Alert Dialog, Drawer, Sheet, Popover and temporary surfaces share overlay width, padding, radius, shadow, backdrop and z-index tokens. True modal surfaces must:

- expose dialog semantics and an accessible name;
- move focus inside and trap it;
- close with Escape when safe;
- lock background scrolling;
- restore focus to the trigger;
- remain inside the viewport;
- avoid nested modal layers without an explicit focus strategy.

## Complete supplied component inventory

All **64 supplied components** now have a project-owned shared implementation/canonical primitive under `apps/web/components/ui`.

| Component | Status | Canonical implementation / contract |
|---|---|---|
| Accordion | Primitive | `Accordion`; shared 48px trigger, expanded state and focus |
| Alert | Primitive | `Alert` / `Callout`; semantic severity, icon/text/action anatomy |
| Alert Dialog | Primitive | `AlertDialog`; non-dismiss-on-backdrop destructive decision surface |
| Aspect Ratio | Primitive | `AspectRatio`; reserved media geometry |
| Attachment | Primitive | `Attachment`; upload/progress/error/retry/remove slots |
| Avatar | Primitive | `Avatar`; 1:1 scale with image/initial fallback |
| Badge | Primitive | `Badge`; compact status/count only |
| Breadcrumb | Primitive | `Breadcrumb`; hierarchy and `aria-current` |
| Bubble | Primitive | `Bubble`; canonical message bubble slots |
| Button | Primitive | `Button`, `IconButton` |
| Button Group | Primitive | `ButtonGroup`; joined/separate action grouping |
| Calendar | Primitive | `Calendar`; date grid, min/max/disabled dates, arrows/Home/End/PageUp/PageDown keyboard model |
| Card | Primitive | `Card`; shared surface, padding and radius |
| Carousel | Primitive | `Carousel`; labeled slides, previous/next, live position |
| Chart | Primitive | `ChartFrame`; insight summary plus exact-data fallback |
| Checkbox | Primitive | `Checkbox`; label relationship and target contract |
| Collapsible | Primitive | `Collapsible`; alias of shared Accordion behavior |
| Combobox | Primitive | `Combobox`; filterable options, disabled-option skipping, loading/error/no-result states and ARIA active descendant |
| Command | Primitive | `Command`; filterable listbox with arrows/Home/End/Enter keyboard selection |
| Context Menu | Primitive | `ContextMenu`; shared menu rows and positioning |
| Data Table | Primitive | `DataTable`; semantic table, typed columns, selection/empty state |
| Date Picker | Primitive | `DatePicker`; validated direct entry plus keyboard-operable calendar surface |
| Dialog | Primitive | `Dialog`; backdrop, focus trap, Escape and focus restoration |
| Direction | Primitive | `Direction`; explicit ltr/rtl/auto scope |
| Drawer | Primitive | `Drawer`; side overlay with shared modal behavior |
| Dropdown Menu | Primitive | `DropdownMenu`; shared action-list geometry |
| Empty | Primitive | `EmptyState`; title, description and next action |
| Field | Primitive | `Field`; persistent label/helper/error linkage |
| Hover Card | Primitive | `HoverCard`; delayed hover/focus supplementary content |
| Input | Primitive | `Input`; shared size/radius/focus/error contract |
| Input Group | Primitive | `InputGroup`; shared prefix/control/suffix shell |
| Input OTP | Primitive | `InputOTP`; grouped one-time-code entry and paste-friendly model |
| Item | Primitive | `Item`; aligned leading/copy/trailing slots |
| Kbd | Primitive | `Kbd`; supplementary keyboard shortcut hint |
| Label | Primitive | `Label`; programmatic field association |
| Marker | Primitive | `Marker`; semantic text + visual marker cue |
| Menubar | Primitive | `Menubar`; grouped menu triggers |
| Message | Primitive | `Message`; author/time/body/action slots |
| Message Scroller | Primitive | `MessageScroller`; log semantics and stable scrolling |
| Native Select | Primitive | `NativeSelect`; shared native select contract |
| Navigation Menu | Primitive | `NavigationMenu`; stable destinations/current state |
| Pagination | Primitive | `Pagination`; current page and Previous/Next semantics |
| Popover | Primitive | `Popover`; anchored, collision-aware, dismissible interactive surface with focus restoration |
| Progress | Primitive | `Progress`; stable geometry and accessible value |
| QuestionnaireNew | Primitive | `Questionnaire`; standard form workflow shell |
| Radio Group | Primitive | `RadioGroup`; grouped legend semantics |
| Resizable | Primitive | `Resizable`; keyboard-operable separator handle |
| Scroll Area | Primitive | `ScrollArea`; local bounded overflow |
| Select | Primitive | `Select`; shared native select appearance/behavior |
| Separator | Primitive | `Separator`; semantic 1px divider |
| Sheet | Primitive | `Sheet`; Drawer alias with shared overlay contract |
| Sidebar | Primitive | `Sidebar`; expanded/collapsed destination shell |
| Skeleton | Primitive | `Skeleton`; stable loading geometry |
| Slider | Primitive | `Slider`; 48px target and native keyboard model |
| Spinner | Primitive | `Spinner`; status semantics and reduced-motion handling |
| Switch | Primitive | `Switch`; immediate binary setting only |
| Table | Primitive | `Table`; semantic table wrapper and local overflow |
| Tabs | Primitive | `Tabs`; tablist/tab semantics, arrows/Home/End |
| Textarea | Primitive | `Textarea`; shared field geometry and 96px minimum |
| Toast | Primitive | `ToastProvider` / `useToast`; severity timing, live region, queue cap |
| Toggle | Primitive | `Toggle`; `aria-pressed` and shared selected state |
| Toggle Group | Primitive | `ToggleGroup`; single-selection group contract |
| Tooltip | Primitive | `Tooltip`; brief non-interactive focus/hover help with Escape dismissal |
| Typography | Primitive | `Heading`, `Text`; shared hierarchy and text tones |

## Migration result

The final source-level standardization gate enforces:

- **0 static JSX style objects** — static route presentation is centralized in `ui-static.css`;
- **0 dynamic JSX `style` attributes** — runtime geometry/data flows through `RuntimeStyle` / `useRuntimeCssVars` into CSS custom properties;
- **0 literal authored colors in `globals.css`, `ui-static.css`, or `ui-standards.css`** — CSS color values are centralized in `design-tokens.css`;
- **0 hard-coded hex colors in TSX** — configurable theme/project palettes live in `theme/themeTokens.ts`;
- **0 browser `prompt()` / `confirm()` workflows**;
- **0 raw text-like `<input>`, `<select>` or `<textarea>` outside the shared UI layer**;
- **1 top-level `:root`** in legacy `globals.css`;
- all supplied component modules exported through `components/ui/index.ts`;
- shared modal accessibility behavior for every current `modal-backdrop` implementation.

Runtime visual data is no longer expressed through JSX `style` attributes. Chart/progress values, whiteboard/proof coordinates, overlay position, resizable dimensions and user-selected colors use the shared `RuntimeStyle` / `useRuntimeCssVars` bridge. CSS owns the actual visual properties and the gate fails if any JSX `style` attribute is reintroduced.

## Enforcement for future work

1. Import from `components/ui` when the semantic component exists.
2. Do not copy a route-local version of an existing component.
3. Repeated values belong in semantic/component tokens, not TSX or page-specific literal colors. `design-tokens.css` is the only authored CSS literal-color source.
4. Do not place raw semantic hex colors in TSX.
5. Use component size/density props or documented `data-*` states rather than local padding/height overrides.
6. Use `Dialog` / `useModalDialog` for every true modal.
7. Run `npm run verify:ui-standards`, `npm run verify:asana-screenshots`, and `npm run verify:f29-f42` before release.
8. When dependencies/full stack are available, run `pnpm --filter @pm/web e2e` to execute the reference-width, theme, keyboard and axe checks in `e2e/ui-standards.spec.ts`.
