// ==============================================================================
// CampusResQ / Safety Exit — Mappedin Token Authentication Server
// ==============================================================================
// Securely exchanges server-side Mappedin credentials (MAPPEDIN_KEY, MAPPEDIN_SECRET)
// for short-lived client access tokens. Private credentials NEVER leak to the browser.
// ==============================================================================

import http from "node:http";

const PORT = parseInt(process.env.PORT || "3000", 10);
const DEFAULT_MAP_ID = process.env.MAPPEDIN_MAP_ID || "6878b313316caa000b260be4";
const DEFAULT_ENV = (process.env.MAPPEDIN_ENV || "us").toLowerCase();
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// Official public trial demo venue credentials (documented at https://developer.mappedin.com/docs/demo-keys-and-maps)
const PUBLIC_DEMO_MAP_ID = "6878b313316caa000b260be4";
const PUBLIC_DEMO_KEY = "mik_LunzGF0BwzLu5wKnO569c07af";
const PUBLIC_DEMO_SECRET = "mis_Tu9IawAmFN1TK6h4HekLxdhpwCflxEx8WGTNfHa80FQ8b8a100f";

// Allowed environments supported by Mappedin JS v6
const ALLOWED_ENVIRONMENTS = new Set(["us", "eu", "ind"]);

// Map ID format validation: alphanumeric, hyphens, underscores (between 6 and 64 characters)
const MAP_ID_REGEX = /^[a-zA-Z0-9_-]{6,64}$/;

// Allowed origins list for CORS
const allowedOriginsList = CORS_ORIGIN === "*"
  ? ["*"]
  : CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);

function isOriginAllowed(origin) {
  if (allowedOriginsList.includes("*")) return true;
  if (!origin) return true; // Server-to-server or same-origin
  return allowedOriginsList.includes(origin);
}

// In-memory token cache keyed by credentials to prevent duplicate upstream authentication calls
// Map<string, { accessToken: string, expiresAt: number }>
const tokenCache = new Map();

/**
 * Request an access token from Mappedin's official API token endpoint
 */
async function fetchMappedinToken(key, secret) {
  const cacheKey = `${key}:${secret}`;
  const now = Date.now();
  const cached = tokenCache.get(cacheKey);

  // Return cached token if valid for at least 5 more minutes
  if (cached && cached.expiresAt - now > 5 * 60 * 1000) {
    return cached.accessToken;
  }

  const res = await fetch("https://app.mappedin.com/api/api-key/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, secret }),
  });

  if (!res.ok) {
    // Sanitize upstream error: do not expose headers, payload or secret values in error message
    throw new Error(`Upstream authentication failed with HTTP status ${res.status}`);
  }

  const data = await res.json();
  const accessToken = data.access_token || data.accessToken;
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 7200; // Default 2 hours

  if (!accessToken || typeof accessToken !== "string") {
    throw new Error("Invalid response from Mappedin auth service: missing access token");
  }

  tokenCache.set(cacheKey, {
    accessToken,
    expiresAt: now + expiresIn * 1000,
  });

  return accessToken;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;

  // Security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  // CORS headers
  if (origin) {
    res.setHeader("Vary", "Origin");
    if (isOriginAllowed(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
  } else if (allowedOriginsList.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  // Preflight OPTIONS handling
  if (req.method === "OPTIONS") {
    if (origin && !isOriginAllowed(origin)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden", message: "Origin not allowed by CORS policy." }));
      return;
    }
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
    if (origin && !isOriginAllowed(origin)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden", message: "Origin not allowed by CORS policy." }));
      return;
    }

    // Validate query parameters if provided, else fall back to server env defaults
    const requestedMapId = (url.searchParams.get("mapId") || DEFAULT_MAP_ID).trim();
    const requestedEnv = (url.searchParams.get("environment") || DEFAULT_ENV).trim().toLowerCase();

    // 1. Validate environment
    if (!ALLOWED_ENVIRONMENTS.has(requestedEnv)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Invalid Parameter",
          message: `Environment "${requestedEnv}" is invalid. Allowed environments: ${Array.from(ALLOWED_ENVIRONMENTS).join(", ")}`,
        })
      );
      return;
    }

    // 2. Validate mapId format
    if (!MAP_ID_REGEX.test(requestedMapId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Invalid Parameter",
          message: "Invalid mapId format. Must be an alphanumeric string between 6 and 64 characters.",
        })
      );
      return;
    }

    // 3. Determine credentials according to security policy:
    // - Private maps require configured MAPPEDIN_KEY and MAPPEDIN_SECRET in environment.
    // - Public demo credentials are ONLY used if the requested map is the documented public demo map.
    let keyToUse = process.env.MAPPEDIN_KEY;
    let secretToUse = process.env.MAPPEDIN_SECRET;

    const isPublicDemoMap = requestedMapId === PUBLIC_DEMO_MAP_ID;

    if (!keyToUse || !secretToUse) {
      if (isPublicDemoMap) {
        // Safe fallback for official public trial demo venue
        keyToUse = PUBLIC_DEMO_KEY;
        secretToUse = PUBLIC_DEMO_SECRET;
      } else {
        // Reject private maps without configured credentials: DO NOT SILENTLY USE DEMO CREDENTIALS!
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Configuration Error",
            message: `Missing backend credentials: MAPPEDIN_KEY and MAPPEDIN_SECRET must be configured in environment variables for private venue "${requestedMapId}".`,
          })
        );
        return;
      }
    }

    try {
      const accessToken = await fetchMappedinToken(keyToUse, secretToUse);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      });
      res.end(
        JSON.stringify({
          accessToken,
          mapId: requestedMapId,
          environment: requestedEnv,
        })
      );
    } catch (err) {
      console.error("[Auth Server Error] Upstream token retrieval failed:", err.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Authentication Error",
          message: "Failed to retrieve access token from Mappedin upstream service.",
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

export { server, fetchMappedinToken, PUBLIC_DEMO_MAP_ID, PUBLIC_DEMO_KEY, PUBLIC_DEMO_SECRET };
