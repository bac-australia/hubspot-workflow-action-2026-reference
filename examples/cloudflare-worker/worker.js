/**
 * Cloudflare Worker — HubSpot Developer Platform 2026.03 workflow action handler.
 *
 * Receives the workflow execution POST that HubSpot sends to a custom
 * workflow-action's actionUrl. Responds with the {outputFields: {...}} shape
 * HubSpot needs to mark the action succeeded and continue the workflow.
 *
 * Deploy:
 *   npm install -g wrangler
 *   wrangler login
 *   wrangler deploy
 *
 * Then take the deployed URL (printed by wrangler) and put it in your
 * workflow-action's actionUrl field. See ./README.md for full steps.
 */

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ error: "Invalid JSON body" }, 400);
    }

    // Extract from HubSpot's workflow execution payload.
    // Full payload shape (captured from a real HubSpot POST):
    //   {
    //     callbackId, origin, context, object,
    //     fields, inputFields, typedInputs
    //   }
    const { object = {}, inputFields = {}, callbackId } = payload;

    // ====== REPLACE THIS BLOCK WITH YOUR BUSINESS LOGIC ======
    // The example below just echoes the inputFields back. In a real workload
    // you would do whatever your action needs to do:
    //   - look up the next deal number
    //   - flip a renewal status based on a calculation
    //   - dispatch a Teams / Slack notification
    //   - call an internal API
    // Then return the result via outputFields.
    const outputFields = {
      ping_result: "pong",
      echoed_message: inputFields.message ?? "(no message provided)",
      echoed_priority: inputFields.priority ?? "(no priority provided)",
      object_id: String(object.objectId ?? ""),
      object_type: String(object.objectType ?? ""),
      processed_at: new Date().toISOString(),
      callback_id: callbackId ?? "",
    };
    // =========================================================

    return json({ outputFields }, 200);
  },
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
