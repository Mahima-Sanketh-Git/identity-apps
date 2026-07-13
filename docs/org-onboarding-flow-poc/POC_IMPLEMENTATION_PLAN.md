# Project 671 – B2B Org Onboarding Flow POC Implementation Plan
### KYB Integration via GLEIF · WSO2 Carbon Identity Framework

> **Who this is for**: You as a new intern working on this POC. This file tells you *what* to implement, *where* every file is, *why* each piece exists, and *how* to verify it works. Read it top to bottom before writing a single line of code.

---

## Table of Contents

1. [Mental Model — Read This First](#1-mental-model--read-this-first)
2. [What the POC Must Prove](#2-what-the-poc-must-prove)
3. [Architecture Diagram](#3-architecture-diagram)
4. [Key Files Cheat Sheet](#4-key-files-cheat-sheet)
5. [Phase 0 — Understand the Existing Flow (No Code)](#5-phase-0--understand-the-existing-flow-no-code)
6. [Phase 1 — Frontend: Add KYB Step to the Resource Panel](#6-phase-1--frontend-add-kyb-step-to-the-resource-panel)
7. [Phase 2 — Backend: Implement KYBVerificationExecutor (Stub)](#7-phase-2--backend-implement-kybverificationexecutor-stub)
8. [Phase 3 — Wire It End to End (Publish Then Execute)](#8-phase-3--wire-it-end-to-end)
9. [Phase 4 — Call Real GLEIF API](#9-phase-4--call-real-gleif-api)
10. [Phase 5 — Demo Flow](#10-phase-5--demo-flow)
11. [OSGi Quick Reference](#11-osgi-quick-reference)
12. [Debugging Guide](#12-debugging-guide)
13. [Common Errors and Fixes](#13-common-errors-and-fixes)
14. [Open Questions for Mentor](#14-open-questions-for-mentor)

---

## 1. Mental Model — Read This First

Before touching any code you must understand how the existing self-registration flow works end to end.

```
Admin opens Console
    |
    v
Drag steps onto canvas in registration-flow-builder
    | (React Flow nodes + edges)
    v
Click Publish
    |
    v
transformFlow() converts canvas to backend FlowDTO JSON
    |
    v
PUT /api/server/v1/flow  (Java REST API)
    |
    v
FlowMgtService.updateFlow() -> GraphBuilder -> FlowDAOImpl -> DB
    |
    --- later, user opens self-registration page ---
    v
POST /api/server/v1/flow/execute  (flowType=REGISTRATION)
    |
    v
FlowExecutionService.executeFlow()
    |
    v
FlowExecutionEngine walks GraphConfig node by node
    |
    v
When node type = TASK_EXECUTION -> TaskExecutionNode.triggerExecutor()
    |
    v
OSGi registry lookup by executor name -> calls executor.execute(context)
    |
    v
Executor returns COMPLETE / RETRY / USER_INPUT_REQUIRED / EXTERNAL_REDIRECTION
    |
    v
Engine sends FlowExecutionStep response back to browser/portal
```

**Your POC goal**: Insert a KYBVerificationExecutor step into this existing chain. The admin configures it, the engine calls it, and it calls GLEIF to check whether the organization's LEI is valid.

---

## 2. What the POC Must Prove

| # | What | Why |
|---|------|-----|
| 1 | KYB step appears in the resource panel of the flow builder | Proves admin UX works |
| 2 | Admin can drag, connect, and publish the KYB step | Proves the frontend model is correct |
| 3 | Backend persists and can reload the KYB executor config | Proves the data model round-trips |
| 4 | KYBVerificationExecutor is picked up by the flow engine at runtime | Proves OSGi wiring works |
| 5 | Executor calls GLEIF /api/v1/lei-records/{lei} and reads status | Proves external connector pattern |
| 6 | Flow shows COMPLETE, RETRY, or PENDING based on GLEIF result | Proves state machine works |

The POC does NOT need to handle async webhooks, a full org portal, or production-grade security. Keep it simple.

---

## 3. Architecture Diagram

```
FRONTEND (identity-apps)
-------------------------------------------
admin.registration-flow-builder.v1/data/steps.json
    | (KYB step resource definition)
    v
resource panel -> canvas -> transformFlow.ts
    | (FlowDTO JSON payload)
    v
PUT /api/server/v1/flow

BACKEND (carbon-identity-framework)
-------------------------------------------
FlowMgtService.updateFlow()
    |
    v
GraphBuilder -> NodeConfig(TASK_EXECUTION, name="KYBVerificationExecutor")
    |
    v
FlowDAOImpl -> Database

--- runtime ---
FlowExecutionEngine
    |
    v (TASK_EXECUTION node)
TaskExecutionNode -> OSGi lookup "KYBVerificationExecutor"
    |
    v
KYBVerificationExecutor.execute(context)
    |
    v
GLEIF REST API https://api.gleif.org/api/v1/lei-records
    |
    v
ExecutorResponse (COMPLETE or RETRY or EXTERNAL_REDIRECTION)
```

---

## 4. Key Files Cheat Sheet

### Frontend Files

| File | Purpose |
|------|---------|
| features/admin.registration-flow-builder.v1/data/steps.json | YOUR FIRST EDIT — add KYB step resource here |
| features/admin.registration-flow-builder.v1/utils/transform-flow.ts | Converts canvas to backend payload — verify meta survives |
| features/admin.registration-flow-builder.v1/providers/registration-flow-builder-provider.tsx | State and publish logic — put breakpoints here |
| features/admin.registration-flow-builder.v1/api/configure-registration-flow.ts | Sends PUT to backend |
| features/admin.registration-flow-builder.v1/components/registration-flow-builder-core.tsx | Main builder UI component |
| features/admin.flow-builder-core.v1/components/resource-panel/resource-panel.tsx | Left panel — reads step resources |

### Backend Files

| File | Purpose |
|------|---------|
| graph/Executor.java | YOUR INTERFACE — implement this |
| graph/TaskExecutionNode.java | Looks up your executor by name from OSGi |
| internal/FlowExecutionEngineServiceComponent.java | setExecutors() receives your executor via OSGi |
| FlowExecutionService.java | Runtime entry point |
| FlowMgtService.java | Admin: save and load flow definitions |

Both are inside:
`carbon-identity-framework/components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/`

---

## 5. Phase 0 — Understand the Existing Flow (No Code)

**Goal**: Before writing anything, trace the self-registration flow end to end.

### Step 0.1 — Run the Console

```bash
# From identity-apps root
pnpm install
pnpm nx run console:start
```

The console opens at https://localhost:9001/console.

### Step 0.2 — Open the Registration Flow Builder

1. Go to Console -> Self-Registration -> Flow Builder.
2. Drag any step from the resource panel onto the canvas.
3. Connect it to START and END.
4. Click Publish.

### Step 0.3 — Watch the Network

Open DevTools -> Network -> filter by `/flow`.

You should see:
- `GET /api/server/v1/flow?flowType=REGISTRATION` — loads existing flow
- `PUT /api/server/v1/flow` — publishes your canvas

Click on the PUT request and look at the Request Payload. You will see a JSON shaped like:

```json
{
  "flowType": "REGISTRATION",
  "steps": [
    {
      "id": "view_abc123",
      "type": "VIEW"
    }
  ]
}
```

This is the FlowDTO your Java backend receives.

### Step 0.4 — Put a Breakpoint in Java

In IntelliJ, open the carbon-identity-framework project. Put a breakpoint at:

```
FlowMgtService.java -> updateFlow() method entry
```

Then publish again from the Console. IntelliJ should pause there. Inspect the flowDTO object. Step through to GraphBuilder.withSteps() to see how steps become nodes.

Done when: You can explain where the payload comes from in React and where it lands in Java.

---

## 6. Phase 1 — Frontend: Add KYB Step to the Resource Panel

**Time estimate**: 1-2 hours
**Risk**: Very low — you are only editing a JSON file

### What you already have

Open `features/admin.registration-flow-builder.v1/data/steps.json` (lines 95-118).

There is ALREADY a KYBExtensionExecutor entry. It was added earlier. You need to rename the executor to match what your Java class will be named.

### What you need to change

The executor name must match EXACTLY between steps.json and your Java class getName() method.

We will use `KYBVerificationExecutor` as the canonical name.

Edit the KYB entry in steps.json to look like this:

```json
{
    "resourceType": "STEP",
    "category": "WORKFLOW",
    "type": "EXECUTION",
    "version": "0.1.0",
    "deprecated": false,
    "display": {
        "label": "KYB Verification (GLEIF)",
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
                    "leiInputClaim": "organization.lei",
                    "async": false
                }
            },
            "next": ""
        }
    }
}
```

Why the meta fields? The executor reads them from NodeConfig.executorConfig.metaProperties at runtime. The leiInputClaim tells the executor which key in context.userInputData holds the LEI string the user typed.

### Verify Phase 1

1. Restart the console dev server.
2. Open the flow builder.
3. You should see "KYB Verification (GLEIF)" in the resource panel under the WORKFLOW category.
4. Drag it onto the canvas. It should create a node.
5. Connect: START -> (your view step) -> KYB Verification -> USER_ONBOARD -> END.
6. Click Publish.
7. In the Network tab, confirm the PUT payload contains KYBVerificationExecutor in the executor name field.

Done when: You can publish a flow containing KYBVerificationExecutor and reload it without losing the step.

---

## 7. Phase 2 — Backend: Implement KYBVerificationExecutor (Stub)

**Time estimate**: 2-4 hours
**Risk**: Medium — first OSGi class. Follow the pattern exactly.

### 7.1 — Where to Put the Code

For this POC, add the executor directly inside the existing execution engine module.
This avoids Maven feature pack changes and lets you move fast.

Path:
```
carbon-identity-framework/
  components/
    flow-orchestration-framework/
      org.wso2.carbon.identity.flow.execution.engine/
        src/main/java/org/wso2/carbon/identity/flow/execution/engine/
          kyb/
            KYBVerificationExecutor.java   <- CREATE THIS
```

### 7.2 — Create the Executor Class

```java
/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com)
 * POC: KYB Verification Executor for Project 671
 */
package org.wso2.carbon.identity.flow.execution.engine.kyb;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.wso2.carbon.identity.flow.execution.engine.exception.FlowEngineException;
import org.wso2.carbon.identity.flow.execution.engine.graph.Executor;
import org.wso2.carbon.identity.flow.execution.engine.model.ExecutorResponse;
import org.wso2.carbon.identity.flow.execution.engine.model.FlowExecutionContext;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;

/**
 * POC executor that performs KYB verification via GLEIF LEI lookup.
 *
 * Triggered when the flow engine encounters a TASK_EXECUTION node
 * with executor name "KYBVerificationExecutor".
 *
 * Flow:
 *   1. Read LEI string from context.userInputData
 *   2. Call GLEIF /api/v1/lei-records/{lei}
 *   3. Check entity.status == "ACTIVE"
 *   4. Return COMPLETE or RETRY
 */
public class KYBVerificationExecutor implements Executor {

    private static final Log LOG = LogFactory.getLog(KYBVerificationExecutor.class);

    // This name MUST exactly match the "executor.name" value in steps.json
    private static final String EXECUTOR_NAME = "KYBVerificationExecutor";

    // The key under which the LEI string is stored in userInputData
    private static final String LEI_CLAIM_KEY = "organization.lei";

    // Context property keys for storing KYB result
    private static final String CTX_KYB_STATUS = "kyb.status";
    private static final String CTX_KYB_PROVIDER = "kyb.provider";

    @Override
    public String getName() {
        return EXECUTOR_NAME;
    }

    @Override
    public ExecutorResponse execute(FlowExecutionContext context) throws FlowEngineException {

        LOG.info("[KYB-POC] KYBVerificationExecutor triggered for tenant: "
                + context.getTenantDomain());

        // Step 1: Read the LEI from user input
        String lei = null;
        if (context.getUserInputData() != null) {
            lei = (String) context.getUserInputData().get(LEI_CLAIM_KEY);
        }

        if (lei == null || lei.trim().isEmpty()) {
            LOG.warn("[KYB-POC] No LEI found in user input. Asking user to retry.");
            ExecutorResponse response = new ExecutorResponse();
            response.setResult("RETRY");
            response.setErrorMessage(
                    "Please provide a valid LEI number for your organization.");
            return response;
        }

        // Step 2: Call GLEIF (stub for Phase 2, real call in Phase 4)
        boolean isVerified = callGleifApi(lei.trim(), context);

        // Step 3: Return result
        ExecutorResponse response = new ExecutorResponse();
        if (isVerified) {
            response.setResult("COMPLETE");
            HashMap<String, Object> props = new HashMap<>();
            props.put(CTX_KYB_STATUS, "VERIFIED");
            props.put(CTX_KYB_PROVIDER, "GLEIF");
            response.setContextProperties(props);
            LOG.info("[KYB-POC] LEI verified successfully: " + lei);
        } else {
            response.setResult("RETRY");
            response.setErrorMessage(
                    "KYB verification failed. The provided LEI could not be verified.");
            LOG.warn("[KYB-POC] LEI verification failed for: " + lei);
        }
        return response;
    }

    /**
     * Calls the GLEIF LEI Records API.
     *
     * GLEIF API: GET https://api.gleif.org/api/v1/lei-records/{lei}
     * Check: data.attributes.entity.status == "ACTIVE"
     *
     * Phase 2 STUB: returns true for any 20-character string.
     * Phase 4: replace with real HTTP call.
     */
    private boolean callGleifApi(String lei, FlowExecutionContext context) {

        // STUB (Phase 2) - replace in Phase 4
        LOG.info("[KYB-POC][STUB] Simulating GLEIF call for LEI: " + lei);
        return lei.length() == 20; // Basic LEI format: 20 alphanumeric chars
    }

    @Override
    public List<String> getInitiationData() {
        return Collections.emptyList();
    }

    @Override
    public ExecutorResponse rollback(FlowExecutionContext context) throws FlowEngineException {

        LOG.info("[KYB-POC] Rollback called (no-op for POC).");
        ExecutorResponse response = new ExecutorResponse();
        response.setResult("COMPLETE");
        return response;
    }
}
```

### 7.3 — Register the Executor as an OSGi Service

The flow engine already has this in FlowExecutionEngineServiceComponent:

```java
@Reference(
    service = Executor.class,
    cardinality = ReferenceCardinality.MULTIPLE,
    policy = ReferencePolicy.DYNAMIC,
    unbind = "unsetExecutors")
protected void setExecutors(Executor executor) {
    FlowExecutionEngineDataHolder.getInstance()
        .getExecutors().put(executor.getName(), executor);
}
```

This means: any OSGi service registered as type Executor.class is automatically picked up.

In FlowExecutionEngineServiceComponent.java, find the activate() method and add one line:

```java
@Activate
protected void activate(ComponentContext context) {

    try {
        BundleContext bundleContext = context.getBundleContext();
        bundleContext.registerService(FlowExecutionService.class.getName(),
                FlowExecutionService.getInstance(), null);
        bundleContext.registerService(FlowExecutionListener.class.getName(),
                new InputProcessingListener(), null);

        // POC: Register KYB executor
        bundleContext.registerService(Executor.class.getName(),
                new KYBVerificationExecutor(), null);
        LOG.info("[KYB-POC] KYBVerificationExecutor registered successfully.");
        // END POC

        LOG.debug("Flow Engine service successfully activated.");
    } catch (Throwable e) {
        LOG.error("Error while initiating Flow Engine service", e);
    }
}
```

Also add this import at the top of FlowExecutionEngineServiceComponent.java:
```java
import org.wso2.carbon.identity.flow.execution.engine.kyb.KYBVerificationExecutor;
```

### 7.4 — Why This Works (OSGi Trace)

```
activate() runs
    |
    v  bundleContext.registerService(Executor.class, new KYBVerificationExecutor(), null)
    |  OSGi service registry now has your executor
    v
FlowExecutionEngineServiceComponent.setExecutors() is called by OSGi
    |
    v  FlowExecutionEngineDataHolder.getExecutors().put("KYBVerificationExecutor", <your instance>)
    |
At runtime:
    v
TaskExecutionNode.resolveExecutor("KYBVerificationExecutor")
    |
    v  reads DataHolder.getExecutors() -> finds your instance
    |
    v  calls execute(context)
```

### 7.5 — Build and Deploy

```bash
# Build only the execution engine module (fast, skips other modules)
cd carbon-identity-framework
mvn clean install \
  -pl components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine \
  -am \
  -DskipTests

# Copy JAR to IS (ask mentor for exact IS_HOME path)
cp components/flow-orchestration-framework/org.wso2.carbon.identity.flow.execution.engine/target/org.wso2.carbon.identity.flow.execution.engine-*.jar \
   $IS_HOME/repository/components/dropins/
```

Restart the IS server.

### 7.6 — Verify Phase 2

In wso2carbon.log, look for:
```
[KYB-POC] KYBVerificationExecutor registered successfully.
```

Done when: Server starts and you see this log line.

---

## 8. Phase 3 — Wire It End to End

**Time estimate**: 2-3 hours
**This is the most important phase**

### 8.1 — Configure a Flow with the KYB Step

In the Console flow builder, build this flow:

```
START
  |
  v
VIEW: Business Details Form
  - Organization Name  (text, identifier: http://wso2.org/claims/organization)
  - LEI Number         (text, identifier: organization.lei)
  - Submit button      -> action: EXECUTOR -> KYBVerificationExecutor
  |
  v
EXECUTION: KYB Verification (GLEIF)
  |   (on COMPLETE)
  v
USER_ONBOARD
  |
  v
END
```

Publish the flow. Verify the PUT payload contains KYBVerificationExecutor.

### 8.2 — Execute the Flow via API

Start a new flow:

```bash
curl -X POST 'https://localhost:9443/api/server/v1/flow/execute' \
  -H 'Content-Type: application/json' \
  -k \
  -d '{
    "flowType": "REGISTRATION",
    "inputs": {}
  }'
```

You will receive a flowId and a VIEW step showing your form fields.

Submit with a valid LEI (20 characters):

```bash
curl -X POST 'https://localhost:9443/api/server/v1/flow/execute' \
  -H 'Content-Type: application/json' \
  -k \
  -d '{
    "flowType": "REGISTRATION",
    "flowId": "<flowId from above>",
    "actionId": "<button action id>",
    "inputs": {
      "http://wso2.org/claims/organization": "Test Corp Ltd",
      "organization.lei": "12345678901234567890"
    }
  }'
```

With the stub, any 20-char string returns COMPLETE. Moving to the next step.

Submit with an invalid LEI:

```bash
"organization.lei": "short"
```

You should get a VIEW response with error: "Please provide a valid LEI number".

### 8.3 — Java Debugging Breakpoints

Put breakpoints here:

1. FlowExecutionService.executeFlow() — confirm flowId and inputs arrive
2. FlowExecutionEngine.execute() — watch node traversal
3. TaskExecutionNode.triggerExecutor() — confirm your executor is resolved
4. KYBVerificationExecutor.execute() — verify LEI is read correctly
5. TaskExecutionNode.handleCompleteStatus() — verify response routing

Done when: You can see [KYB-POC] log lines in the server log and the API returns different responses for valid vs invalid LEI.

---

## 9. Phase 4 — Call Real GLEIF API

**Time estimate**: 2-3 hours

### 9.1 — GLEIF API (Free, No Key Required)

```
GET https://api.gleif.org/api/v1/lei-records/{lei}
```

Test with Deutsche Bank's LEI (a known valid one):
```bash
curl 'https://api.gleif.org/api/v1/lei-records/5493006MHB84DD0ZWV18'
```

Response structure you care about:
```json
{
  "data": {
    "attributes": {
      "entity": {
        "legalName": { "name": "Deutsche Bank AG" },
        "status": "ACTIVE"
      },
      "registration": {
        "status": "ISSUED"
      }
    }
  }
}
```

You need both:
- data.attributes.entity.status == "ACTIVE"
- data.attributes.registration.status == "ISSUED"

### 9.2 — Replace the Stub with Real HTTP

Replace the callGleifApi() method body:

```java
private boolean callGleifApi(String lei, FlowExecutionContext context) {

    String url = "https://api.gleif.org/api/v1/lei-records/" + lei;
    LOG.info("[KYB-POC] Calling GLEIF: " + url);

    try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
        HttpGet request = new HttpGet(url);
        request.setHeader("Accept", "application/vnd.api+json");

        try (CloseableHttpResponse response = httpClient.execute(request)) {
            int statusCode = response.getStatusLine().getStatusCode();

            if (statusCode == 200) {
                String body = EntityUtils.toString(response.getEntity());
                // Simple string check for the POC
                boolean entityActive = body.contains("\"status\":\"ACTIVE\"");
                boolean regIssued   = body.contains("\"status\":\"ISSUED\"");
                return entityActive && regIssued;
            } else if (statusCode == 404) {
                LOG.warn("[KYB-POC] LEI not found in GLEIF: " + lei);
                return false;
            } else {
                LOG.error("[KYB-POC] GLEIF API returned unexpected status: " + statusCode);
                return false;
            }
        }
    } catch (Exception e) {
        LOG.error("[KYB-POC] Error calling GLEIF API for LEI: " + lei, e);
        return false;
    }
}
```

Add these imports:

```java
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
```

### 9.3 — Test with Real LEIs

Known valid LEI (Deutsche Bank):
```
5493006MHB84DD0ZWV18
```

Submit through the self-registration form -> should return COMPLETE.

Random invalid string:
```
INVALIDLEXXXXXXXXXX0
```

Should return 404 from GLEIF -> RETRY response with error message.

Done when: Real GLEIF API is called, valid LEI returns COMPLETE, invalid LEI returns RETRY, log lines show the actual GLEIF URL called.

---

## 10. Phase 5 — Demo Flow

### Demo Script (5-7 minutes)

**Part 1: Admin configures the flow**

1. Open https://localhost:9001/console
2. Go to Self-Registration -> Flow Builder
3. Point out "KYB Verification (GLEIF)" in the resource panel
4. Build the flow: Business Details -> KYB Verification -> User Onboard -> End
5. Click Publish
6. Show the PUT request payload in DevTools -> highlight KYBVerificationExecutor node

**Part 2: Organization self-registers**

7. Send POST /api/server/v1/flow/execute to start the flow -> show VIEW step with LEI field
8. Submit with a valid LEI (5493006MHB84DD0ZWV18)
9. Show server log: [KYB-POC] Calling GLEIF: https://api.gleif.org/...
10. Show the COMPLETE response
11. Submit with an invalid LEI -> show RETRY response with error message

**Part 3: Code walkthrough**

12. Show Executor.java interface — "this is the extension point the framework provides"
13. Show KYBVerificationExecutor.java — "this is our implementation"
14. Show FlowExecutionEngineServiceComponent.java setExecutors() — "OSGi wires it automatically"
15. Show TaskExecutionNode.java resolveExecutor() — "engine looks up by name at runtime"

---

## 11. OSGi Quick Reference

### How executors are plugged in

```java
// In FlowExecutionEngineServiceComponent.java
@Reference(
    service = Executor.class,
    cardinality = ReferenceCardinality.MULTIPLE,  // many executors allowed
    policy = ReferencePolicy.DYNAMIC              // can come/go at runtime
)
protected void setExecutors(Executor executor) {
    // Called for EVERY registered Executor service, including yours
    FlowExecutionEngineDataHolder.getInstance()
        .getExecutors()
        .put(executor.getName(), executor);  // keyed by getName()
}
```

### How the engine finds your executor at runtime

```java
// In TaskExecutionNode.java
String executorName = configs.getExecutorConfig().getName(); // "KYBVerificationExecutor"
Executor executor = FlowExecutionEngineDataHolder
    .getInstance()
    .getExecutors()
    .get(executorName); // looks up your instance by name
executor.execute(context);
```

### Why the name must match exactly

The flow definition stored in the DB has "name": "KYBVerificationExecutor". When the engine loads the graph, it uses that string to look up the executor from the OSGi registry. If getName() returns anything different, you get ERROR_CODE_UNSUPPORTED_EXECUTOR.

---

## 12. Debugging Guide

### Frontend

| Symptom | Check |
|---------|-------|
| KYB step not in panel | steps.json has "showOnResourcePanel": true and "category": "WORKFLOW" |
| Publish payload missing meta | Breakpoint in transform-flow.ts, check omit() calls don't strip your meta fields |
| Flow doesn't reload correctly | Check generateSteps() in the provider — it must reconstruct metadata from GET response |

### Backend

| Symptom | Check |
|---------|-------|
| ERROR_CODE_UNSUPPORTED_EXECUTOR | Executor not registered; look for [KYB-POC] registered log line |
| Executor registered but not called | Check executor name in DB vs getName() — must be identical |
| GLEIF call throws exception | Check HTTP client imports, check network access from server |
| NullPointerException in execute() | context.getUserInputData() may be null; always null-check |

### Log lines to watch in wso2carbon.log

```
[KYB-POC] KYBVerificationExecutor registered successfully.
[KYB-POC] KYBVerificationExecutor triggered for tenant: carbon.super
[KYB-POC] Calling GLEIF: https://api.gleif.org/api/v1/lei-records/...
[KYB-POC] LEI verified successfully: ...
```

---

## 13. Common Errors and Fixes

### KYB step not visible in resource panel

Check:
- "showOnResourcePanel": true in steps.json display block
- "category": "WORKFLOW" — the panel filters by category
- Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

### ERROR_CODE_UNSUPPORTED_EXECUTOR in server log

Means TaskExecutionNode.resolveExecutor() got null. Causes:

1. Executor registration line was not reached — check the full stack trace above this log line
2. getName() returns a different string than what is stored in the flow definition — must match exactly
3. Running the wrong build — did you rebuild and redeploy the JAR?

### java.lang.ClassNotFoundException: KYBVerificationExecutor

If you added the class to the existing execution engine bundle, this should not happen. If it does, check that the class is in the correct package under the module's src/main/java directory.

### GLEIF API returns 429 Too Many Requests

GLEIF has rate limits. Add a 1-second delay between calls for testing. This is unlikely to be an issue during a demo.

---

## 14. Open Questions for Mentor

Clarify these before starting:

1. **Executor name**: Use KYBExtensionExecutor (already in steps.json) or rename to KYBVerificationExecutor? Pick one and be consistent everywhere.

2. **Module location**: Executor inside existing flow.execution.engine module (fast POC) or new separate Maven module (cleaner)? For the POC, existing module is recommended.

3. **LEI claim URI**: Should organization.lei be a custom claim URI or does WSO2 have a preferred pattern for custom org attributes?

4. **Feature pack**: If a new Maven module is created, which feature XML file should include it for the IS distribution?

5. **Demo environment**: Local IS or deployed instance?

6. **Real GLEIF vs mock**: Is calling the real GLEIF API from the dev environment acceptable? If not, a WireMock stub can simulate responses.

---

## Implementation Order Summary

```
Phase 0  ->  Trace existing flow  (read + debug, no code changes)
Phase 1  ->  Edit steps.json  (30 min, frontend only)
Phase 2  ->  KYBVerificationExecutor.java + register in activate()  (2-3 hrs)
Phase 3  ->  End-to-end API test  (1-2 hrs)
Phase 4  ->  Replace stub with real GLEIF call  (1-2 hrs)
Phase 5  ->  Demo preparation  (30 min)
```

Total realistic estimate: 1-2 days for a first POC that proves the concept end to end.

Do not try to make it perfect. Prove it works.

---

*Last updated: 2026-06-29 — Project 671 Intern POC Plan*
