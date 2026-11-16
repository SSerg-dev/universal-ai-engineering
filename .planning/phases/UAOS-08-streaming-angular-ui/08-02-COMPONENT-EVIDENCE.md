# Angular inspector checkpoint — 2026-11-16

Implemented the Russian one-screen inspector against the selected UI contract: native labelled question form/examples/keyboard shortcut, ordered execution steps, explicit stop/reconnect actions, actionable fixed failure copy, grounded answer/exact source cards, optional citation/run details, and responsive Tailwind/manual tokens. Components consume the independent client/shared reducer without recreating execution. No remote resources, browser storage, inner-HTML rendering, or paid provider was added.

Official Angular/Vitest/jsdom validation passed 21 tests in two files in 3.18 seconds, followed by a strict-template production AOT build in 10.066 seconds. Final bundle at this checkpoint: 630.57 kB raw / 124.77 kB estimated transfer, within the declared 750 kB warning / 1 MB error budget. These are build estimates, not measured network or production performance. Two root admission/import checks passed separately.

Eight component checks prove labelled/empty/invalid form and focus, example plus Ctrl+Enter submission, duplicate-create prevention even while previous results remain visible, ordered grounded steps/source details/completion focus only once, honest abstention without sources, partial-state/read-only reconnect, actual-terminal cancellation/focus return, provisional/corrupt answer treatment, escaped hostile answer/quote text and long strings, and transport disposal. Thirteen prior client checks remain included.

The first strict build rejected ES-private signal-query members. They were changed to TypeScript-private query fields supported by the Angular compiler; no compiler safety flag was disabled. UI rootDir explicitly includes approved shared source while the import allowlist remains enforced.

Real rendered desktop/mobile verification, live database browser scenarios, clean-lock installation reproduction, final all-package/link/requirement/threat checks, and Phase 8 closure remain outstanding. jsdom tests do not establish full accessibility conformance or visual quality. Architectural review/human approval/stability remain pending.
