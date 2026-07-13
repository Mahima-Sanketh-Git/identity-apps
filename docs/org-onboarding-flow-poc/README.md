# Organization Onboarding Flow PoC README

This guide is a learning map for Project 671: organization onboarding flow orchestration with KYB integration. It focuses on the `identity-apps` frontend repo and how it connects to the Java backend flow runtime.

The shortest mental model:

```text
Console route
  -> feature package page
  -> flow-specific builder provider
  -> reusable flow-builder-core UI
  -> React Flow nodes/edges
  -> transform to backend flow payload
  -> PUT /api/server/v1/flow
  -> Java service stores and executes the configured flow
```

For the PoC, do not try to build the full product at once. Build on the current self-registration flow and prove that a configured "KYB verification" step can be added, persisted, and represented in the payload sent to the backend.

## Repo Map

Important directories:

- `apps/console`: Admin console app. Routes are registered here.
- `apps/myaccount`: End-user self-service portal.
- `features/admin.flows.v1`: Flow list page and flow type metadata.
- `features/admin.flow-builder-core.v1`: Shared drag-and-drop flow builder.
- `features/admin.registration-flow-builder.v1`: Self-registration builder. This is your main reference for the PoC.
- `features/admin.organizations.v1`: Current organization list, create, edit, role, and API code.
- `features/admin.webhooks.v1`: Existing webhook UI feature area.
- `features/admin.actions.v1`: Existing action/extension concepts that are close to flow extensions.
- `modules/core`, `modules/i18n`, `modules/theme`, `modules/forms`: Shared platform modules.
- `identity-apps-core`: JSP portals. Useful later if the actual self-service execution UI touches legacy portals.

## Flow Builder Packages

### Flow List

Start with:

- `features/admin.flows.v1/data/flows.json`
- `features/admin.flows.v1/models/flows.ts`
- `features/admin.flows.v1/pages/flows-page.tsx`
- `features/admin.flows.v1/components/flow-list.tsx`

Today the known flow types are:

```ts
export enum FlowTypes {
    REGISTRATION = "REGISTRATION",
    PASSWORD_RECOVERY = "PASSWORD_RECOVERY",
    INVITED_USER_REGISTRATION = "INVITED_USER_REGISTRATION",
}
```

For a real organization onboarding product, you would likely add a new flow type such as `ORGANIZATION_ONBOARDING`. For a 5-day PoC, it is safer to reuse `REGISTRATION` first and add one organization/KYB-specific execution step.

### Registration Builder

Use this package as the blueprint:

- `features/admin.registration-flow-builder.v1/pages/registration-flow-builder-page.tsx`
- `features/admin.registration-flow-builder.v1/components/registration-flow-builder.tsx`
- `features/admin.registration-flow-builder.v1/components/registration-flow-builder-core.tsx`
- `features/admin.registration-flow-builder.v1/providers/registration-flow-builder-provider.tsx`
- `features/admin.registration-flow-builder.v1/utils/transform-flow.ts`
- `features/admin.registration-flow-builder.v1/data/steps.json`
- `features/admin.registration-flow-builder.v1/data/elements.json`
- `features/admin.registration-flow-builder.v1/data/templates.json`
- `features/admin.registration-flow-builder.v1/constants/registration-flow-executor-constants.ts`

The important pattern is:

1. Builder fetches existing flow using `useGetRegistrationFlow`.
2. Builder fetches available resources using `useGetRegistrationFlowBuilderResources`.
3. UI renders nodes and edges with `@xyflow/react`.
4. Admin drags steps/elements/widgets into the canvas.
5. Provider calls `toObject()` from React Flow.
6. `transformFlow(flow)` converts visual state into backend `steps`.
7. `configureRegistrationFlow(payload)` sends the result to `store.getState().config.endpoints.registrationFlow`.

### Flow Builder Core

Core package files to understand:

- `features/admin.flow-builder-core.v1/components/flow-builder.tsx`
- `features/admin.flow-builder-core.v1/components/visual-flow/decorated-visual-flow.tsx`
- `features/admin.flow-builder-core.v1/components/visual-flow/visual-flow.tsx`
- `features/admin.flow-builder-core.v1/components/resource-panel/resource-panel.tsx`
- `features/admin.flow-builder-core.v1/components/resource-property-panel/resource-property-panel.tsx`
- `features/admin.flow-builder-core.v1/models/steps.ts`
- `features/admin.flow-builder-core.v1/models/elements.ts`
- `features/admin.flow-builder-core.v1/models/actions.ts`
- `features/admin.flow-builder-core.v1/models/resources.ts`

