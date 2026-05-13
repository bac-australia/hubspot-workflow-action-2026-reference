# Diagnosis - HubSpot Workflow Action "Empty Response Body" Symptom

Reference write-up produced by BAC, May 2026, in response to a client report that custom workflow action steps were failing with "The response body for this request was empty" and "An unknown error occurred" on HubSpot Developer Platform 2026.03.

> **Trying to fix this symptom in your own portal?** Use [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - step-by-step diagnosis with decision tree and copy-paste commands. This document is the empirical findings reference (what BAC tested, what was true, why).

## Summary

The reported symptom does not match a HubSpot runtime bug. BAC built this reference project, deployed it to a BAC-owned HubSpot portal, fired a workflow end-to-end, and captured the full lifecycle. HubSpot behaved as documented.

Most likely causes of the symptom:

- Registered `actionUrl` on the failing action is a placeholder or unreachable.
- Registered `actionUrl` returns a non-2xx with no body.
- `PRE_ACTION_EXECUTION` (legacy v4 inline function) is returning the wrong shape - it must return `{webhookUrl, body, contentType, accept, httpMethod}`, not `{outputFields:{...}}`.

Test 1 in section 5 isolates the cause in 30 seconds.

## 1. What the 2026.03 workflow-action component actually looks like

BAC cloned HubSpot's official `HubSpot/hubspot-project-components` repo and inspected `2026.03/components/workflow-actions/workflow-actions-hsmeta.json`. The complete schema under `config` is:

```
actionUrl              HTTPS endpoint HubSpot POSTs to at runtime
isPublished            Boolean, controls visibility in the workflow editor
supportedClients       Array of {client: "WORKFLOWS"} or {client: "AGENTS"} objects
inputFields            Array of user-configured inputs
labels                 en-locale strings
objectTypes            ["DEAL"], ["CONTACT"], etc.
```

Concrete `supportedClients` shape (deploys cleanly on 2026.03):

```json
"supportedClients": [
  {"client": "WORKFLOWS"},
  {"client": "AGENTS"}
]
```

No `functions` field, no `PRE_ACTION_EXECUTION`, no inline JS hook anywhere in the 2026.03 workflow-action schema. The only mechanism by which a 2026.03 workflow-action invokes code is the `actionUrl` HTTPS endpoint. HubSpot's `HUBSPOT_WORKFLOW_ACTIONS.md` in the same repo confirms it directly:

> When the workflow executes, HubSpot sends an HTTPS POST request to your `actionUrl` with the configured input values and workflow context.

## 2. Empirical end-to-end test

BAC built this project using the canonical 2026.03 pattern: a workflow-action whose `actionUrl` points at a webhook.site echo URL. Deployed to a BAC-owned standard portal. Auto-installed (static-token private app). Created a test deal, wired a 1-step deal workflow with the action, manually enrolled.

### 2.1 HubSpot's actual POST payload to actionUrl

```json
{
  "callbackId": "ap-XXXXXXX-XXXXXXXXXXXX-1-0",
  "origin": {
    "portalId": XXXXXXX,
    "actionDefinitionId": XXXXXXXXX,
    "actionDefinitionVersion": 3,
    "extensionDefinitionId": XXXXXXXXX,
    "extensionDefinitionVersionId": 3
  },
  "context": {
    "workflowId": XXXXXXXXXX,
    "actionId": 1,
    "source": "WORKFLOWS"
  },
  "object": {
    "objectId": XXXXXXXXXXX,
    "objectType": "DEAL"
  },
  "fields":      { "message": "hello", "priority": "high" },
  "inputFields": { "message": "hello", "priority": "high" },
  "typedInputs": {
    "message":  { "value": "hello", "type": "STRING" },
    "priority": { "value": "high",  "type": "STRING" }
  }
}
```

### 2.2 Response behaviour

webhook.site returned `HTTP 200` with a non-JSON HTML body ("This URL has no default content configured"). HubSpot recorded the action as **"Action succeeded"** with status code 200 and continued the workflow to End.

Verified empirical contract:

- HubSpot does call `actionUrl` with the full workflow context payload.
- HubSpot accepts any 2xx response as success. It does NOT validate the response body shape.
- HubSpot does NOT call any same-project app-function. The `ping_function` deployed alongside the action in this project was never invoked.
- If `actionUrl` is unreachable or returns nothing, the workflow surfaces the "empty response body" symptom.

## 3. What this means for the symptom

The error message is what HubSpot surfaces when the HTTP request to `actionUrl` fails to resolve or returns nothing. It is NOT what HubSpot would say if `actionUrl` returned 200 with a malformed body. That path was tested live and came back as "Action succeeded".

| Cause | Description | Likelihood |
|---|---|---|
| Placeholder or unreachable `actionUrl` | Registered value is `https://example.com`, a stale dev URL, or anything that doesn't resolve. HubSpot dispatches, the call fails or returns empty, symptom appears. **Check this first.** | High |
| `actionUrl` returns non-2xx with no body | The `actionUrl` points at infrastructure that responds with a 5xx and no payload. | Medium |
| Mis-shaped `PRE_ACTION_EXECUTION` | An inline `PRE_ACTION_EXECUTION` function is registered and returns `{outputFields:{...}}` instead of `{webhookUrl, body, contentType, accept, httpMethod}`. With no `webhookUrl`, HubSpot dispatches the transformed request to nothing. Only relevant if the action carries an inline function, which 2026.03 hsmeta-managed actions typically do not. | Medium |
| Action never had a `PRE_ACTION_EXECUTION` and the symptom is unrelated to either | If the v4 GET shows `functions: []` and a valid-looking `actionUrl`, the cause is elsewhere - escalate to HubSpot Support with the evidence captured. | Lower, but not zero |

Correct legacy v4 `PRE_ACTION_EXECUTION` return shape:

```js
exports.main = function(event, callback) {
  return callback({
    webhookUrl: "...",
    body: "...",
    contentType: "application/json",
    accept: "application/json",
    httpMethod: "POST"
  });
};
```

## 4. Structural finding - `functions` field is read-only via public API

BAC attempted to inject a `PRE_ACTION_EXECUTION` function onto a hsmeta-managed action via the public v4 API using a developer API key. Four mutation paths tried:

| Request | Response |
|---|---|
| `PUT /automation/v4/actions/{appId}/{actionId}` | HTTP 405 |
| `PATCH /automation/v4/actions/{appId}/{actionId}` | HTTP 200, `functions` field silently dropped, `revisionId` incremented |
| `POST /automation/v4/actions/{appId}/{actionId}/functions` | HTTP 405 |
| `PUT /automation/v4/actions/{appId}/{actionId}/functions/PRE_ACTION_EXECUTION` | HTTP 415 |

The `functions` field on a hsmeta-managed action is read-only via the public API. GET surfaces it as an empty array, but no public mutation path accepts a `PRE_ACTION_EXECUTION` insertion. The PATCH that returned 200 silently dropped the `functions` payload (HubSpot's standard "drop unknown fields on PUT" behaviour).

So one of the following must be true on the affected portal:

- The failing action is not managed by the 2026.03 hsmeta pipeline. It may have been registered directly via the v4 API at an earlier date, with the project skeleton being a separate artefact from the registered action.
- HubSpot has an internal binding mechanism for inline functions on hsmeta-managed actions that is not part of the public API surface.
- The `PRE_ACTION_EXECUTION` entry is being silently dropped by HubSpot on registration, making it a no-op. In that case the action dispatches directly to whatever `actionUrl` was registered.

## 5. Three concrete tests

Test 1 alone is likely to isolate the cause.

### Test 1 - Read the registered action

Using a developer API key for the affected portal:

```bash
curl "https://api.hubapi.com/automation/v4/actions/{app_id}?hapikey={dev_key}"
```

Inspect:
- What is `actionUrl`? If it's a placeholder or unreachable, that's the bug.
- What is in `functions`? Empty array, populated with `PRE_ACTION_EXECUTION`, something else?
- Record `id` and `revisionId` for follow-up.

### Test 2 - Swap actionUrl to a webhook.site URL

Update the action's `actionUrl` to a fresh webhook.site URL. Redeploy. Re-fire the workflow.

- If the POST hits webhook.site and the action records "Action succeeded" → isolated to the original `actionUrl` value.
- If empty-body persists → issue is upstream of `actionUrl` resolution, likely a `PRE_ACTION_EXECUTION` returning malformed webhook descriptor.

### Test 3 - Clone this repo

```
git clone https://github.com/bac-australia/hubspot-workflow-action-2026-reference.git
```

Deploy into a dev portal under a different uid. If it works as expected, you have a known-good baseline to migrate against.

## 6. Documentation references

| Reference | URL |
|---|---|
| Canonical 2026.03 sample components | https://github.com/HubSpot/hubspot-project-components |
| Define a custom workflow action (2026.03) | https://developers.hubspot.com/docs/apps/developer-platform/add-features/custom-workflow-actions |
| Serverless functions reference (Developer Projects) | https://developers.hubspot.com/docs/platform/serverless-functions |
| v4 custom workflow actions reference (legacy) | https://developers.hubspot.com/docs/api-reference/automation-actions-v4-v4/custom-action-reference |
| v4 Automation API guide | https://developers.hubspot.com/docs/guides/api/automation/custom-workflow-actions |
| Spring 2026 Spotlight changelog | https://developers.hubspot.com/changelog/spring-2026-spotlight |
