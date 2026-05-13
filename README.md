# hubspot-workflow-action-2026-reference

A minimal, working reference for the HubSpot Developer Platform 2026.03 custom workflow-action pattern. Built and validated end-to-end by BAC, May 2026.

> Status: reference repository, not actively maintained. Validated on HubSpot CLI 8.6.0 against platformVersion 2026.03. HubSpot platform versions drift; if you're on a later platformVersion, treat this as a starting point and confirm the canonical sample in [HubSpot/hubspot-project-components](https://github.com/HubSpot/hubspot-project-components) for the current schema.

- **Hitting "response body was empty" right now?** → [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - step-by-step diagnosis and fix.
- **Want the empirical findings?** → [DIAGNOSIS.md](./DIAGNOSIS.md) - what BAC tested, what was true, why.
- **MIT licensed.** See [LICENSE](./LICENSE).

## What this demonstrates

The canonical wiring for a `workflow-action` component on platformVersion 2026.03:

1. A `workflow-action` hsmeta.json with `actionUrl` pointing at an external HTTPS endpoint
2. HubSpot POSTs a workflow execution payload to that URL at runtime
3. The endpoint responds with `HTTP 2xx` (any 2xx; HubSpot does not validate response body shape)
4. The workflow records the action as succeeded and continues

## What this is NOT

This is **not** a binding between a 2026.03 `workflow-action` and a same-project `app-function`. BAC probed extensively and found no public mechanism for that binding - the workflow-action requires an externally hosted HTTPS endpoint, full stop. The included `app-function` files are illustrative only; they are not invoked by the workflow-action at runtime.

## Files

| Path | Purpose |
|---|---|
| `hsproject.json` | Pins `platformVersion: 2026.03` |
| `src/app/app-hsmeta.json` | Static private app definition |
| `src/app/workflow-actions/pingAction-hsmeta.json` | Workflow action with placeholder `actionUrl` (replace before deploy) |
| `src/app/functions/pingFunction-hsmeta.json` | Endpoint app-function declaration |
| `src/app/functions/pingFunction.js` | Async function with the canonical 2026.03 `{statusCode, body, headers}` shape |
| `src/app/functions/package.json` | Required by HubSpot CLI for any function component |

## Quick start

1. Edit `src/app/workflow-actions/pingAction-hsmeta.json` - replace the placeholder `actionUrl` (`https://REPLACE-ME.example.com/your-endpoint`) with a webhook.site URL (for live testing) or your own external HTTPS endpoint
2. Edit `src/app/app-hsmeta.json` - update `support.*` and any other fields
3. Deploy to your numeric portal ID:
   ```
   hs project upload --account=<your-numeric-portal-id>
   ```
   Always pass `--account=<numeric-portal-id>` explicitly. Relying on the CLI's default account can push to the wrong portal.
4. After the first deploy, the static-token private app auto-installs in the portal
5. Verify the action is registered: open `Automation > Workflows`, click `+` to add an action, search for "BAC Ping Action". It should appear under Apps / Custom actions
6. Create a deal-based workflow with the action, configure inputs, save, publish
7. Enrol a deal manually and watch your `actionUrl` receive the POST

## Where `PRE_ACTION_EXECUTION` lives (it's not here)

`PRE_ACTION_EXECUTION` is a legacy v4 Automation API concept (`/automation/v4/actions/{appId}`). In that paradigm it is an inline **request transformer** that must return `{webhookUrl, body, contentType, accept, httpMethod}` - NOT `{outputFields:{...}}`. It does not appear to be reachable via the 2026.03 hsmeta pipeline (see DIAGNOSIS.md section 4).

If you need legacy v4 inline functions, register the action via the v4 API directly (not via `hs project upload`), and use the correct return shape. Returning `{outputFields:{...}}` from a `PRE_ACTION_EXECUTION` function produces the "response body was empty" failure because HubSpot has no `webhookUrl` to dispatch the transformed request to.
