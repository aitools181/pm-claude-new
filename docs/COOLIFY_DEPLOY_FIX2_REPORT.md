# Coolify Deploy Fix 2

## Failure reproduced from deployment log

Coolify commit `44ce30d12220cefa2632be2b0f6f680608ead48f` successfully installed native dependencies, built `@pm/shared`, `@pm/db`, `@pm/worker`, and `@pm/api`, and Next.js completed its webpack compilation. The deployment then stopped during Next.js type checking at `components/work/TaskDrawer.tsx:483` because the shared `UiInput` component did not accept a React `ref` prop.

The failing use was valid application code:

- `TaskDrawer` keeps `titleRef` as `RefObject<HTMLInputElement>` so it can focus/manage the task title input.
- The shared `Input` primitive was declared as a plain function taking `InputHTMLAttributes<HTMLInputElement>`.
- `ref` is not part of `InputHTMLAttributes`; React passes refs through `RefAttributes`, which plain function components do not receive.

## Correction

`apps/web/components/ui/Field.tsx` now exports `Input`, `Textarea`, and `Select` with `React.forwardRef` and forwards the received ref to the corresponding native element.

This fixes the current `UiInput ref={titleRef}` build blocker and also makes the shared form primitives correct for any future focus-management, dialog, accessibility, or validation code that needs native refs.

A production-readiness regression check was added so the shared controls cannot silently lose ref forwarding later.

## Verification performed here

All project source/static gates pass after the correction, including the 40 missing-feature checks and the Asana/UI standards checks. The local sandbox cannot run the actual `pnpm install` / `next build` because outbound npm registry access is unavailable, so the final semantic build should be re-run by Coolify. The uploaded Coolify log itself confirms that its Node 20 build environment and native build toolchain are now working; this change addresses the next blocking type error shown by that build.
