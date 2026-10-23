// ==============================================================================
// CampusResQ / Safety Exit — Mappedin Token Authentication Server
// ==============================================================================
// Securely exchanges server-side Mappedin credentials (MAPPEDIN_KEY, MAPPEDIN_SECRET)
// for short-lived client access tokens. Private credentials NEVER leak to the browser.
// ==============================================================================

import http from "node:http";
import https from "node:https";

const PORT = parseInt(process.env.PORT || "3000", 10);
const MAPPEDIN_KEY = process.env.MAPPEDIN_KEY || "mik_LunzGF0BwzLu5wKnO569c07af";
const MAPPEDIN_SECRET = process.env.MAPPEDIN_SECRET || "mis_Tu9IawAmFN1TK6h4HekLxdhpwCflxEx8WGTNfHa80FQ8b8a100f";
const MAPPEDIN_MAP_ID = process.env.MAPPEDIN_MAP_ID || "6878b313316caa000b260be4";
const MAPPEDIN_ENV = process.env.MAPPEDIN_ENV || "us";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// In-memory token cache to prevent unnecessary upstream authentication calls
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Request an access token from Mappedin's official API token endpoint
 */
async function fetchMappedinToken() {
  const now = Date.now();
  // Return cached token if valid for at least 5 more minutes
  if (cachedToken && tokenExpiresAt - now > 5 * 60 * 1000) {
    return cachedToken;
  }

  const res = await fetch("https://app.mappedin.com/api/api-key/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: MAPPEDIN_KEY,
      secret: MAPPEDIN_SECRET,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Mappedin authentication failed (HTTP ${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const accessToken = data.access_token || data.accessToken;
  const expiresIn = data.expires_in || 7200; // Default 2 hours

  if (!accessToken) {
    throw new Error("No access_token returned by Mappedin auth endpoint");
  }

  cachedToken = accessToken;
  tokenExpiresAt = now + expiresIn * 1000;
  return cachedToken;
}

const server = http.createServer(async (req, res) => {
  // CORS Headers
  const origin = req.headers.origin || "*";
  const allowedOrigin = CORS_ORIGIN === "*" ? "*" : CORS_ORIGIN.split(",").map(o => o.trim()).includes(origin) ? origin : CORS_ORIGIN;

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // Health check endpoint
  if (url.pathname === "/healthz" || url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
    return;
  }

  // Token endpoint for frontend map initialization
  if (url.pathname === "/api/mappedin-token" || url.pathname === "/api/token") {
    try {
      const accessToken = await fetchMappedinToken();
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=300",
      });
      res.end(
        JSON.stringify({
          accessToken,
          mapId: MAPPEDIN_MAP_ID,
          environment: MAPPEDIN_ENV,
        })
      );
    } catch (err) {
      console.error("[Auth Server Error]", err.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Failed to retrieve Mappedin access token",
          message: err.message,
        })
      );
    }
    return;
  }

  // 404 for other routes
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found", path: url.pathname }));
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[CampusResQ Auth Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

export { server, fetchMappedinToken };
