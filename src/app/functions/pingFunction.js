/**
 * ILLUSTRATIVE ONLY - this function is NOT invoked at runtime by the workflow-action
 * in this project. On HubSpot Developer Platform 2026.03 there is no public
 * mechanism to bind a same-project app-function as the backing for a
 * workflow-action; the workflow-action's actionUrl must point at an externally
 * hosted HTTPS endpoint. See DIAGNOSIS.md for the empirical evidence.
 *
 * This file is included as a reference for what a 2026.03 endpoint app-function
 * looks like, and the response shape an actionUrl endpoint would return to a
 * workflow execution request: {statusCode, body, headers} where the body wraps
 * {outputFields:{...}}. If you stand up an external service (e.g. Cloudflare
 * Worker, AWS Lambda Function URL) to back your workflow-action, this is the
 * shape to mirror.
 */
exports.main = async (context) => {
  const inputFields = context?.body?.inputFields ?? {};
  const callbackId = context?.body?.callbackId ?? null;

  return {
    statusCode: 200,
    body: JSON.stringify({
      outputFields: {
        ping_result: "pong",
        echoed_message: inputFields.message ?? "(no message provided)",
        echoed_priority: inputFields.priority ?? "(no priority provided)",
        build_tag: "20260513-bac-reference",
        callback_id_received: callbackId ?? "(none)"
      }
    }),
    headers: {
      "Content-Type": "application/json"
    }
  };
};
