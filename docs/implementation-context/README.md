# Implementation Context — Personal Learning Notes

This folder is my own space for tracking what I've learned while working on the B2B org-onboarding PoC (Project 671). Not official docs — just notes to build my mental model of the `identity-apps` repo and the WSO2 IAM patterns behind it.

## 1. What I built: the `ORG_HANDLE` field

Added a new field variant (`ORG_HANDLE`) to the self-registration flow builder that:
- Auto-generates a URL-safe "organization handle" slug from the org name as the admin/user types.
- Lets the user edit it manually, with live format validation (first char, length, allowed characters) and an async "is this taken?" check against the backend.
- Mirrors logic that already existed in `features/admin.organizations.v1/components/add-organization-modal.tsx` (the "Add Organization" admin modal) — same regexes, same auto-generate-with-random-suffix-retry algorithm, same API contract.

The full config lives in `features/admin.registration-flow-builder.v1/data/steps.json`, inside the "Organization Onboarding View" step:
```json
{
    "category": "FIELD", "type": "INPUT", "variant": "ORG_HANDLE",
    "config": {
        "identifier": "http://wso2.org/claims/organization/handle",
        "linkedTo": "http://wso2.org/claims/organization"
    }
}
```
`linkedTo` is a new config key I introduced — it points at the sibling org-name field's `identifier`, so the handle field knows which other field's value to watch for auto-generation.

## 2. The big architectural realization: two completely separate runtimes

This was the most important thing I misunderstood at first. There isn't one "frontend" — there are **two independent React codebases** that both render parts of the identity flows, and a change in one does nothing for the other:

| | Console builder | Self-registration runtime |
|---|---|---|
| Where | `features/admin.registration-flow-builder.v1`, `features/admin.flow-builder-core.v1` | `identity-apps-core/react-ui-core` (bundled into JSP pages) |
| What it does | Lets an *admin* drag-and-drop fields onto a canvas to design the flow | Renders the *actual form* an anonymous end user fills in |
| Runs where | Console SPA (`apps/console`, port 9001) | Embedded in `identity-apps-core/apps/accounts` JSP pages, served by the WSO2 IS server itself (port 9443) — **not** by `apps/myaccount` |
| Data | Static `steps.json` → React Flow canvas → `transformFlow()` → `PUT /api/server/v1/flow` | Flow JSON fetched from the server at execution time → rendered field-by-field via `POST /api/server/v1/flow/execute` |

**Lesson**: adding `"variant": "ORG_HANDLE"` to `steps.json` only makes the field *drag-and-droppable in the console*. It does nothing for what an end user actually sees during registration — that's a completely separate rendering engine that has to be wired up independently. I originally assumed one change would cover both.

## 3. Pattern: two-level variant dispatch (shows up in both runtimes)

Both codebases use the same shape of dispatch, just with different component sets:

```
component.type ("INPUT", "BUTTON", "TYPOGRAPHY"...)
    → top-level adapter/factory picks a category renderer
        component.variant ("TEXT", "EMAIL", "ORG_HANDLE"...)
            → a switch/if-chain picks the specific leaf component
```

- **Runtime side**: `components/field.js` (`type` → `InputFieldAdapter`) → `components/adapters/input-field-adapter.js` (`variant` → `OrgHandleFieldAdapter`).
- **Builder side**: `common-element-factory.tsx` (`ElementTypes.Input` → checks `InputVariants` for a few special cases, else `DefaultInputAdapter`).

**Lesson**: when adding a new field type anywhere in this repo, first find this exact dispatch pattern for the layer I'm touching, and add one `case`/branch — don't build a new dispatch mechanism. Every other adapter (`date-field-adapter.js`, `phone-number-field-adapter.js`, `checkbox-field-adapter.js`...) follows the identical prop contract: `{ component, formState, formStateHandler, fieldErrorHandler }`, reporting value via `formStateHandler(identifier, value)` and errors via `fieldErrorHandler(identifier, errorsArrayOrNull)`. This convention is worth copying by hand once to internalize it.

## 4. Pattern: the JSP ↔ React "global context" bridge

`identity-apps-core` pages are JSP, but they mount a React bundle (`react-ui-core.min.js`) into a `<div id="react-root">`. Java-side config gets into React like this:

```
Java scriptlet builds a JsonObject (reactGlobalContext)
    → serialized to reactGlobalContextJson
        → inlined into the page's <script> as globalData prop
            → GlobalContextProvider (React context provider)
                → useGlobalContext() hook → contextData
```