Core knows how to drag, drop, connect, select, delete, and edit resources. Flow-specific packages decide what resources exist, what properties are shown, how validation works, and how publish transforms the final flow.

## Flow Data Model

The builder is centered around `Step` resources.

Common step types:

```ts
export enum StepTypes {
    View = "VIEW",
    Rule = "RULE",
    Execution = "EXECUTION",
    End = "END",
}
```

Static step types:

```ts
export enum StaticStepTypes {
    UserOnboard = "USER_ONBOARD",
    Start = "START",
}
```

A typical view step contains UI components:

```json
{
    "resourceType": "STEP",
    "category": "INTERFACE",
    "type": "VIEW",
    "data": {
        "components": [
            {
                "category": "BLOCK",
                "type": "FORM",
                "components": []
            }
        ]
    }
}
```

A typical executor step contains an action:

```json
{
    "resourceType": "STEP",
    "category": "WORKFLOW",
    "type": "EXECUTION",
    "display": {
        "label": "Flow Extension",
        "showOnResourcePanel": true
    },
    "data": {
        "action": {
            "type": "EXECUTOR",
            "executor": {
                "name": "FlowExtensionExecutor",
                "meta": {
                    "actionId": ""
                }
            },
            "next": ""
        }
    }
}
```

For a KYB PoC, a possible first step is to add a new execution resource in `features/admin.registration-flow-builder.v1/data/steps.json`:

```json
{
    "resourceType": "STEP",
    "category": "WORKFLOW",
    "type": "EXECUTION",
    "version": "0.1.0",
    "deprecated": false,
    "display": {
        "label": "KYB Verification",
        "image": "assets/images/icons/flow-extension.svg",
        "showOnResourcePanel": true
    },
    "data": {
        "action": {
            "type": "EXECUTOR",
            "executor": {
                "name": "KYBVerificationExecutor",
                "meta": {
                    "provider": "GLEIF",
                    "leiClaim": "organization.lei",
                    "async": true
                }
            },
            "next": ""
        }
    }
}
```

The backend must understand `KYBVerificationExecutor`. If it does not, the frontend can still prove that the step is configurable and persisted, but runtime execution will fail or be ignored depending on Java-side behavior.

## Organization Management Context

Current organization UI lives in:

- `features/admin.organizations.v1/pages/organizations.tsx`
- `features/admin.organizations.v1/components/add-organization-modal.tsx`
- `features/admin.organizations.v1/components/organization-list.tsx`
- `features/admin.organizations.v1/api/organization.ts`
- `features/admin.organizations.v1/models/organizations.ts`

Useful model fields:

```ts
export interface AddOrganizationInterface {
    name: string;
    orgHandle?: string;
    description: string;
    type: string;
    parentId: string;
    attributes?: OrganizationAttributesInterface[];
}
```

```ts
export interface OrganizationResponseInterface {
    id: string;
    name: string;
    orgHandle?: string;
    description: string;
    status: string;
    type: string;
    attributes: OrganizationAttributesInterface[];
}
```

For onboarding, you need to decide which business data is captured as organization attributes. For example:

- `businessName`
- `registrationNumber`
- `lei`
- `country`
- `website`
- `kybStatus`
- `kybProvider`
- `kybReferenceId`

In a production design, avoid storing sensitive verification raw data as plain org attributes unless the backend team agrees on storage, masking, audit, and retention.

## Frontend/Backend Contract

Registration flow APIs are configured in:

- `features/admin.registration-flow-builder.v1/config/endpoints.ts`
- `features/admin.registration-flow-builder.v1/api/configure-registration-flow.ts`
- `features/admin.registration-flow-builder.v1/api/use-get-registration-flow.ts`
- `features/admin.flow-builder-core.v1/api/update-flow-config.ts`

Current endpoint base:

```ts
registrationFlow: `${serverOrigin}/api/server/v1/flow`
```

Publish sends a payload shaped like:

