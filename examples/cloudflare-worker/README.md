# Cloudflare Worker — HubSpot workflow action handler

Drop-in working endpoint that backs a HubSpot Developer Platform 2026.03 custom workflow-action. Receives HubSpot's workflow execution POST, runs your business logic, returns the `outputFields` shape HubSpot expects.

## Why Cloudflare Worker

Recommended path for most HubSpot workflow-action endpoints:

- **Free tier covers 100K requests/day** - more than enough for typical workflow action volumes
- **5-minute deploy** - one CLI command, no infrastructure setup
- **Global edge** - ~10ms latency from anywhere
- **No cold starts** - Workers are warm by default
- **No server to maintain** - serverless from day one

Alternative endpoints (AWS Lambda Function URL, Vercel function, Netlify function, internal Node server) work identically. The contract is the same: accept POST, return `{outputFields:{...}}` with HTTP 200.

## Prerequisites

- A Cloudflare account (free signup at https://dash.cloudflare.com/sign-up - no credit card required for the free tier)
- Node.js 18+ on your local machine

## Deploy

```bash
# Install wrangler (Cloudflare's CLI) globally
npm install -g wrangler

# Authenticate (opens browser)
wrangler login

# From this directory:
wrangler deploy
```

Wrangler will print the deployed URL on success. It looks like:

```
https://hubspot-workflow-action-handler.<your-subdomain>.workers.dev
```

Copy that URL.

## Wire it up to your HubSpot workflow action

1. Open the parent project (the directory containing `hsproject.json` for your HubSpot project).
2. Edit `src/app/workflow-actions/<your-action>-hsmeta.json`.
3. Replace the `actionUrl` value with your Worker URL:
   ```json
   "actionUrl": "https://hubspot-workflow-action-handler.<your-subdomain>.workers.dev"
   ```
4. Redeploy your HubSpot project:
   ```
   hs project upload --account=<your-numeric-portal-id>
   ```
5. Re-fire the workflow. The action should now hit your Worker and record "Action succeeded" in the action log.

## Verify it works

After deploy, test the Worker independently:

```bash
curl -X POST "<your-worker-url>" \
  -H "Content-Type: application/json" \
  -d '{
    "callbackId": "test-callback",
    "origin": {"portalId": 0, "actionDefinitionId": 0},
    "context": {"workflowId": 0, "actionId": 1, "source": "WORKFLOWS"},
    "object": {"objectId": 12345, "objectType": "DEAL"},
    "inputFields": {"message": "hello", "priority": "high"}
  }' -i
```

Expected: `HTTP 200` with body `{"outputFields":{...}}`. If you see that, the Worker is healthy and HubSpot will accept it.

## Customise for your use case

The Worker as-shipped just echoes inputs back. Replace the block marked `REPLACE THIS BLOCK WITH YOUR BUSINESS LOGIC` in `worker.js` with the actual logic your action needs to do. Examples:

- **Deal numbering**: look up the highest existing deal number, increment, return as `outputFields.deal_number`
- **Renewal status flip**: read the contract end date from the payload, decide active/expired, return `outputFields.renewal_status`
- **Teams / Slack notification**: POST to a webhook, return `outputFields.notification_sent` boolean
- **External API enrichment**: call your CRM / billing / inventory system, return the enriched data in outputFields

You can also call HubSpot's own API from inside the Worker if you need to read more record data than the workflow payload includes. Use a Private App PAT from the install portal as a bearer token.

## Local development

```bash
wrangler dev
```

Runs the Worker locally on `http://localhost:8787`. Use ngrok or similar to expose it to HubSpot for end-to-end testing, or just curl it locally as in "Verify it works" above.

## Cost

Free tier: 100,000 requests/day, 10ms CPU time per request. For HubSpot workflow actions:

- If you fire 1 workflow action per deal and process 100 deals/day → 100 requests/day → free
- If you have 5 actions firing on every deal across 1,000 deals/day → 5,000 requests/day → still free
- If you exceed the free tier: Workers Paid is $5/month for 10M requests

If your HubSpot workflow volume is high enough to exceed Cloudflare's free tier, it's high enough to justify any of the paid options anyway.
