# Troubleshooting Guide - HubSpot Workflow Action "Response Body Was Empty"

Step-by-step guide for diagnosing and fixing the HubSpot custom workflow action symptom: **action steps fail with "The response body for this request was empty" / "An unknown error occurred"** on HubSpot Developer Platform 2026.03.

If you want the empirical findings BAC captured while building this guide, see [DIAGNOSIS.md](./DIAGNOSIS.md).

## Contents

1. [Before you start - prerequisites](#before-you-start)
2. [Step 1 - Fetch the registered action via v4 API](#step-1)
3. [Step 2 - Interpret the response (decision tree)](#step-2)
4. [Path A - `actionUrl` is a placeholder / unreachable](#path-a)
5. [Path B - `actionUrl` is real, `functions[]` is empty](#path-b)
6. [Path C - `functions[]` contains a `PRE_ACTION_EXECUTION`](#path-c)
7. [Step 3 - Webhook.site smoke test (universal sanity check)](#step-3)
8. [Step 4 - Clone this repo for side-by-side comparison](#step-4)
9. [Step 5 - Fallback: HubSpot Support escalation](#step-5)
10. [Cheat sheet](#cheat-sheet)

---

<a id="before-you-start"></a>
## Before you start - prerequisites

### What you need

- The **app ID** of the HubSpot private app that owns the failing workflow-action.
- A **developer API key** for the developer account that owns the app. NOT a Private App PAT.
- A terminal with `curl`, or willingness to paste URLs into a browser.
- Source code of the project containing the failing workflow-action - particularly `src/app/workflow-actions/*-hsmeta.json` and any function file it references.

### How to find your app ID

You need the numeric ID of the app that owns the failing workflow-action.

1. Log into HubSpot on your **developer account** (the parent account, not the install/production portal). If you don't know which account this is, run `hs accounts list` in a terminal where the HubSpot CLI is configured - look for an account labelled `[developer]` or `[test account]`.
2. Visit https://app.hubspot.com/developer-projects (you'll need to be on the developer account; HubSpot will redirect if you're on the wrong portal).
3. Click into the project that contains the failing workflow-action (e.g. `tcl-automations` or whatever it's named).
4. On the left-hand component tree, click the app component (it's the `</>` icon, typically named like `*_app` or matching your project name).
5. The **App ID** appears in the top-right of the app details panel. It's a numeric string like `39406169`. Copy it.

Alternative: if you have the HubSpot CLI configured, run `hs project info` from inside the project directory and look for the `App ID:` line.

### How to find or generate a developer API key

You need a key that's specific to your **developer account**, not a regular Private App PAT.

1. Log into HubSpot on your developer account (same account as the app ID step above).
2. Visit https://app.hubspot.com/l/developer-api-key. This redirects to the API key page for whichever HubSpot account you're currently logged into.
3. If a key already exists, click **Show** and copy it. If not, click **Generate** to create one.

If the page says "Developer API keys are disabled for this account": some newer developer accounts have hapikey generation disabled by default. Open a HubSpot Support ticket asking them to enable developer API keys for the account - they typically turn it on within a few hours.

**Important:** developer API keys are different from Private App PATs (`pat-na1-...`). The PAT belongs to a specific portal and uses bearer-token auth (`Authorization` header). The developer API key belongs to the developer account and is passed as a `?hapikey=...` query parameter. They are not interchangeable on the `/automation/v4/actions/...` endpoints.

### Auth on the v4 actions endpoint

The `/automation/v4/actions/{appId}` endpoint requires a **developer API key** passed as a query parameter:

```
?hapikey={your_developer_api_key}
```

Developer API keys belong to a HubSpot **developer account** (the parent account that owns app registrations). Issued at https://app.hubspot.com/l/developer-api-key while logged into the developer account.

Bearer-token / OAuth credentials are NOT accepted on this endpoint. Verified by BAC: passing a Private App PAT (`pat-na1-...`) via `Authorization: Bearer ...` returns:

```
HTTP 403
{
  "status": "error",
  "message": "This API can't be called using an OAuth access token.
              A valid developer API key must be provided in the
              `hapikey` query parameter, and a valid `appId` must
              be provided in the API request.",
  "category": "INVALID_AUTHENTICATION"
}
```

Developer hapikeys are a different credential type from regular HubSpot API keys. Despite the broader API-key deprecation, developer hapikeys for the `/automation/v4/actions/...` family are still the documented and only-accepted path as of May 2026.

### Secrets handling

The developer API key is a secret. Do NOT paste it into Linear, Slack, Gmail, Google Docs, or anywhere else that persists or is shared. Hold it in an environment variable only and never echo it from scripts. If a screenshot accidentally captures it, rotate the key.

---

<a id="step-1"></a>
## Step 1 - Fetch the registered action via v4 API

This is the single most useful diagnostic. It pulls the live registered definition of the failing workflow-action from HubSpot's backing store and shows exactly what HubSpot will dispatch to at runtime.

### The curl

```bash
curl "https://api.hubapi.com/automation/v4/actions/{APP_ID}?hapikey={DEV_KEY}"
```

Substitute `{APP_ID}` with the failing app ID, and `{DEV_KEY}` with the developer API key.

### Browser alternative (not recommended for secrets reasons)

Pasting the same URL into a browser tab will return the JSON response, but the URL containing the developer API key will be written to browser history, sync, and any corporate proxy logs. Prefer curl. If you must use a browser, use a private/incognito window and clear history afterwards. Rotate the key if it might have been logged.

### Expected response shape (redacted example)

```json
{
  "results": [
    {
      "actionUrl": "https://example.com/...",
      "published": true,
      "functions": [],
      "id": "264737568",
      "revisionId": "3",
      "inputFields": [...],
      "objectRequestOptions": null,
      "labels": {...},
      "objectTypes": []
    }
  ]
}
```

The endpoint returns a list of all actions belonging to the app, not a single one. If the app has multiple workflow-actions, the failing one will be in the array - match by `labels.en.actionName` or by `id` if known.

---

<a id="step-2"></a>
## Step 2 - Interpret the response (decision tree)

Two fields matter: `actionUrl` and `functions`. Use the explicit checks below - don't rely on "looks like".

**Treat `actionUrl` as a placeholder / Path A if ANY of these are true:**
- Contains the string `example.com`, `localhost`, `127.0.0.1`, `PLACEHOLDER`, `TODO`, or `REPLACE`
- Points at a domain you did not intentionally configure for this workflow action
- Resolves to a hostname your team no longer operates
- Is empty, null, or absent from the response

Otherwise treat it as Path B / C territory and inspect `functions`:

```
actionUrl matches a placeholder check above?
│
├─ YES → PATH A - fix the URL.
│
└─ NO  → Check functions[]:
    │
    ├─ functions: []   (empty array)
    │   └→ PATH B - actionUrl is what HubSpot calls. Test it externally.
    │
    ├─ functions: [{ functionType: "PRE_ACTION_EXECUTION", ... }]
    │   └→ PATH C - inline function in play. Inspect functionSource for
    │      return-shape mismatch.
    │
    └─ functions is missing / null / contains anything else
        └→ Action is mis-registered. Re-register via v4 POST
           (not via hs project upload). Escalate to Step 5 if unclear.
```

---

<a id="path-a"></a>
## Path A - `actionUrl` is a placeholder / unreachable

This is the most likely scenario and the easiest fix.

### Why this produces the "response body was empty" symptom

HubSpot's workflow engine reads `actionUrl` from the registered definition and dispatches an HTTP POST to it. If the URL is unreachable (DNS fail, 404, network drop), HubSpot has nothing to record in the response body and surfaces "The response body for this request was empty" in the action log, with the event label "Action wasn't able to execute, but will retry soon".

**Empirically reproduced by BAC:** setting `actionUrl` to `https://REPLACE-ME.example.com/your-endpoint`, enrolling a test deal, and capturing the workflow action log produces exactly that output. Each enrolment triggers HubSpot's retry mechanism, so you may see multiple "wasn't able to execute" entries per enrolment before HubSpot marks the action terminally failed.

### How to confirm

Outside of HubSpot, try a POST to the registered URL with curl. If it fails:

```bash
curl -X POST "{actionUrl_value}" \
  -H "Content-Type: application/json" \
  -d '{"test":"ping"}' \
  -i
```

If you see DNS resolution failure, connection refused, 404, or empty body - the URL is the bug.

### Fix

1. Update `actionUrl` in `src/app/workflow-actions/*-hsmeta.json` to point at a real HTTPS endpoint you control.
2. Redeploy:
   ```bash
   hs project upload --account=<your_portal_id>
   ```
3. Re-fire the workflow on a test record. The action log should now record the actual response.

**In-flight failures self-recover.** Existing enrolments stuck in retry loops will pick up the new actionDefinitionVersion on their next retry and succeed (assuming the new URL returns 2xx). No manual re-enrolment needed. Verified by BAC: an enrolment that initially failed against version 6 (broken URL) succeeded automatically on a later retry once version 7 (working URL) was deployed.

### Quick interim fix to prove the diagnosis

Before building the real endpoint, use webhook.site as a temporary `actionUrl` to confirm the flow works end-to-end. See [Step 3](#step-3) for the procedure.

---

<a id="path-b"></a>
## Path B - `actionUrl` is real, `functions[]` is empty

The hsmeta-managed action is dispatching directly to an external URL with no inline transformation. The behaviour of `actionUrl` determines everything.

### Diagnose the endpoint behaviour

POST to the registered URL with a representative payload that mirrors HubSpot's actual workflow execution POST (captured live in BAC's empirical test - see [DIAGNOSIS.md section 2.1](./DIAGNOSIS.md#21-hubspots-actual-post-payload-to-actionurl)):

```bash
curl -X POST "{actionUrl_value}" \
  -H "Content-Type: application/json" \
  -d '{
    "callbackId": "test-callback",
    "origin": {
      "portalId": 0,
      "actionDefinitionId": 0,
      "actionDefinitionVersion": 1,
      "extensionDefinitionId": 0,
      "extensionDefinitionVersionId": 1
    },
    "context": {
      "workflowId": 0,
      "actionId": 1,
      "source": "WORKFLOWS"
    },
    "object": {
      "objectId": 0,
      "objectType": "DEAL"
    },
    "fields": { "message": "test", "priority": "high" },
    "inputFields": { "message": "test", "priority": "high" },
    "typedInputs": {
      "message": { "value": "test", "type": "STRING" },
      "priority": { "value": "high", "type": "STRING" }
    }
  }' \
  -i
```

### What to look for in the response

| Response observed | Interpretation |
|---|---|
| HTTP 200 with `{"outputFields":{...}}` | Endpoint works as intended. The workflow failure is elsewhere - escalate to Step 5. |
| HTTP 200 with empty body or non-JSON | HubSpot will still record "Action succeeded" with status 200 (confirmed live). NOT the source of "empty body" error. |
| HTTP 4xx or 5xx with no body | This IS the bug. HubSpot logs "The response body for this request was empty" and captures the status code; event label is "Action failed because of an error in the connected app, but will retry soon". Fix the endpoint to return 200 + outputFields. Verified by BAC against `https://httpbin.org/status/500`. |
| Connection timeout / DNS error | Endpoint is unreachable. Same effect as Path A - fix the URL or the infrastructure. |

---

<a id="path-c"></a>
## Path C - `functions[]` contains a `PRE_ACTION_EXECUTION`

This is the more interesting scenario. It means the action was registered with a legacy v4 inline function, likely via direct v4 API POST - NOT via `hs project upload`, since that pipeline strips the field.

### Inspect the function source

The v4 GET response will include the function verbatim:

```json
{
  "functions": [
    {
      "functionType": "PRE_ACTION_EXECUTION",
      "functionSource": "exports.main = function(event, callback) { ... };"
    }
  ]
}
```

### Check the return shape

The function MUST return a webhook-request descriptor:

```js
callback({
  webhookUrl: "...",
  body: "...",
  contentType: "application/json",
  accept: "application/json",
  httpMethod: "POST"
})
```

If instead the function returns:

```js
callback({
  outputFields: { ... }
})
```

…that's the bug. HubSpot interprets the function's return as a webhook descriptor. With no `webhookUrl`, HubSpot dispatches the transformed request to nothing, gets empty back, and logs the symptom.

### Two ways to fix

1. **Correct the function return shape** to a proper webhook descriptor. The function then transforms the outbound request, and an external `webhookUrl` handles the actual logic and returns `{outputFields:{...}}`.

2. **Drop `PRE_ACTION_EXECUTION` entirely** and migrate to the 2026.03 native pattern: just set `actionUrl` to a real HTTPS endpoint that handles the workflow execution. Cleaner, less to maintain.

### Why option 2 is usually right

`PRE_ACTION_EXECUTION` is a legacy v4 concept layered on top of an external webhook anyway. If you're going to have an external endpoint regardless, you don't need the transformer - just have `actionUrl` point at the endpoint directly.

---

<a id="step-3"></a>
## Step 3 - Webhook.site smoke test (universal sanity check)

Regardless of which path you took above, the webhook.site swap is the fastest way to confirm the 2026.03 wiring is healthy.

### Procedure

1. Open https://webhook.site in a fresh tab. A unique URL is generated automatically. Copy it.
2. In `src/app/workflow-actions/<failing-action>-hsmeta.json`, replace the `actionUrl` value with the webhook.site URL.
3. Redeploy:
   ```bash
   hs project upload --account=<your_portal_id>
   ```
4. Re-fire the failing workflow on a test record.
5. Watch webhook.site - HubSpot's POST should arrive within seconds.

### What success looks like

- webhook.site receives a POST with a JSON body containing `callbackId`, `origin`, `context`, `object`, `inputFields`, `typedInputs`.
- HubSpot's workflow action log records the action as **"Action succeeded"** with status 200 (webhook.site returns 200 by default).

If both happen, the framework is working. Whatever was broken was inside the original `actionUrl` or the inline function - not the platform.

### If webhook.site receives nothing

Something is intercepting before the HTTP dispatch. Most likely cause: a registered `PRE_ACTION_EXECUTION` returning a malformed webhook descriptor (which would override the `actionUrl` just set). Re-check `functions[]` in the v4 GET - if it's populated, jump back to [Path C](#path-c).

---

<a id="step-4"></a>
## Step 4 - Clone this repo for side-by-side comparison

If Paths A, B, C all came back clean (or inconclusive), deploy the BAC reference into a clean dev portal and confirm it works there. That isolates portal-specific issues from code-specific issues.

```bash
git clone https://github.com/bac-australia/hubspot-workflow-action-2026-reference.git
cd hubspot-workflow-action-2026-reference
```

### Adapt before deploy

- Edit `src/app/workflow-actions/pingAction-hsmeta.json` → set `actionUrl` to a fresh webhook.site URL.
- Edit `src/app/app-hsmeta.json` → change `uid` to something portal-specific so it doesn't clash with existing apps. Same for the workflow-action `uid` in `pingAction-hsmeta.json`.

### Deploy

```bash
hs project upload --account=<your_numeric_dev_portal_id> --forceCreate
```

Always use the numeric portal ID with `--account`, not the account name from `hs accounts list`. The `--forceCreate` flag tells the CLI to create the project in the target portal if it doesn't already exist; without it, the upload fails with a "project not found" prompt. Only use `--forceCreate` against a portal you intend to deploy into - it has no destructive effect on existing projects in the same portal but does silently mint a new project record if you fat-finger the account ID.

### Verify in the portal

1. App auto-installs (static-token).
2. Build a 1-step deal workflow using the BAC Ping Action.
3. Manually enrol a test deal.
4. Watch webhook.site receive HubSpot's POST.
5. Workflow action log records "Action succeeded".

### What this isolates

- If the reference works in your portal → the framework is fine on your HubSpot tenant; the issue is specific to your project source.
- If the reference does NOT work in your portal → escalate to HubSpot Support (Step 5) - there's something portal-specific in play.

---

<a id="step-5"></a>
## Step 5 - Fallback: HubSpot Support escalation

If Steps 1–4 are inconclusive, frame a precise HubSpot Support ticket using the evidence captured.

### What to include

1. **Empirical baseline from a known-good portal:** "A 2026.03 workflow-action with a webhook.site `actionUrl` fires end-to-end successfully on portal X. HubSpot accepts a 200 OK with an HTML body as 'Action succeeded'. Confirmed via workflow action log inspection." (BAC has this evidence in DIAGNOSIS.md.)
2. **The v4 GET output** for the failing action from Step 1 - paste the full JSON.
3. **Mutation attempts on the registered action** if you tried any: PUT/PATCH/POST against `/automation/v4/actions/{appId}/{actionId}`. Document the responses verbatim.
4. **The specific question:** "Is there a path to register `PRE_ACTION_EXECUTION` on a 2026.03 hsmeta-managed action that is not exposed in the public API? If so, please document. If not, please confirm the supported pattern is external HTTPS endpoint via `actionUrl`."

### Don't escalate prematurely

HubSpot Support tickets take days. Steps 1–4 will resolve almost every variant of this symptom within an hour. Only escalate if the v4 GET shows something genuinely unexpected, or if the reference repo fails in your portal.

---

<a id="cheat-sheet"></a>
## Cheat sheet

| Fact | Detail |
|---|---|
| 2026.03 workflow-action schema | `actionUrl`, `isPublished`, `supportedClients`, `inputFields`, `labels`, `objectTypes`. No `functions`, no `PRE_ACTION_EXECUTION`. |
| HubSpot's success criterion on actionUrl | Any HTTP 2xx response. Body content is NOT validated. |
| Correct actionUrl response shape (for downstream workflow steps to read outputs) | `HTTP 200` with body `{"outputFields":{...}}` |
| Correct legacy v4 `PRE_ACTION_EXECUTION` return shape | `callback({webhookUrl, body, contentType, accept, httpMethod})` |
| Wrong `PRE_ACTION_EXECUTION` return shape (common mistake) | `callback({outputFields:{...}})` - produces "empty response body" because HubSpot has no `webhookUrl` to dispatch to. |
| v4 actions GET URL | `https://api.hubapi.com/automation/v4/actions/{appId}?hapikey={dev_key}` |
| `functions` field mutability | Read-only via public v4 API on hsmeta-managed actions. PATCH 200 silently drops it; PUT 405; sub-resource POST 405. |
| `supportedClients` shape | Object form only (`[{"client": "WORKFLOWS"}]`). String form `["WORKFLOWS"]` is rejected at deploy with `must be object` validation error. |
| `objectTypes: []` semantics | Accepted by deploy. Likely means "any object type" (vs an explicit list like `["DEAL"]`). |
| HubSpot retry behaviour on failed workflow actions | HubSpot retries automatically. Failed actions show "but will retry soon" in the event label. Multiple log entries per enrolment are normal; the action is only terminally failed after retries are exhausted. |
| Retry uses CURRENT registered actionDefinitionVersion | Each retry picks up the latest registered action definition, NOT the version captured at enrolment. Practical: if you fix a broken `actionUrl`, in-flight failed enrolments will self-recover via retries. Verified by BAC: enrolment fired against actionDefinitionVersion 6 (broken URL), retried, succeeded against version 7 (fixed URL) after redeploy mid-retry. |
| Smoke-test echo service | https://webhook.site |
| HubSpot developer escalation (when end-user support won't help) | https://integrate.hubspot.com - open a developer-platform ticket with the v4 GET output and your reproduction steps |