```json
{
    "flowType": "REGISTRATION",
    "steps": [
        {
            "id": "view_xxx",
            "type": "VIEW",
            "position": { "x": 0, "y": 0 },
            "size": { "width": 350, "height": 400 },
            "data": {
                "components": []
            }
        },
        {
            "id": "execution_xxx",
            "type": "EXECUTION",
            "data": {
                "action": {
                    "type": "EXECUTOR",
                    "executor": {
                        "name": "KYBVerificationExecutor",
                        "meta": {}
                    },
                    "next": "end_xxx"
                }
            }
        }
    ]
}
```

The Java side normally needs:

- A flow type or runtime path that knows this is organization onboarding.
- An executor implementation for KYB or a generic extension executor.
- Connector configuration storage.
- Outbound REST call logic for GLEIF/KYB provider.
- Async state handling: pending, approved, rejected, manual review.
- Webhook endpoint to receive provider callbacks.
- A way to resume or complete the flow after async callback.

## Recommended 5-Day PoC Plan

### Day 1: Trace Existing Registration Flow

Goal: understand one working flow end to end.

Do this:

- Run Console.
- Open the self-registration flow builder.
- Drag a step, connect it, publish.
- Watch Network tab for `GET /api/server/v1/flow?flowType=REGISTRATION`.
- Watch Network tab for `PUT /api/server/v1/flow`.
- Put breakpoints in `registration-flow-builder-provider.tsx` and `transform-flow.ts`.
- Put Java breakpoints on the matching `/api/server/v1/flow` resource/controller.

Success output: you can explain where the UI payload is created and where the Java backend receives it.

### Day 2: Add a KYB Execution Step to the Builder

Goal: make "KYB Verification" appear in the resource panel.

Start with `features/admin.registration-flow-builder.v1/data/steps.json`.

Use an executor shape first:

```json
"executor": {
    "name": "KYBVerificationExecutor",
    "meta": {
        "provider": "GLEIF",
        "async": true
    }
}
```

Success output: admin can drag this step into the flow, connect it, and see it in React Flow state.

### Day 3: Persist and Read Back the KYB Step

Goal: publish the flow and reload it without losing the new step.

Check:

- `transform-flow.ts` does not strip your metadata.
- `generateSteps` resolves metadata correctly after fetch.
- Backend accepts unknown or new executor names.
- Reloading the page renders the step again.

Success output: published flow contains the KYB executor in backend storage and reopens in the builder.

### Day 4: Backend Runtime Stub

Goal: Java runtime can recognize the executor.

Implement the smallest backend behavior:

- Read organization onboarding fields from flow context.
- If `executor.name === "KYBVerificationExecutor"`, call a stub service or mock GLEIF response.
- Return a clear status such as `PENDING_REVIEW`, `APPROVED`, or `REJECTED`.
- Store the KYB reference/status in a backend-owned model.

Success output: a runtime execution reaches the KYB branch and produces a visible status.

### Day 5: Demo Flow

Goal: a mentor-friendly demo.

Demo script:

1. Admin opens flow builder.
2. Admin adds business details form.
3. Admin adds KYB Verification execution step.
4. Admin adds Pending Approval or completion step.
5. Admin publishes.
6. External organization starts onboarding.
7. Runtime shows KYB pending or approved.
8. Backend logs show KYB executor was invoked.

## Debugging Workflow

### Frontend Debugging

Use browser DevTools:

- Network tab: inspect `/api/server/v1/flow` request and response.
- React DevTools: inspect provider state and selected resource props.
- Breakpoints:
  - `registration-flow-builder-provider.tsx`
  - `registration-flow-builder-core.tsx`
  - `transform-flow.ts`
  - `decorated-visual-flow.tsx`

Useful frontend questions:

- Did the resource appear in the resource panel?
- Did drag/drop create a node?
- Did connecting create an edge?
- Did `transformFlow` convert that edge into `action.next`?
- Did metadata survive `omit(DISPLAY_ONLY_COMPONENT_PROPERTIES)`?
- Did the published payload match backend expectations?

### Java Remote Debugging

For WSO2 Identity Server backend work, remote debugging is not optional; it is your microscope.

Recommended habits:

