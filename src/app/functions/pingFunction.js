/**
 * Canonical 2026.03 endpoint app-function shape.
 *
 * Returns {statusCode, body, headers} as required by HubSpot Developer Platform
 * serverless functions. The body wraps {outputFields:{...}} which is the
 * documented response shape for a workflow-action actionUrl endpoint.
 *
 * NOTE: In this reference project the app-function is NOT called by the
 * workflow-action at runtime (BAC's diagnostic showed there is no public
 * binding between same-project workflow-actions and app-functions on 2026.03).
 * The function is here to demonstrate the canonical 2026.03 serverless shape
 * for completeness.
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
