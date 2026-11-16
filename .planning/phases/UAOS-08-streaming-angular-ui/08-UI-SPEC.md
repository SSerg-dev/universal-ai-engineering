---
phase: "08"
slug: streaming-angular-ui
status: specification-verified-implementation-pending
shadcn_initialized: false
preset: none
created: "2026-11-15"
---

# Phase 8 — UI Design Contract

Selected implementation defaults under the user's authorization to continue autonomously. This design is an agent recommendation, not human architectural approval. The established Angular/Tailwind direction and streaming contracts are locked; the reversible visual details below may be refined after visual verification. No prior UI, tokens, component library, or design system exists in this repository.

## Design System

| Property | Value |
|---|---|
| Tool | none; manually declared token system |
| Component library | none; Angular standalone component with native semantic elements |
| Styling | Tailwind 4 with explicit CSS theme tokens |
| Icons | no package; decorative text arrows and native disclosure, always with visible labels |
| Font | system sans-serif; system monospace only for optional run IDs |
| Language | Russian interface, with visibly identified English fixture examples |
| External resources | no remote font, image, analytics, or component registry |

There is no installed component design system to enumerate; a Component Inventory would incorrectly imply package exports. Native form/button/textarea/list/details/blockquote elements supply the surface. AOT Angular compilation and strict templates are required. UI tooling isolation and exact dependency admission precede installation because Angular 22 supports TypeScript 6 while the existing core pins TypeScript 7.

## Layout and hierarchy

One screen: header with course identity and iteration 08; title «Как рождается ответ»; a question card; a two-column execution/answer workspace. The question form is the initial focal point, followed by the answer when complete. No sidebar navigation or decorative dashboard metrics.

Maximum content width 1168px; page gutters 24px desktop and 16px below 768px. Below 900px the timeline and answer stack in that order. At 360px viewport there is no horizontal page scrolling; grid children use min-width:0 and identifiers/quotes wrap. Desktop workspace columns are 320px and the remaining width, with 24px gap. Form spans both columns. Panels use 24px padding desktop and 16px mobile, 16px corner radius, a one-pixel neutral border, and restrained shadow. No fixed-height answer clipping, nested timeline scroll, sticky overlay, or icon-only control. Long content expands vertically.

## Spacing Scale

| Token | Value | Usage |
|---|---|---|
| xs | 4px | inline separation |
| sm | 8px | related labels/chips |
| md | 16px | control padding and compact gaps |
| lg | 24px | panel padding and column gaps |
| xl | 32px | section separation |
| 2xl | 48px | hero separation |
| 3xl | 64px | page-level space |

No other spacing tokens. Border width and two-pixel focus outline are geometry, not spacing-scale exceptions. Minimum interactive height is 48px. Textarea minimum height is 112px and maximum normal viewport height is 240px before its own editing scroll.

## Typography

| Role | Size | Weight | Line Height |
|---|---|---|---|
| Label / metadata | 14px | 400 or 600 | 1.5 |
| Body / form / controls | 16px | 400 or 600 | 1.6 |
| Panel heading | 24px | 600 | 1.3 |
| Display | 40px | 600 | 1.2 |

Only these four sizes and two weights. Mobile display uses the existing 24px heading size. IDs use the 14px role; no extra type scale. Quotes use 16px body text.

## Color

| Role | Value | Usage |
|---|---|---|
| Dominant 60% | #f5f7f8 | page canvas |
| Secondary 30% | #ffffff | form/timeline/answer panels |
| Accent 10% | #0f766e | primary action, current execution marker, focus outline |
| Text | #172b35 | headings and body |
| Muted | #52636b | secondary explanatory text |
| Border | #d6e0e3 | panel and control boundaries |
| Destructive | #b42318 | failure/cancel action text and error marker only |
| Success | #166534 | completed status text only |

Accent is reserved for the primary question action, current timeline marker, and keyboard focus outline. Semantic success/error colors communicate states and always have text labels; ordinary example/citation controls use neutral styling. No gradients or status conveyed only by color. Body/label/control text contrast target is at least 4.5:1 against its actual background, verified from the declared colors and checked visually.

## Copywriting Contract

