# Stage 1 POC — Org Create Executor

> **Goal of this document**: implement the *simplest possible* thing your co-mentor asked for.
> Before touching KYB / GLEIF at all, prove that the flow engine can **automatically create an organization** the same way it automatically creates a user today.

---

## Understanding the Repositories — Carbon Identity vs. Identity Organization Management

To succeed with the implementation, it is important to understand the division of labor between the repositories/folders in your workspace:

### 1. `carbon-identity-framework` (Carbon Identity)
* **What it is**: The core, foundational framework repository for WSO2 Identity Server.
* **What it manages**: Core authentication, protocols (OIDC, SAML), standard flat tenant boundaries (traditional multi-tenancy), user stores, and the new **Flow Orchestration Engine** components (`org.wso2.carbon.identity.flow.execution.engine` and `org.wso2.carbon.identity.flow.mgt`).
* **Key limitation**: It has no native understanding of organization hierarchies or structural B2B organization nodes.

### 2. `identity-organization-management-core` (Identity Organization)
* **What it is**: The component/repository that extends the core identity framework to support **Hierarchical Organization Management**.
* **What it manages**: The B2B tenant hierarchies, sub-organizations under a parent, and sharing users or roles down the structure.
* **Key service**: It defines and registers the OSGi service **`OrganizationManager`** (`org.wso2.carbon.identity.organization.management.service.OrganizationManager`), which is the class we must use to add organizations in the database.

### How they connect in this POC
Our new `OrgCreateExecutor` will run inside the flow orchestration engine (defined under `carbon-identity-framework`). When triggered, it will resolve and call the `OrganizationManager` OSGi service (which is contributed by `identity-organization-management-core`) to create the organization.

---

## The Analogy — Read This First

The existing self-registration flow works like this:

```
User enters: username + email + password
     |
     v
Flow engine hits USER_ONBOARD node
     |
     v
UserOnboardExecutor.execute(context) is called automatically
     |
     v
User is created in the system  <-- happens without any manual step
```

What your co-mentor asked for is **the exact same pattern but for organizations**:

```
Someone enters: organization name  (inside the self-reg portal)
     |
     v
Flow engine hits ORG_CREATE node    <-- NEW step you will add
     |
     v
OrgCreateExecutor.execute(context) is called automatically   <-- NEW executor
     |
     v
Organization is created in the system  <-- happens without any manual step
```

That is Stage 1. Nothing else. No KYB. No GLEIF.
Just: **enter org name → org is auto-created**.

---

## What You Will Build

| # | Piece | Where | New or Existing |
|---|-------|-------|----------------|
| 1 | `ORG_CREATE` step resource | `steps.json` in registration-flow-builder | **Edit** |
| 2 | `OrgCreateExecutor.java` | flow execution engine module | **New** |
| 3 | Register executor as OSGi service | `FlowExecutionEngineServiceComponent.java` | **Edit** |

Three changes across two repos. Do them in order. Each one has a clear "done" check.

---

## Before You Start — Understand the USER_ONBOARD Analog & Core Architecture

### 1. Where is the UserOnboardingExecutor (UserOnboardExecutor)?
You might try to look for `UserOnboardingExecutor.java` in the current repository and find that it is **not visible**.
This is **intentional**. The core `carbon-identity-framework` repository only contains the flow orchestration framework. Concrete, production-level executors (like `UserOnboardingExecutor` or `PasswordProvisioningExecutor`) live in separate product-specific repositories (such as `identity-governance` or `product-is`). 

For a PoC, we implement custom executors (like `OrgCreateExecutor`) directly within our checkout, registering them via OSGi so the framework can discover them dynamically.

---

### 2. The Role of GraphBuilder.java vs. Custom Executors
You might notice that the core [GraphBuilder.java](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.mgt/src/main/java/org/wso2/carbon/identity/flow/mgt/utils/GraphBuilder.java) has built-in code for processing user onboarding steps:
```java
case USER_ONBOARD:
    processUserOnboardStep(step);
    break;
```
And:
```java
private NodeConfig createUserOnboardingNode(String stepId) {
    return new NodeConfig.Builder()
            .id(stepId)
            .type(TASK_EXECUTION)
            .executorConfig(new ExecutorDTO(USER_ONBOARDING)) // "UserOnboardingExecutor"
            .build();
}
```

