# ADR-0012 — Isolate the Angular Build Toolchain

- Status — Selected for Phase 8 implementation; architectural review pending
- Date — 2026-11-15
- Extends — ADR-0011; preserves the existing core package/pins and checked import boundary

## Evidence and decision

The [official Angular compatibility table](https://angular.dev/reference/versions) and exact npm metadata checked on 2026-11-15 require TypeScript >=6.0 <6.1 for Angular 22. The existing Node.js core package pins TypeScript 7.0.2. Forcing peers or downgrading that accepted core toolchain would violate a declared compatibility boundary.

Keep the existing root package, lockfile, Node.js 24 runtime, TypeScript 7, Vitest 5.0.2, and no-framework domain/application checks unchanged. Add one isolated ui package/lockfile under the same repository with official Angular CLI application/AOT and unit-test builders, TypeScript 6.0.3, Tailwind/PostCSS, and the exact admitted pins. This changes the Phase 1 minimal single-package build shape only when its deferred Angular adapter is introduced; it does not split the core into packages or introduce a monorepo framework/workspace manager.

The UI may import only the browser-safe stream contracts, pure stream reducer and their domain dependencies from the root source. It must not import Node composition/outbound adapters, database/MCP/provider SDKs, process globals, or filesystem code. Import checks enforce this allowlist and the reverse core boundary. Root npm ci remains a prerequisite for shared contract dependencies; ui npm ci installs its own compatible build toolchain. Root validation keeps its original behavior; an explicit combined validation command checks both packages. No force, legacy peer bypass, custom Angular compiler fork, or runtime JIT workaround is accepted.

Use official standalone Angular, explicit zoneless change detection, strict templates, AOT production build, and CLI-supported Vitest/jsdom tests. No SSR, router, component library, forms package, icon package, external font, React, or Next.js is needed for the one-screen inspector. Tailwind follows its official Angular/PostCSS integration. Native semantic elements and a checked manual design contract provide layout/accessibility.

## Hosting and privacy

The UI development server binds loopback and proxies relative /api requests to the loopback engine, preserving the browser Host/Origin relationship. No CORS wildcard is added. A production UI build is a static artifact, not an authorization/deployment decision. No remote publication or new server dependency is part of this step.

Browser state holds one current question/run in memory, with no local/session storage, history database, analytics, remote resources, or service worker. It consumes the bounded typed protocol and shared reducer; output is text interpolation rather than executable HTML/Markdown. Reconnect never repeats create. Cancellation and late completion retain ADR-0011 semantics. Client retries are limited to reconnecting the read stream, never retrying execution/actions automatically.

## Admission and limits

The separate [UI dependency record](../../reviews/UI-08-dependencies.json) records exact candidates and their verified upstream provenance before installation, under the user's continuing implementation authorization. Package admission for implementation is not human architectural approval. Optional peer packages are not automatically promoted to direct dependencies. Lockfile/integrity and no-unadmitted-direct-dependency checks precede final review.

The second build/lockfile adds installation cost and duplicate tooling, accepted to keep both official compatibility contracts honest. Root-only validation does not claim to validate the Angular build; use the documented combined check. Browser visual/a11y behavior needs real rendered verification in addition to jsdom. The local course host has no remote authentication, tenant isolation, production CSP/deployment, or SLO claim.

## Primary references

[Angular testing](https://angular.dev/guide/testing) documents the CLI's Vitest/jsdom path. [Angular build system](https://angular.dev/tools/cli/build-system-migration) documents the supported application builder. [Tailwind Angular setup](https://tailwindcss.com/docs/installation/framework-guides/angular) documents its PostCSS integration. Build isolation, import policy, privacy, and admission above are project decisions.