- Keep one clean debug profile for the server.
- Use conditional breakpoints when a method is hot.
- Break on request entry first, then move inward to service and persistence layers.
- Inspect request payload objects before they are transformed.
- Inspect final persisted objects after transformation.
- Step over framework code unless you are debugging the framework itself.
- Record the class and method names you discover in your own notes.

Useful backend questions:

- Which JAX-RS/resource class receives `/api/server/v1/flow`?
- Which service validates `flowType`?
- Where are flow definitions stored?
- Which executor registry maps executor name to Java implementation?
- What happens when an executor returns pending?
- Is async state stored against a user, organization, transaction, or flow instance?
- How does a webhook locate the pending onboarding request?

## Production Java Practices To Focus On

Since you already know OOP, focus on production habits:

- Read interfaces before implementations.
- Follow existing package boundaries.
- Keep API models, service models, and persistence models separate when the codebase does.
- Prefer small, explicit DTOs over generic maps for stable contracts.
- Do not swallow exceptions; convert them to the product's existing error model.
- Log identifiers and states, not secrets or full verification payloads.
- Make external calls through existing HTTP/client abstractions.
- Put provider-specific logic behind connector interfaces.
- Make async operations idempotent. Webhooks can be retried.
- Treat status transitions as a state machine.
- Add unit tests for transformation and service logic before broad integration tests.

For KYB specifically:

- Never assume provider response means final approval unless policy says so.
- Store provider reference IDs for audit.
- Mask business identifiers where needed.
- Design manual review as a first-class state, not an error.
- Make retry behavior explicit.

## Codebase Conventions To Follow

This repo is strict about TypeScript style:

- Interfaces use the `Interface` suffix.
- Components use `FunctionComponent<PropsInterface>` and return `ReactElement`.
- Prefer explicit type annotations.
- Avoid `any`; if you must use it during a spike, clean it before review.
- Use `data-componentid`, not `data-testid`.
- Use i18n keys for user-visible text.
- New components should use Oxygen UI imports and MUI `styled` API.
- Use existing API hooks and `AsgardeoSPAClient` patterns.

Example component shape:

```tsx
interface KYBVerificationStepPropsInterface extends IdentifiableComponentInterface {
    provider: string;
}

const KYBVerificationStep: FunctionComponent<KYBVerificationStepPropsInterface> = ({
    provider,
    "data-componentid": componentId = "kyb-verification-step"
}: KYBVerificationStepPropsInterface): ReactElement => {
    return (
        <Box data-componentid={ componentId }>
            { provider }
        </Box>
    );
};
```

## Suggested First Implementation Path

For the PoC, prefer this order:

1. Add a KYB execution resource to registration builder metadata.
2. Add or reuse a property panel to configure provider and async behavior.
3. Confirm `transformFlow` keeps the executor `meta`.
4. Publish and reload.
5. Add backend executor stub.
6. Add a sample GLEIF/mock connector behind the executor.
7. Add pending approval status to the runtime flow.
8. Only then consider a separate `ORGANIZATION_ONBOARDING` flow type and dedicated route.

This keeps the demo grounded in working self-registration plumbing while leaving a clean path to the final architecture.

## Reading Checklist

Read in this order:

1. `features/admin.flows.v1/data/flows.json`
2. `apps/console/src/configs/routes.tsx`
3. `features/admin.registration-flow-builder.v1/pages/registration-flow-builder-page.tsx`
4. `features/admin.registration-flow-builder.v1/providers/registration-flow-builder-provider.tsx`
5. `features/admin.registration-flow-builder.v1/components/registration-flow-builder-core.tsx`
6. `features/admin.flow-builder-core.v1/components/visual-flow/decorated-visual-flow.tsx`
7. `features/admin.registration-flow-builder.v1/utils/transform-flow.ts`
8. `features/admin.registration-flow-builder.v1/data/steps.json`
9. `features/admin.organizations.v1/api/organization.ts`
10. Java backend classes handling `/api/server/v1/flow`

## Questions To Clarify With Mentor

- Should organization onboarding be a new flow type or an extension of self-registration for the PoC?
- Which organization fields are required for the first KYB check?
- Should the PoC call real GLEIF APIs or a mock connector?
- Where should pending onboarding state live?
- What is the expected admin review UI for pending/rejected organizations?
- Which webhook security mechanism should be used for provider callbacks?
- Is the first demo expected to execute from Console, My Account, or an external self-service portal?
