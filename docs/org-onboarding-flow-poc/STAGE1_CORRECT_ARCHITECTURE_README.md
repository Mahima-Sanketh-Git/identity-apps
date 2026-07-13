# Stage 1 POC — Correct Architecture: Org Create View Step

> **This replaces the earlier STAGE1_ORG_CREATE_EXECUTOR_README.md approach.**
> The previous approach added `OrgCreateExecutor` as a separate draggable EXECUTION node.
> That is the wrong pattern for internal actions. This document explains the correct pattern.

---

## Why the Previous Approach Was Wrong

The earlier approach added `OrgCreateExecutor` as a standalone `EXECUTION` step that an admin would
drag onto the canvas as a separate node. That pattern is designed for **external connectors** —
things like calling a GLEIF API, a KYB service, or any external HTTP endpoint.

For **internal actions** that directly call a WSO2 service (like creating an organization or
provisioning a password), the correct pattern is to wire the executor **to the submit button
inside a VIEW step**.

---

## The Correct Mental Model

Look at the existing `Username + Password View` step in
[steps.json](file:///Users/mahimam/Desktop/wso2/core/identity-apps/features/admin.registration-flow-builder.v1/data/steps.json):

```
VIEW step: "Username + Password View"
  └── FORM
       ├── INPUT (TEXT)     → identifier: "http://wso2.org/claims/username"
       ├── INPUT (PASSWORD) → identifier: "password"
       └── BUTTON (PRIMARY)
             └── action: { type: "EXECUTOR", executor: { name: "PasswordProvisioningExecutor" } }
```

When the user clicks Submit:
- Flow engine reads `password` from user input
- Calls `PasswordProvisioningExecutor.execute(context)`
- Executor internally provisions the password
- Returns `COMPLETE` → flow moves forward

**Your org create step must follow the exact same shape:**

```
VIEW step: "Organization Registration View"
  └── FORM
       ├── INPUT (TEXT) → identifier: "organization.name"
       └── BUTTON (PRIMARY)
             └── action: { type: "EXECUTOR", executor: { name: "OrgCreateExecutor" } }
```

When the user clicks Submit:
- Flow engine reads `organization.name` from user input
- Calls `OrgCreateExecutor.execute(context)`
- Executor calls `OrganizationManager.addOrganization()`
- Returns `COMPLETE` → flow moves forward

---

## What You Will Build

| # | Piece | File | Action |
|---|-------|------|--------|
| 1 | `"Organization Registration View"` step template | [steps.json](file:///Users/mahimam/Desktop/wso2/core/identity-apps/features/admin.registration-flow-builder.v1/data/steps.json) | **Edit** — replace wrong EXECUTION entry, add correct VIEW entry |
| 2 | `OrgCreateExecutor` constant | [registration-flow-executor-constants.ts](file:///Users/mahimam/Desktop/wso2/core/identity-apps/features/admin.registration-flow-builder.v1/constants/registration-flow-executor-constants.ts) | **Edit** — add constant |
| 3 | Maven dependency | [pom.xml](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/pom.xml) | **Edit** |
| 4 | `OrganizationManager` injection into DataHolder | [FlowExecutionEngineDataHolder.java](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/src/main/java/org/wso2/carbon/identity/flow/execution/engine/internal/FlowExecutionEngineDataHolder.java) | **Edit** |
| 5 | `OrganizationManager` OSGi reference binding | [FlowExecutionEngineServiceComponent.java](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/src/main/java/org/wso2/carbon/identity/flow/execution/engine/internal/FlowExecutionEngineServiceComponent.java) | **Edit** |
| 6 | `OrgCreateExecutor.java` | `carbon-identity-framework` execution engine | **New** |

---

## Change 1 — Fix steps.json (Frontend)

**File**: [steps.json](file:///Users/mahimam/Desktop/wso2/core/identity-apps/features/admin.registration-flow-builder.v1/data/steps.json)

**Step 1a**: Remove the wrong EXECUTION entry added earlier (around lines 180–204):

```json
// DELETE THIS — wrong pattern for an internal action:
{
    "resourceType": "STEP",
    "category": "WORKFLOW",
    "type": "EXECUTION",
    "display": { "label": "Create Organization", ... },
    "data": { "action": { "executor": { "name": "OrgCreateExecutor" } } }
}
```

**Step 1b**: Add the correct VIEW entry:

```json
{
    "resourceType": "STEP",
    "category": "INTERFACE",
    "type": "VIEW",
    "version": "0.1.0",
    "deprecated": false,
    "display": {
        "label": "Organization Registration View",
        "image": "assets/images/icons/organization.svg",
        "showOnResourcePanel": true
    },
    "config": {},
    "data": {
        "components": [
            {
                "category": "BLOCK",
                "type": "FORM",
                "config": {},
                "id": "{{ID}}",
                "components": [
                    {
                        "id": "{{ID}}",
                        "category": "FIELD",
                        "type": "INPUT",
                        "variant": "TEXT",
                        "config": {
                            "type": "text",
                            "hint": "Enter your organization name",
                            "label": "Organization Name",
                            "required": true,
                            "placeholder": "e.g. Acme Corporation",
                            "identifier": "organization.name"
                        }
                    },
                    {
                        "id": "{{ID}}",
                        "category": "ACTION",
                        "type": "BUTTON",
                        "variant": "PRIMARY",
                        "config": {
                            "type": "submit",
                            "text": "Create Organization"
                        },
                        "action": {
                            "type": "EXECUTOR",
                            "executor": {
                                "name": "OrgCreateExecutor"
                            }
                        }
                    }
                ]
            }
        ]
    }
}
```

**Key differences from the wrong approach:**

| Field | Wrong (before) | Correct (now) |
|-------|---------------|---------------|
| `type` | `"EXECUTION"` | `"VIEW"` |
| `category` | `"WORKFLOW"` | `"INTERFACE"` |
| Executor wiring | Top-level step action | Button action inside FORM |
| Input capture | No input field | `INPUT` field with `identifier: "organization.name"` |

**Done check**:
1. Restart the console dev server
2. Open the flow builder
3. You should see **"Organization Registration View"** in the resource panel under INTERFACE
4. Drag it — it shows a form with an org name field + "Create Organization" button
5. Connect it to START and END, click Publish
6. In the Network tab, the PUT payload should contain a `VIEW` type step with `OrgCreateExecutor` on the button

---

## Change 2 — Add Executor Constant (Frontend)

**File**: [registration-flow-executor-constants.ts](file:///Users/mahimam/Desktop/wso2/core/identity-apps/features/admin.registration-flow-builder.v1/constants/registration-flow-executor-constants.ts)

```typescript
// Add this line alongside the existing constants:
public static readonly ORG_CREATE_EXECUTOR: string = "OrgCreateExecutor";
```

---

## Change 3 — Add Maven Dependency (Backend)

**File**: [pom.xml](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/pom.xml)

Add inside `<dependencies>`:
```xml
<dependency>
    <groupId>org.wso2.carbon.identity.organization.management.core</groupId>
    <artifactId>org.wso2.carbon.identity.organization.management.service</artifactId>
    <scope>provided</scope>
</dependency>
```

Add inside `<Import-Package>` in the bundle plugin:
```xml
org.wso2.carbon.identity.organization.management.service;
version="${org.wso2.carbon.identity.organization.management.core.version.range}",
org.wso2.carbon.identity.organization.management.service.model;
version="${org.wso2.carbon.identity.organization.management.core.version.range}",
org.wso2.carbon.identity.organization.management.service.constant;
version="${org.wso2.carbon.identity.organization.management.core.version.range}",
```

> **`provided` scope** means: compile against the API, but do not bundle it — the OSGi container
> provides the actual implementation at runtime from `identity-organization-management-core`.

---

## Change 4 — Add OrganizationManager to DataHolder (Backend)

**File**: [FlowExecutionEngineDataHolder.java](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/src/main/java/org/wso2/carbon/identity/flow/execution/engine/internal/FlowExecutionEngineDataHolder.java)

Add import:
```java
import org.wso2.carbon.identity.organization.management.service.OrganizationManager;
```

Add field + getter/setter (after the existing fields):
```java
private OrganizationManager organizationManager;

public OrganizationManager getOrganizationManager() {
    return organizationManager;
}

public void setOrganizationManager(OrganizationManager organizationManager) {
    this.organizationManager = organizationManager;
}
```

---

## Change 5 — Bind OrganizationManager OSGi Reference (Backend)

**File**: [FlowExecutionEngineServiceComponent.java](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/src/main/java/org/wso2/carbon/identity/flow/execution/engine/internal/FlowExecutionEngineServiceComponent.java)

Add import:
```java
import org.wso2.carbon.identity.organization.management.service.OrganizationManager;
```

Add `@Reference` binding (follow the same pattern as `setRealmService`):
```java
@Reference(
        name = "OrganizationManager",
        service = OrganizationManager.class,
        cardinality = ReferenceCardinality.MANDATORY,
        policy = ReferencePolicy.DYNAMIC,
        unbind = "unsetOrganizationManager")
protected void setOrganizationManager(OrganizationManager organizationManager) {

    LOG.debug("Setting the Organization Manager in the Flow Engine component.");
    FlowExecutionEngineDataHolder.getInstance().setOrganizationManager(organizationManager);
}

protected void unsetOrganizationManager(OrganizationManager organizationManager) {

    LOG.debug("Unsetting the Organization Manager in the Flow Engine component.");
    FlowExecutionEngineDataHolder.getInstance().setOrganizationManager(null);
}
```

> We do **not** touch `identity-organization-management-core` at all.
> The OSGi container automatically calls `setOrganizationManager()` when the bundle starts,
> injecting the service that `identity-organization-management-core` has already published.

---

## Change 6 — Create OrgCreateExecutor.java (Backend)

**File to create**:
```
components/flow-orchestration-framework/
  org.wso2.carbon.identity.flow.execution.engine/
    src/main/java/org/wso2/carbon/identity/flow/execution/engine/
      graph/executor/
        OrgCreateExecutor.java
```

```java
/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com)
 * Stage 1 POC: Organization Create Executor — Project 671
 */
package org.wso2.carbon.identity.flow.execution.engine.graph.executor;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.wso2.carbon.identity.flow.execution.engine.exception.FlowEngineException;
import org.wso2.carbon.identity.flow.execution.engine.graph.Executor;
import org.wso2.carbon.identity.flow.execution.engine.internal.FlowExecutionEngineDataHolder;
import org.wso2.carbon.identity.flow.execution.engine.model.ExecutorResponse;
import org.wso2.carbon.identity.flow.execution.engine.model.FlowExecutionContext;
import org.wso2.carbon.identity.organization.management.service.OrganizationManager;
import org.wso2.carbon.identity.organization.management.service.constant.OrganizationManagementConstants;
import org.wso2.carbon.identity.organization.management.service.model.Organization;

import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Executor that automatically creates an organization when the flow engine processes
 * a VIEW step whose submit button action is wired to "OrgCreateExecutor".
 *
 * Pattern mirrors PasswordProvisioningExecutor:
 *   PasswordProvisioningExecutor  reads "password"           → provisions password
 *   OrgCreateExecutor             reads "organization.name"  → creates organization
 */
public class OrgCreateExecutor implements Executor {

    private static final Log LOG = LogFactory.getLog(OrgCreateExecutor.class);

    // Must exactly match the "executor.name" value in the button action in steps.json
    private static final String EXECUTOR_NAME = "OrgCreateExecutor";

    // Must match the "identifier" on the org name INPUT field in the VIEW step
    private static final String ORG_NAME_CLAIM = "organization.name";

    // Keys written into flow context after successful creation (available to later steps)
    private static final String CTX_ORG_ID   = "org.created.id";
    private static final String CTX_ORG_NAME = "org.created.name";

    @Override
    public String getName() {
        return EXECUTOR_NAME;
    }

    @Override
    public ExecutorResponse execute(FlowExecutionContext context) throws FlowEngineException {

        LOG.info("[ORG-CREATE-POC] OrgCreateExecutor triggered.");

        // Step 1: Read organization name from user input.
        // This is the value the user typed into the "Organization Name" INPUT field.
        // The field identifier in steps.json is "organization.name" — that is the key used here.
        String orgName = null;
        if (context.getUserInputData() != null) {
            Object raw = context.getUserInputData().get(ORG_NAME_CLAIM);
            if (raw != null) {
                orgName = raw.toString().trim();
            }
        }

        if (orgName == null || orgName.isEmpty()) {
            LOG.warn("[ORG-CREATE-POC] organization.name claim not found in user input.");
            ExecutorResponse response = new ExecutorResponse();
            response.setResult("RETRY");
            response.setErrorMessage("Please provide a valid organization name.");
            return response;
        }

        // Step 2: Call OrganizationManager to create the organization.
        try {
            String createdOrgId = createOrganization(orgName);

            // Step 3: Store the result in flow context for subsequent steps if needed.
            ExecutorResponse response = new ExecutorResponse();
            response.setResult("COMPLETE");

            Map<String, Object> props = new HashMap<>();
            props.put(CTX_ORG_ID, createdOrgId);
            props.put(CTX_ORG_NAME, orgName);
            response.setContextProperties(props);

            LOG.info("[ORG-CREATE-POC] Organization created. Name: " + orgName + " | ID: " + createdOrgId);
            return response;

        } catch (Exception e) {
            LOG.error("[ORG-CREATE-POC] Failed to create organization: " + orgName, e);
            ExecutorResponse response = new ExecutorResponse();
            response.setResult("RETRY");
            response.setErrorMessage("Failed to create organization: " + e.getMessage());
            return response;
        }
    }

    /**
     * Calls OrganizationManager (from identity-organization-management-core) to create the org.
     *
     * OrganizationManager is an OSGi service contributed by identity-organization-management-core.
     * We access it via FlowExecutionEngineDataHolder, which gets it injected automatically
     * by the OSGi container via FlowExecutionEngineServiceComponent.
     *
     * We do NOT modify identity-organization-management-core at all — we are purely a consumer.
     */
    private String createOrganization(String orgName) throws Exception {

        OrganizationManager orgManager = FlowExecutionEngineDataHolder.getInstance().getOrganizationManager();
        if (orgManager == null) {
            throw new Exception("OrganizationManager OSGi service is not available. " +
                    "Check that identity-organization-management-core bundle is deployed.");
        }

        // Build Organization object — same model used by the /organizations Console UI
        Organization org = new Organization();
        org.setName(orgName);
        org.setDescription("Organization self-registered via onboarding flow.");
        org.setStatus(OrganizationManagementConstants.OrganizationStatus.ACTIVE.toString());
        org.setType(OrganizationManagementConstants.OrganizationTypes.TENANT.toString());
        org.setCreated(Instant.now());
        org.setLastModified(Instant.now());

        // Auto-generate org handle from the name (e.g. "Acme Corp" -> "acme-corp")
        // Same logic used in the manual org creation UI at /organizations path
        String handle = orgName.toLowerCase()
                .replaceAll("[^a-z0-9]", "-")
                .replaceAll("-+", "-");
        if (handle.endsWith("-")) {
            handle = handle.substring(0, handle.length() - 1);
        }
        org.setOrganizationHandle(handle);

        // Parent = SUPER_ORG_ID creates a root-level organization
        // (same parent used when creating an org manually from the Console)
        org.getParent().setId(OrganizationManagementConstants.SUPER_ORG_ID);

        Organization createdOrg = orgManager.addOrganization(org);
        return createdOrg.getId();
    }

    @Override
    public List<String> getInitiationData() {
        return Collections.emptyList();
    }

    @Override
    public ExecutorResponse rollback(FlowExecutionContext context) throws FlowEngineException {
        // Stage 2: delete the org if a later step (e.g. KYB verification) fails
        LOG.info("[ORG-CREATE-POC] Rollback called — no-op for Stage 1 POC.");
        ExecutorResponse response = new ExecutorResponse();
        response.setResult("COMPLETE");
        return response;
    }
}
```

---

## The Flow You Are Building

```
START
  |
  v
VIEW: "Organization Registration View"      <-- Your new VIEW step
  |  - Text field (identifier: organization.name)
  |  - "Create Organization" button -> action: EXECUTOR -> OrgCreateExecutor
  |    (on COMPLETE)
  v
END  (or USER_ONBOARD if also registering a user)
```

When the user submits:
1. Flow engine receives `{ "organization.name": "Acme Corp" }` in user input data
2. Engine sees the button action is `EXECUTOR` → `OrgCreateExecutor`
3. `OrgCreateExecutor.execute(context)` is called
4. Reads `"Acme Corp"` from `context.getUserInputData().get("organization.name")`
5. Calls `OrganizationManager.addOrganization()` — org created in the database
6. Returns `COMPLETE` — flow moves to END

---

## Build and Test

### Build the backend

```bash
cd carbon-identity-framework

mvn clean install \
  -pl components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine \
  -am \
  -DskipTests

cp components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/target/*.jar \
   $IS_HOME/repository/components/dropins/
```

### Test via curl

**Start the flow:**
```bash
curl -k -X POST 'https://localhost:9443/api/server/v1/flow/execute' \
  -H 'Content-Type: application/json' \
  -d '{"flowType": "REGISTRATION", "inputs": {}}'
```

**Submit org name:**
```bash
curl -k -X POST 'https://localhost:9443/api/server/v1/flow/execute' \
  -H 'Content-Type: application/json' \
  -d '{
    "flowType": "REGISTRATION",
    "flowId": "<flowId>",
    "actionId": "<submit button id>",
    "inputs": { "organization.name": "Acme Corp" }
  }'
```

**Expected logs:**
```
[ORG-CREATE-POC] OrgCreateExecutor triggered.
[ORG-CREATE-POC] Organization created. Name: Acme Corp | ID: <uuid>
```

**Verify**: Go to `/organizations` in Console — "Acme Corp" should appear.

---

## Done Checklist

- [ ] Wrong EXECUTION step for `OrgCreateExecutor` removed from `steps.json`
- [ ] New VIEW step appears in resource panel under INTERFACE
- [ ] PUT payload shows `VIEW` type step with `organization.name` field and `OrgCreateExecutor` on button
- [ ] `ORG_CREATE_EXECUTOR` constant added to executor constants file
- [ ] Server starts without OSGi errors
- [ ] `OrgCreateExecutor triggered` appears in logs on flow execute
- [ ] API returns `COMPLETE` with org name provided
- [ ] API returns `RETRY` with empty org name
- [ ] Organization appears in Console `/organizations` list

---

## File Locations Quick Reference

| File | Repo | Action |
|------|------|--------|
| [steps.json](file:///Users/mahimam/Desktop/wso2/core/identity-apps/features/admin.registration-flow-builder.v1/data/steps.json) | identity-apps | Remove wrong EXECUTION entry; add correct VIEW entry |
| [registration-flow-executor-constants.ts](file:///Users/mahimam/Desktop/wso2/core/identity-apps/features/admin.registration-flow-builder.v1/constants/registration-flow-executor-constants.ts) | identity-apps | Add `ORG_CREATE_EXECUTOR` constant |
| [pom.xml](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/pom.xml) | carbon-identity-framework | Add dependency + Import-Package |
| [FlowExecutionEngineDataHolder.java](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/src/main/java/org/wso2/carbon/identity/flow/execution/engine/internal/FlowExecutionEngineDataHolder.java) | carbon-identity-framework | Add OrganizationManager field + getter/setter |
| [FlowExecutionEngineServiceComponent.java](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/src/main/java/org/wso2/carbon/identity/flow/execution/engine/internal/FlowExecutionEngineServiceComponent.java) | carbon-identity-framework | Add @Reference binding for OrganizationManager |
| OrgCreateExecutor.java (new) | carbon-identity-framework | Create in `graph/executor/` package |

---

## What Comes After Stage 1

```
Stage 2 flow:
  VIEW (org name) -> OrgCreateExecutor -> KYB_VERIFY (EXECUTION + external connector) -> END
```

KYB verification IS a proper EXECUTION step (not VIEW) because it calls an external GLEIF/KYB API.
That is exactly the use case EXECUTION + external connector is designed for.
Stage 1 proves the org creation plumbing. Stage 2 adds external KYB verification on top.
