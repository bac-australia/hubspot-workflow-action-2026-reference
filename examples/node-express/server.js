/**
 * Express server - HubSpot Developer Platform 2026.03 workflow action handler.
 *
 * Drop-in alternative to the Cloudflare Worker example for teams that
 * already run Node.js services. Same contract, different runtime.
 *
 * Run locally:
 *   npm install
 *   node server.js
 *
 * Deploy to anywhere that hosts Node (Render, Fly.io, Heroku, AWS EC2,
 * your own VM). The actionUrl Tecala configures in the hsmeta points at
 * the public HTTPS URL of the deployed server.
 */

const express = require("express");
const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/workflow-action", (req, res) => {
  const { object = {}, inputFields = {}, callbackId } = req.body || {};

  // ====== REPLACE THIS BLOCK WITH YOUR BUSINESS LOGIC ======
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

  res.status(200).json({ outputFields });
});

// Health check for load balancers / monitoring
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`HubSpot workflow action handler listening on :${port}`);
  console.log(`POST /workflow-action`);
});