I used this to pass a backend URL (`organizations.checkHandleUrl`) from Java into my adapter component, by editing the `ReactDOM.render(...)` call in `execution-flow.jsp` directly (not `flow-utils.jsp` — that file is `<jsp:directive.include>`d *before* the Java variable I needed was declared, so I couldn't use it there; had to merge the extra key into `globalData` in plain JS instead, at the point where `accountsBaseURL` was already in scope).

**Lesson**: JSP `include` directives are textual/compile-time — variable scope in the merged servlet depends on *source order*, not logical grouping. Always check where a variable is declared relative to where an included file's scriptlet runs before assuming it's visible there.

## 5. Pattern: JSP proxy endpoints for calling backend REST APIs

The browser can't always call `/api/server/v1/...` REST APIs directly from a JSP-hosted page (session/cookie/CORS reasons in this architecture). The fix used elsewhere in this codebase: a thin JSP acting as a same-origin proxy that reads the raw request body, forwards it server-side to the real REST endpoint, and streams the response back verbatim. I followed the existing `util/execution-flow-api.jsp` pattern to write `util/org-handle-check-api.jsp`.

**Open risk I haven't resolved**: `execution-flow-api.jsp` calls through a purpose-built `FlowDataRetrievalClient` (designed for anonymous flow-execution calls), but my `org-handle-check-api.jsp` does a raw `HttpURLConnection` straight to `/api/server/v1/organizations/check-handle` — which is normally an **authenticated admin/org-management API**. Self-registration users are anonymous. This *might* 401/403 against a real deployment depending on how that endpoint's permissions are configured. I built the frontend to degrade gracefully either way (treat a failed check as "uncertain, allow" rather than blocking the user), but the real fix, if it turns out to be needed, is a dedicated anonymous-safe backend endpoint — a backend/mentor question, not something I can resolve from the frontend alone.

## 6. The gotcha that cost the most time: build ≠ package ≠ deploy

Three distinct, easy-to-conflate steps, and missing any one of them means "my code change isn't showing up" even though the code is correct:

1. `pnpm build` (Nx) — compiles TS/JS, and for `identity-apps-core` specifically, runs a **webpack** build that bundles `react-ui-core/src/**` into a single `js/react-ui-core.min.js`, then copies it (plus theme assets) into `identity-apps-core/apps/accounts/src/main/webapp/`.
2. `mvn clean install` (Maven) — packages that `webapp/` directory into a deployable `.war`. This step exists in the repo but nothing here does it automatically as part of `pnpm build`.
3. **Deploy** — actually getting the updated files onto the *running* WSO2 IS server. In my case, the server's `repository/deployment/server/webapps/accounts/` is a plain exploded directory, not a symlink back into this repo — so steps 1 and 2 changed files inside the repo, but the running server kept serving stale copies until I manually `cp`'d the changed JSP/JS files over.

**Lesson**: when a change "isn't showing up" in a running server, check in this order: (a) is the change actually saved in the repo (`git status`/`git diff` — don't trust memory of a prior tool call, verify), (b) was it rebuilt, (c) was the *rebuilt output* actually deployed to wherever the server reads from. All three failed independently for me at different points in this session — including once where an edit I'd already verified via `Read` silently reverted between conversation turns, caught only by re-checking `git status` before re-deploying. Always re-verify state with `git diff`/`grep` right before acting on it, rather than trusting an earlier tool result.

## 7. How I found the real API contract (methodology, not just the answer)

I needed to know the exact request/response shape for the org-handle availability check. Instead of guessing, I traced it from a known-working caller:
`add-organization-modal.tsx` → imports `checkOrgHandleAvailability` from `features/admin.organizations.v1/api/organization.ts` → reads the `HttpRequestConfig` there → cross-checked the TypeScript request/response interfaces in `models/organizations.ts`.

Result: `POST {orgs-endpoint}/organizations/check-handle`, body `{ orgHandle: string }`, response `{ available: boolean }`. This matched what my JSP proxy was already forwarding to, which confirmed the proxy's target URL was right even before I'd wired up a real caller.

**Lesson**: when I need an API contract, find an existing feature that already calls it successfully and read backwards from the call site to the type definitions, rather than inferring from field names or writing speculative code first.

## Reading list (files worth reading slowly, not just referencing)

- `identity-apps-core/react-ui-core/src/components/adapters/text-field-adapter.js` — simplest possible adapter, good baseline before reading the more complex `org-handle-field-adapter.js`.
- `identity-apps-core/react-ui-core/src/components/field.js` and `components/adapters/input-field-adapter.js` — the two dispatch layers, runtime side.
- `features/admin.flow-builder-core.v1/components/resources/elements/common-element-factory.tsx` — the builder-side equivalent dispatch.
- `features/admin.registration-flow-builder.v1/utils/transform-flow.ts` — what survives (and what gets stripped) when a canvas gets published to the backend payload.
- `identity-apps-core/apps/accounts/src/main/webapp/execution-flow.jsp` — the JSP↔React bridge in full, plus how flow execution steps get requested/rendered in a loop.
- `docs/org-onboarding-flow-poc/README.md` and `POC_IMPLEMENTATION_PLAN.md` — the original PoC brief for this whole project; good for re-orienting on the "why" behind this work.

## Still open / to learn next

- Whether `/api/server/v1/organizations/check-handle` genuinely rejects anonymous calls on a real IS deployment — need to test against `wso2is-7.4.0-SNAPSHOT` and read server logs if it 401s.
- How the flow execution engine (Java side — `carbon-identity-framework`) actually resolves and calls executors (`OSGi` service registry lookup by name) — referenced in the PoC docs but not yet traced hands-on.
- Where `formState` itself comes from / how it's assembled across multiple fields in the same `FORM` block at runtime (`hooks/use-dynamic-form.js` — read but not yet deeply traced).