* **Why is `USER_ONBOARD` hardcoded in GraphBuilder?**
  `USER_ONBOARD` is a legacy, system-predefined step type. The flow builder UI does not let admins configure or drag it arbitrarily (its `showOnResourcePanel` is false). Because of this fixed nature, the `GraphBuilder` utility manually resolves and wraps it into a node configuration with the hardcoded `"UserOnboardingExecutor"` executor config.

* **Why we do NOT need to modify GraphBuilder.java for new custom executors:**
  For new steps like our `ORG_CREATE` (Create Organization) step, we use the generic step type **`EXECUTION`** (see `steps.json` below).
  In `GraphBuilder.java`, the case for `EXECUTION` steps is handled dynamically:
  ```java
  case EXECUTION:
      processExecutionStep(step);
      break;
  ```
  Inside `processExecutionStep()`, `GraphBuilder` reads the action and parses the executor configuration directly from the step JSON payload (`action.getExecutor()`). It does not need to know the name of the executor in advance!
  Therefore, **there is absolutely no need to modify `GraphBuilder.java` to support `OrgCreateExecutor`**.

---

### 3. How the Engine Dynamically Executes Custom Executors
The flow execution engine is fully decoupled from the graph building phase:
1. **Definition**: The frontend defines a step of type `EXECUTION` with an action that references the executor name (e.g., `"OrgCreateExecutor"`).
2. **OSGi Registry**: We create a separate Java class [OrgCreateExecutor.java](file:///Users/mahimam/Desktop/wso2/core/identity-apps/docs/org-onboarding-flow-poc/STAGE1_ORG_CREATE_EXECUTOR_README.md#L167-L308) implementing the `org.wso2.carbon.identity.flow.execution.engine.graph.Executor` interface.
3. **OSGi Service**: We register this executor class as an OSGi service (registered in [FlowExecutionEngineServiceComponent.java](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/src/main/java/org/wso2/carbon/identity/flow/execution/engine/internal/FlowExecutionEngineServiceComponent.java)).
4. **Resolution**: At runtime, when the engine hits the task node config, it looks up the executor name (e.g., `"OrgCreateExecutor"`) in the registered executors map and runs its `execute(context)` method.

This is why every custom execution step **must have a separate executor Java class** implementing `Executor`, registered as an OSGi service.

---

## Change 1 — Add the Step Resource (Frontend)

**File**: `features/admin.registration-flow-builder.v1/data/steps.json`

Open the file. Find the closing `]` at the very end. Add the following new entry to the array (before the closing `]`):

```json
{
    "resourceType": "STEP",
    "category": "WORKFLOW",
    "type": "EXECUTION",
    "version": "0.1.0",
    "deprecated": false,
    "display": {
        "label": "Create Organization",
        "image": "assets/images/icons/organization.svg",
        "showOnResourcePanel": true
    },
    "data": {
        "action": {
            "type": "EXECUTOR",
            "executor": {
                "name": "OrgCreateExecutor",
                "meta": {
                    "orgNameClaim": "organization.name",
                    "orgType": "TENANT"
                }
            },
            "next": ""
        }
    }
}
```

**What each field means**:

| Field | Value | Why |
|-------|-------|-----|
| `type` | `"EXECUTION"` | This is an executor node, not a UI form |
| `executor.name` | `"OrgCreateExecutor"` | Must match `getName()` in your Java class exactly |
| `meta.orgNameClaim` | `"organization.name"` | The key your executor reads from `context.getUserInputData()` |
| `meta.orgType` | `"TENANT"` | Passed to the organization creation API |
| `showOnResourcePanel` | `true` | Makes it draggable from the left resource panel |

**Done check**:

1. Restart the console dev server
2. Open the flow builder
3. You should see **"Create Organization"** in the left resource panel under WORKFLOW
4. Drag it onto the canvas, connect it, click Publish
5. In the Network tab the PUT payload must contain `OrgCreateExecutor` in the executor name field

---

## Change 2 — Integrate Organization Management into Backend

To make the `OrgCreateExecutor` call the real `OrganizationManager` service, we must wire the `identity-organization-management-core` service into our `flow-orchestration-framework` engine.

---

### Change 2.1 — Add Maven Dependency & Imports

**File**: [pom.xml](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/pom.xml)

1. Open `pom.xml` and add the dependency for `org.wso2.carbon.identity.organization.management.service` under the `<dependencies>` block:
   ```xml
   <dependency>
       <groupId>org.wso2.carbon.identity.organization.management.core</groupId>
       <artifactId>org.wso2.carbon.identity.organization.management.service</artifactId>
       <scope>provided</scope>
   </dependency>
   ```
2. Under `<Import-Package>`, add the package imports for organization management:
   ```xml
   org.wso2.carbon.identity.organization.management.service.*; version="${org.wso2.carbon.identity.organization.management.core.version.range}",
   org.wso2.carbon.identity.organization.management.service.model.*; version="${org.wso2.carbon.identity.organization.management.core.version.range}",
   org.wso2.carbon.identity.organization.management.service.constant.*; version="${org.wso2.carbon.identity.organization.management.core.version.range}",
   ```

---

### Change 2.2 — Update OSGi DataHolder and Service Component

We need to inject the `OrganizationManager` OSGi service and expose it to our executors.

**File**: [FlowExecutionEngineDataHolder.java](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/src/main/java/org/wso2/carbon/identity/flow/execution/engine/internal/FlowExecutionEngineDataHolder.java)

1. Add the import to the top of the file:
   ```java
   import org.wso2.carbon.identity.organization.management.service.OrganizationManager;
   ```
2. Add a private property and getter/setter inside the class:
   ```java
   private OrganizationManager organizationManager;

   public OrganizationManager getOrganizationManager() {
       return organizationManager;
   }

   public void setOrganizationManager(OrganizationManager organizationManager) {
       this.organizationManager = organizationManager;
   }
   ```

**File**: [FlowExecutionEngineServiceComponent.java](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/src/main/java/org/wso2/carbon/identity/flow/execution/engine/internal/FlowExecutionEngineServiceComponent.java)

1. Add the import to the top of the file:
   ```java
   import org.wso2.carbon.identity.organization.management.service.OrganizationManager;
   ```
2. Bind the service using the `@Reference` annotation:
   ```java
       @Reference(
               name = "OrganizationManager",
               service = OrganizationManager.class,
               cardinality = ReferenceCardinality.MANDATORY,
               policy = ReferencePolicy.DYNAMIC,
               unbind = "unsetOrganizationManager"
       )
       protected void setOrganizationManager(OrganizationManager organizationManager) {

           LOG.debug("Setting the Organization Manager in the Flow Engine component.");
           FlowExecutionEngineDataHolder.getInstance().setOrganizationManager(organizationManager);
       }

       protected void unsetOrganizationManager(OrganizationManager organizationManager) {

           LOG.debug("Unsetting the Organization Manager in the Flow Engine component.");
           FlowExecutionEngineDataHolder.getInstance().setOrganizationManager(null);
       }
   ```

---

### Change 2.3 — Create the Executor

**File to create**: `components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/src/main/java/org/wso2/carbon/identity/flow/execution/engine/graph/executor/OrgCreateExecutor.java`

Create the file and copy-paste the following full class:

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
import org.wso2.carbon.identity.flow.execution.engine.model.ExecutorResponse;
import org.wso2.carbon.identity.flow.execution.engine.model.FlowExecutionContext;
import org.wso2.carbon.identity.flow.execution.engine.internal.FlowExecutionEngineDataHolder;
import org.wso2.carbon.identity.organization.management.service.OrganizationManager;
import org.wso2.carbon.identity.organization.management.service.model.Organization;
import org.wso2.carbon.identity.organization.management.service.constant.OrganizationManagementConstants;

import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Stage 1 POC Executor — automatically creates an organization when the
 * flow engine processes an ORG_CREATE node.
 */
public class OrgCreateExecutor implements Executor {

    private static final Log LOG = LogFactory.getLog(OrgCreateExecutor.class);

    // Must match the "executor.name" value in steps.json exactly
    private static final String EXECUTOR_NAME = "OrgCreateExecutor";

    // Claim key for org name — must match "meta.orgNameClaim" in steps.json
    private static final String ORG_NAME_CLAIM_KEY = "organization.name";

    // Context property keys written into the flow context after creation
    private static final String CTX_ORG_ID   = "org.created.id";
    private static final String CTX_ORG_NAME = "org.created.name";

    @Override
    public String getName() {
        return EXECUTOR_NAME;
    }

    @Override
    public ExecutorResponse execute(FlowExecutionContext context) throws FlowEngineException {

        LOG.info("[ORG-CREATE-POC] OrgCreateExecutor triggered for tenant: "
                + context.getTenantDomain());

        // Step 1: Read org name from user input
        String orgName = null;
        if (context.getUserInputData() != null) {
            Object raw = context.getUserInputData().get(ORG_NAME_CLAIM_KEY);
            if (raw != null) {
                orgName = raw.toString().trim();
            }
        }

        if (orgName == null || orgName.isEmpty()) {
            LOG.warn("[ORG-CREATE-POC] No org name in context. Asking user to retry.");
            ExecutorResponse response = new ExecutorResponse();
            response.setResult("RETRY");
            response.setErrorMessage("Please provide a valid organization name.");
            return response;
        }

        // Step 2: Create the organization
        try {
            String createdOrgId = createOrganization(orgName, context.getTenantDomain());

            // Step 3: Write result into context so later steps can read it
            ExecutorResponse response = new ExecutorResponse();
            response.setResult("COMPLETE");
            Map<String, Object> props = new HashMap<>();
            props.put(CTX_ORG_ID, createdOrgId);
            props.put(CTX_ORG_NAME, orgName);
            response.setContextProperties(props);

            LOG.info("[ORG-CREATE-POC] Org created successfully. Name: " + orgName + " | ID: " + createdOrgId);
            return response;

        } catch (Exception e) {
            LOG.error("[ORG-CREATE-POC] Failed to create org: " + orgName, e);
            ExecutorResponse response = new ExecutorResponse();
            response.setResult("RETRY");
            response.setErrorMessage("Failed to create the organization. " + e.getMessage());
            return response;
        }
    }

    /**
     * Creates an organization using the OrganizationManager OSGi service.
     */
    private String createOrganization(String orgName, String tenantDomain) throws Exception {

        OrganizationManager orgManager = FlowExecutionEngineDataHolder.getInstance().getOrganizationManager();
        if (orgManager == null) {
            throw new Exception("OrganizationManager OSGi service is not available.");
        }

        LOG.info("[ORG-CREATE-POC] Calling OrganizationManager to create: " + orgName);

        Organization org = new Organization();
        org.setName(orgName);
        org.setDescription("Organization self-registered via onboarding flow.");
        org.setStatus(OrganizationManagementConstants.OrganizationStatus.ACTIVE.toString());
        org.setType(OrganizationManagementConstants.OrganizationTypes.TENANT.toString());
        org.setCreated(Instant.now());
        org.setLastModified(Instant.now());

        // Generate organization handle (e.g. Acme Corp -> acme-corp)
        String handle = orgName.toLowerCase().replaceAll("[^a-z0-9]", "-").replaceAll("-+", "-");
        if (handle.endsWith("-")) {
            handle = handle.substring(0, handle.length() - 1);
        }
        org.setOrganizationHandle(handle);

        // Under self-registration B2B flow, the root parent is SUPER_ORG_ID
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
        // TODO Stage 2: delete the created org if a later step fails
        LOG.info("[ORG-CREATE-POC] Rollback called (no-op for Stage 1 POC).");
        ExecutorResponse response = new ExecutorResponse();
        response.setResult("COMPLETE");
        return response;
    }
}
```

---

## Change 3 — Register the Executor as an OSGi Service (Backend)

**File**: `FlowExecutionEngineServiceComponent.java`

Find the `activate()` method. Add two things:

```java
// 1. Import at the top of the file
import org.wso2.carbon.identity.flow.execution.engine.graph.executor.OrgCreateExecutor;

// 2. Inside activate(), after the existing registerService calls
bundleContext.registerService(
    Executor.class.getName(),
    new OrgCreateExecutor(),
    null
);
LOG.info("[ORG-CREATE-POC] OrgCreateExecutor registered as OSGi service.");
```

This is the same pattern used for any other executor in the engine — no special config needed.

**Done check**: Build and restart the server. In `wso2carbon.log` you must see:

```
[ORG-CREATE-POC] OrgCreateExecutor registered as OSGi service.
```

---

## The Flow You Are Building

After all three changes, configure this flow in the Console flow builder:

```
START
  |
  v
VIEW: "Register Your Organization"
  |   - Text field: "Organization Name"   (identifier: organization.name)
  |   - Submit button  -->  action: EXECUTOR  -->  OrgCreateExecutor
  |
  v
EXECUTION: Create Organization       <-- your new OrgCreateExecutor node
  |   (on COMPLETE)
  v
END
```

When someone submits the form:
1. Flow engine receives `{ "organization.name": "Acme Corp" }` in user input
2. Engine reaches the `OrgCreateExecutor` EXECUTION node
3. Your executor reads `"Acme Corp"` and calls `createOrganization()`
4. Organization is created in the system automatically
5. Flow engine returns `COMPLETE` — no admin manual action needed

---

## Build and Test

### Build (backend only — fast)

```bash
cd carbon-identity-framework

mvn clean install \
  -pl components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine \
  -am \
  -DskipTests

# Copy JAR to IS_HOME (ask mentor for exact path)
cp components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/target/*.jar \
   $IS_HOME/repository/components/dropins/
```

Restart the server. Check the log for the executor registered line.

### Manual test via curl (stub version works immediately)

**Step 1 — start a new flow**:

```bash
curl -k -X POST 'https://localhost:9443/api/server/v1/flow/execute' \
  -H 'Content-Type: application/json' \
  -d '{"flowType": "REGISTRATION", "inputs": {}}'
```

Response gives you a `flowId` and a VIEW step with the org name text field.

**Step 2 — submit org name**:

```bash
curl -k -X POST 'https://localhost:9443/api/server/v1/flow/execute' \
  -H 'Content-Type: application/json' \
  -d '{
    "flowType": "REGISTRATION",
    "flowId": "<flowId from above>",
    "actionId": "<submit button action id from above>",
    "inputs": {
      "organization.name": "Acme Corp"
    }
  }'
```

**Expected server log (stub)**:
```
[ORG-CREATE-POC] OrgCreateExecutor triggered for tenant: carbon.super
[ORG-CREATE-POC][STUB] Would create org: Acme Corp in tenant: carbon.super
[ORG-CREATE-POC] Org created. Name: Acme Corp | ID: stub-org-id-1751234567890
```

**Expected API response**: status `COMPLETE` — flow moves to END.

**Test RETRY path** — submit with empty org name:
```bash
"organization.name": ""
```
Expected: response contains `"Please provide a valid organization name."` and status `RETRY`.

---

## Done Checklist

- [ ] **"Create Organization"** appears in the resource panel under WORKFLOW category
- [ ] Admin can drag it, connect it to START and END, and publish the flow
- [ ] PUT payload in Network tab contains `OrgCreateExecutor` in executor name
- [ ] Server log shows `OrgCreateExecutor registered as OSGi service` on startup
- [ ] Server log shows `OrgCreateExecutor triggered` when flow execute is called
- [ ] API returns `COMPLETE` when org name is provided (stub ID is fine)
- [ ] API returns `RETRY` with error message when org name is empty
- [ ] **(real OrganizationManager call)** Org actually appears in Console → Organizations list

Once every box is checked, Stage 1 is complete.

---

## File Locations Quick Reference

| File | Repo | Action |
|------|------|--------|
| [steps.json](file:///Users/mahimam/Desktop/wso2/core/identity-apps/features/admin.registration-flow-builder.v1/data/steps.json) | identity-apps | Add ORG_CREATE step entry |
| [pom.xml](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/pom.xml) | carbon-identity-framework | Add dependency & Import-Package entries |
| [FlowExecutionEngineDataHolder.java](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/src/main/java/org/wso2/carbon/identity/flow/execution/engine/internal/FlowExecutionEngineDataHolder.java) | carbon-identity-framework | Add field & getter/setter for OrganizationManager |
| [FlowExecutionEngineServiceComponent.java](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/src/main/java/org/wso2/carbon/identity/flow/execution/engine/internal/FlowExecutionEngineServiceComponent.java) | carbon-identity-framework | Register service reference & OrgCreateExecutor service |
| [OrgCreateExecutor.java](file:///Users/mahimam/Desktop/wso2/core/carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/src/main/java/org/wso2/carbon/identity/flow/execution/engine/graph/executor/OrgCreateExecutor.java) | carbon-identity-framework | Create executor class with real OrganizationManager call |

---

## What Comes After Stage 1

Once Stage 1 works end to end with the real `OrganizationManager` call:

1. Add the KYB/GLEIF verification step **after** the `OrgCreateExecutor` node in the flow
2. The full flow becomes:

   ```
   VIEW (org name + LEI)  -->  ORG_CREATE  -->  KYB_VERIFY  -->  END
   ```

3. The KYB executor is already fully documented in `POC_IMPLEMENTATION_PLAN.md`

Stage 1 proves the org creation plumbing. Stage 2 (your original POC plan) adds KYB on top of it.

