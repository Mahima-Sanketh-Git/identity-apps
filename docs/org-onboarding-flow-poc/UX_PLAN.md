# Organization Onboarding — UX Plan

## Objective
- **Goal:**: Design a clear, consistent UX for organization onboarding built on the existing registration flow builder and runtime, enabling admins to author org-aware flows and end-users to onboard organizations with staged KYB verification.

## Personas
- **Console Admin:**: Creates/edits onboarding flows in the flow builder.
- **Onboarding User:**: Authenticated user who initiates organization onboarding.
- **Compliance Operator:**: Reviews KYB states and resolves verification exceptions.

## Guiding Principles
- **Clarity:**: Separate organization inputs from user inputs visually and in metadata.
- **Progressive Disclosure:**: Keep the initial org create simple; surface KYB details after creation.
- **Reuse:**: Reuse the existing builder shell and runtime model; add explicit org-mode metadata.
- **Recoverable Async:**: KYB must be resumable and observable, never block the primary create step.

## Admin (Builder) UX
- **Palette:**: Add an "Organization" category in the left palette showing org-specific resources (Org Name, Org Handler, Business Type, Dropdown, LEI/Identifier fields).
- **Resource Types:**: Provide first-class components: OrgNameInput, OrgHandlerInput, BusinessTypeDropdown, Choice, OrgAttributesBlock.
- **Drag & Drop:**: Allow dragging org components into view/forms; drop rules remain controlled by visual-flow constants.
- **Property Panel (Right):**: Introduce two tabs at the top: **User** and **Organization**. When an org component is selected, show the Organization tab by default.
- **Component Metadata:**: Each component includes a short metadata block: **Scope** (user|org|both), **ClaimKey**, **ValidationRules**, **ExecutorHints**.
- **Org Handler Behavior:**: Support toggle `Auto-generate` (default) -> shows suggested handler derived from Org Name; allow `Edit` which triggers server-side uniqueness validation with debounce.
- **Dropdowns & Choices:**: Allow admins to define option list values and whether values persist as org attributes or transient inputs (for runtime-only checks).
- **Executor Binding UI:**: For execution steps, expose executor name and meta fields in the property panel; show a small badge when the executor is org-aware.
- **Right Pane Preview:**: Add a compact preview of how the right-side resource pane will appear during runtime, toggled by a preview button.

## Runtime (Onboarding) UX — End-user
- **Entry:**: Onboarding starts from an authenticated user portal: clear header/trust signals (company branding, privacy note).
- **Minimal First Stage:**: Request minimal required fields (org name, contact email/handler); show Auto-generate handler suggestion inline.
- **Validation:**: Inline validation for duplicates and format; blocking validation only for required fields.
- **Create Confirmation:**: On success show Organization created confirmation, owner-binding details, and KYB verification pending status if applicable.
- **KYB Progress:**: Expose a verification timeline (Pending → In Progress → Verified / Needs Attention). Show provider and reference IDs and expected ETA when available.
- **Notifications:**: Email and in-app notifications for important KYB events (failure, manual review required, verified).
- **Retry / Manual Upload:**: For KYB failures, provide explicit steps: retry, upload documents, contact support, or request manual review.

## Async KYB & State Machine UX
- **Non-blocking flow:**: The create step returns immediately; KYB runs asynchronously with a job ID stored on the organization record.
- **Status Endpoint:**: Provide a status UI at `/orgs/{orgId}/verification` showing current state, last update, and actions (retry, cancel, provide docs).
- **Operator View:**: Compliance operators see a queue view with org name, owner, provider, referenceId, and action buttons.

## Validation & Edge Cases
- **Duplicate Org / Handler:**: Show clear inline error and suggestions (e.g., handler-2). Allow admin override in builder.
- **Authenticated User Already In Org:**: Block or surface explicit confirm dialog when a user attempts to create a new org while already owning/being member of another org (policy-driven).
- **Partial Failure / Rollback:**: If org creation partially fails after async side-effects, display a remediation page with logs and steps to recover.
- **Security:**: Mask sensitive verification artifacts; require appropriate roles to view verification evidence.

## Accessibility & Localization
- **A11y:**: Ensure all new inputs follow WCAG 2.1 AA: labels, ARIA, focus order, keyboard operability.
- **i18n:**: All labels, error messages, and provider messages must be translatable via the existing i18n pipeline.

## Analytics & Signals
- **Events:**: Track builder events (added org component, set Auto-generate off), runtime events (org_create_attempt, org_create_success, kyb_status_change), and error rates.
- **KPIs:**: Time-to-create, KYB pass rate, manual review rate, owner-binding failures.

## Data & Persistence Decisions (UX-facing)
- **Transient vs Durable:**: Treat builder metadata and flow inputs as definition-level. Treat user-entered org attributes used for creation as the durable organization payload. Treat KYB verification records as separate documents linked to the org.
- **Editable Post-Create:**: Allow org attributes to be updated after creation, but prevent changing immutable keys (e.g., org handler) unless explicitly allowed and audited.

## Rollout Plan (Phases)
- **Stage 1 — Minimal Create:**: Implement builder resources, org-handler auto-generation, and synchronous org creation (no KYB). Validate end-to-end create + owner binding.
- **Stage 2 — Async KYB:**: Add KYB executor metadata, status UI, notifications, and operator queue.
- **Stage 3 — UX polish:**: Add previews, tooling for admins to define dropdown options, analytics dashboards, and error remediation flows.
- **Stage 4 — Extend:**: Add multi-step org onboarding templates, conditional branching, and integration with external contract systems.

## Deliverables & Next Steps
- **Design artifacts:**: Low-fidelity mockups for: builder palette change, right property pane with User/Organization tabs, runtime create screen, KYB status page.
- **Prototype:**: Interactive prototype in the console dev server using feature flag toggles.
- **Usability test:**: 3-5 sessions for admin authors and 5 sessions for onboarding users focusing on ambiguity in org-handler editing and KYB feedback.
- **Dev handoff:**: Annotated component list mapping to files: resource-panel, resource-property-panel, transform-flow, steps.json, and runtime status endpoints.

---
Notes: align final wording of owner-binding, immutable fields, and verification retention policy with backend/security stakeholders before Stage 2.
