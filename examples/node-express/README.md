# Node + Express — HubSpot workflow action handler

Drop-in alternative to the Cloudflare Worker for teams already running Node.js services. Same contract, different runtime.

If you're building from scratch and just want the easiest path, use the [cloudflare-worker example](../cloudflare-worker/) instead. This example is for teams that need to integrate the endpoint into an existing Node fleet.

## What it does

Express server with two endpoints:

- `POST /workflow-action` - receives HubSpot's workflow execution payload, returns `{outputFields:{...}}` shape with HTTP 200
- `GET /health` - health check for load balancers / monitoring

## Run locally

```bash
npm install
node server.js
```

Server listens on `http://localhost:3000` by default. Override with `PORT` env var.

Test it:

```bash
curl -X POST "http://localhost:3000/workflow-action" \
  -H "Content-Type: application/json" \
  -d '{
    "callbackId": "test-callback",
    "object": {"objectId": 12345, "objectType": "DEAL"},
    "inputFields": {"message": "hello", "priority": "high"}
  }' -i
```

Expected: HTTP 200 with `{"outputFields":{...}}`.

## Deploy options

Pick whichever your team already operates:

| Platform | Effort | Notes |
|---|---|---|
| **Render** | 5 min | Connect GitHub repo, autodeploys on push. Free tier with spin-down or $7/mo always-on. |
| **Fly.io** | 5 min | `fly launch`. Free allowance covers small workloads. |
| **AWS Lambda Function URL** | 30 min | Wrap the Express handler with `serverless-http`. Cheapest at scale. |
| **AWS EC2 / DigitalOcean / your own VM** | Hours | If you already operate VMs. Slowest path. |
| **Vercel / Netlify** | 15 min | Use their serverless function adapters. |

Whatever you pick, the deployed HTTPS URL is what goes in the workflow-action's `actionUrl` field.

## Wire it up to your HubSpot workflow action

1. Get the public HTTPS URL of your deployed server (e.g. `https://hubspot-workflow.your-domain.com/workflow-action`).
2. Edit `src/app/workflow-actions/<your-action>-hsmeta.json` in your HubSpot project:
   ```json
   "actionUrl": "https://hubspot-workflow.your-domain.com/workflow-action"
   ```
3. Redeploy:
   ```
   hs project upload --account=<your-numeric-portal-id>
   ```
4. Re-fire the workflow. The action log should record "Action succeeded".

## Customise for your use case

Replace the block marked `REPLACE THIS BLOCK WITH YOUR BUSINESS LOGIC` in `server.js` with whatever logic your action needs:

- Deal numbering, renewal status flips, notifications, external API calls, etc.
- Add additional routes for different workflow actions if you have several (one server, multiple endpoints).

## Production considerations

The example is intentionally minimal. For production you'll likely want:

- **Auth**: HubSpot doesn't sign workflow execution requests by default. If your endpoint is publicly reachable, either accept that anyone can POST to it (and your logic must be idempotent / safe to call from anywhere) OR add a shared-secret header check.
- **Logging**: structured logs (req ID, callbackId, object IDs) for tracing.
- **Error handling**: return 5xx with details so HubSpot's retry mechanism can take over.
- **Timeouts**: respond within HubSpot's tolerance (~20 seconds; longer than that and the workflow may time out the action even if your server returns later).
- **Concurrency**: Express handles this natively; just don't block the event loop with sync work.
