const PIXEL_ID = "887795953976121";
const ACCESS_TOKEN = "EAAZCk3SZBuRIYBSBM3jXoHr9SnwxzAIk0ElvgGhMtvLUGZCMauFMUXZAeyKzJqdQtAbU5hZCitfR9EHCSit14zszOItceoh5KUdVb1VhALYZChVIOpwozZC7zQ4uO4o5ZBF9eQYn70XH1z9o313AV3HDukpw01OhzU6Yud9cZCNlzSCSRFQ99imjggM0VVU60iUuUggZDZD";
const CAPI_URL = `https://graph.facebook.com/v18.0/${PIXEL_ID}/events`;
const crypto = require("crypto");

function hashSHA256(value) {
  if (!value) return undefined;
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "" };

  let body;
  try { body = JSON.parse(event.body || "{}"); } 
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { eventName, eventId, sourceUrl, email, phone, value, currency, contentIds, contentName, userAgent } = body;

  if (!eventName) return { statusCode: 400, headers, body: JSON.stringify({ error: "eventName required" }) };

  const capiEvent = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId || `${eventName}_${Date.now()}`,
    event_source_url: sourceUrl || "https://sekoafriktrade.netlify.app",
    action_source: "website",
    user_data: {
      em: hashSHA256(email),
      ph: hashSHA256(phone),
      client_user_agent: userAgent,
    },
    custom_data: {},
  };

  if (value) capiEvent.custom_data.value = parseFloat(value);
  if (currency) capiEvent.custom_data.currency = currency;
  if (contentIds) capiEvent.custom_data.content_ids = contentIds;
  if (contentName) capiEvent.custom_data.content_name = contentName;

  Object.keys(capiEvent.user_data).forEach(k => {
    if (capiEvent.user_data[k] === undefined) delete capiEvent.user_data[k];
  });

  try {
    const response = await fetch(CAPI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [capiEvent], access_token: ACCESS_TOKEN }),
    });
    const result = await response.json();
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, events_received: result.events_received }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