| Element | Copy |
|---|---|
| Header | Universal Agentic OS · Итерация 08 |
| Title | Как рождается ответ |
| Intro | Задайте вопрос по учебной документации и проследите каждый шаг. |
| Question label | Вопрос к документации |
| Placeholder | Например: execution journal |
| Fixture note | Учебные документы — на английском. |
| Primary CTA | Разобрать вопрос |
| Pending CTA | Выполняем запрос… |
| Empty validation | Введите вопрос, чтобы начать разбор. |
| Too long | Сократите вопрос до 2048 символов. |
| Example 1 | Журнал выполнения → fills execution journal |
| Example 2 | Политика выполнения → fills run policy |
| Example 3 | Без совпадений → fills !!! |
| Timeline heading | Шаги выполнения |
| Timeline empty | Каждый шаг будет виден здесь. |
| Timeline empty body | Начните с вопроса выше — покажем поиск и подготовку ответа. |
| Answer heading | Ответ и источники |
| Answer empty | Ответ появится после проверки источников. |
| Answer empty body | Цитаты помогут понять, на какие фрагменты опирается ответ. |
| Searching | Ищем фрагменты в документах… |
| Checking | Проверяем найденные источники… |
| Ready | Ответ готов |
| Abstained | В документах не нашлось подходящих фрагментов. Уточните вопрос или попробуйте другой пример. |
| Cancel action | Остановить запуск |
| Cancel pending | Запрашиваем остановку… |
| Cancelled | Запуск остановлен. Измените вопрос или начните снова. |
| Reconnecting | Восстанавливаем соединение… |
| Reconnect action | Восстановить соединение |
| Connection failure | Связь с запуском потеряна. Восстановите соединение, чтобы получить оставшиеся события. |
| Create failure | Не удалось начать запуск. Проверьте учебный сервер и повторите вопрос. |
| Protocol failure | Поток событий повреждён. Запустите вопрос заново. |
| Expired run | Данные запуска больше недоступны. Начните вопрос заново. |
| Cancel request failure | Не удалось отправить остановку. Повторите запрос остановки; текущий запуск продолжается. |
| Domain failure | Не удалось завершить ответ. Повторите вопрос; код причины доступен в данных запуска. |
| Detail disclosure | Данные запуска |

When a new create is pending, previous confirmed results remain labelled «Предыдущий результат. Новый запуск начинается…» until the new run is acknowledged. A received answer without its completion terminal is labelled «Результат ещё не подтверждён. Ждём завершения запуска.»; malformed protocol hides the answer and never shows the completed badge.

The extractive answer is presented once through the exact grounded quote cards, introduced by «Найдено подтверждение в документации. Ответ ниже составлен из точных цитат.». The CLI answer's Markdown/JSON citation serialization is not rendered as default prose; source identifiers/revisions remain under disclosure. This is a display projection of validated claims, not a synthesized summary or a change to the primary result/evidence.

Cancellation is a reversible stop request for the active teaching run; no destructive confirmation dialog. New submissions replace only local visible results after the new run is created. No browser storage/history is created, and disconnect/reconnect never submits the question again.

## UI Considerations

The [authored surfaces](08-UI-ELEMENTS.json) explicitly classify each surface with the union of its actual kinds, avoiding heuristic omissions. The compiled GSD probe will produce the state inventory; all applicable categories below have concrete acceptance criteria rather than silent dismissals.

| Category | Elements | Status | Resolution |
|---|---|---|---|
| empty | E1,E2,E3 | covered | Empty question shows labelled validation; timeline/answer render the exact empty copy above; no fake run/answer. |
| loading | E1,E2,E3,E4,E5 | covered | Pending create/run/reconnect/cancel states have text status; active form/examples prevent duplicate submission; cancellation remains available until terminal. Details remain readable. |
| error | E1,E2,E3,E4,E5 | covered | Create/network/protocol/domain/cancel failures have separate fixed copy and explicit retry path. Received steps are retained on interrupted transport; no success is inferred without a valid terminal. |
| populated | E2,E3 | covered | Real ordered timeline rows and validated answer/citation cards render after execution; no synthetic progress delay. |
| partial | E1,E2,E3 | covered | Invalid input retains typed content; partial streams retain accepted steps; an answer is provisional until completion. An absent citation never becomes a fake source. |
| overflow | E1,E2,E3,E4,E5 | covered | At 360px all cards/controls/quotes/IDs wrap without page overflow; long answers expand vertically; only textarea editing may scroll internally. |
| zero-one-many | E2,E3 | covered | Zero steps uses empty copy; one/many steps remain an ordered list; zero citations displays abstention copy and no source cards; one to three exact claims render individual cards. |
| long-text | E1,E2,E3,E4,E5 | covered | Question is bounded to 2048; accepted protocol content keeps its declared frame bounds; long words and IDs use overflow-wrap:anywhere; action labels wrap and retain a 48px target. |

## Accessibility and interaction

Native form semantics; visible textarea label; counter/helper/error connected with aria-describedby and invalid state; ordinary Enter edits the textarea, the primary button submits, and Ctrl/Cmd+Enter also submits. Controls work with keyboard and visible two-pixel focus outline plus offset. Question/examples are disabled during create/active execution, and cancel is a separate button. No input autofocus on page load. Completion focuses the answer heading once after this user-initiated run; cancel returns focus to the question; validation focuses the textarea. Reconnect never steals focus from a reader.

One concise polite atomic status region announces meaningful phases, not every repeated model frame. Error text uses an alert only for actionable failures; timeline itself is not an assertive live region. Sources use semantic blockquotes with document title and exact citation metadata under native details. Output uses Angular text interpolation, never innerHTML or executable Markdown. Motion is limited to a subtle current marker and disabled with prefers-reduced-motion. Tests verify keyboard focus, disabled actions, live status, error/abstention/long-content states and escaped hostile text; visual checks cover desktop and 360px mobile.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|---|---|---|
| none | no third-party component blocks | not applicable; native semantic elements and manual tokens |

## Checker Sign-Off

All seven specification dimensions passed the separate [inline check](08-UI-CHECK.md). The compiled [probe](08-UI-PROBE.json) resolved 30 explicit state considerations with no unresolved/unclassified row. This is not implementation verification or a human approval record. No UI dependency is installed by this document.
