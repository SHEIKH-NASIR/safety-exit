// ==============================================================================
// CampusResQ / Safety Exit — Mappedin Token Authentication Server
// ==============================================================================
// Securely exchanges server-side Mappedin credentials (MAPPEDIN_KEY, MAPPEDIN_SECRET)
// for short-lived client access tokens. Private credentials NEVER leak to the browser.
// ==============================================================================

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import nodemailer from "nodemailer";

// Helper to load .env robustly from project root or relative to script regardless of CWD
function loadEnvConfig() {
  if (typeof process.loadEnvFile !== "function") return;
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../.env"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        process.loadEnvFile(candidate);
        break;
      } catch (e) {
        // Fallback to next candidate
      }
    }
  }
}

// Initial environment load
loadEnvConfig();

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

/**
 * Returns the set of approved map IDs:
 * 1. Always includes PUBLIC_DEMO_MAP_ID for public demo/trial verification
 * 2. Includes the configured DEFAULT_MAP_ID (from MAPPEDIN_MAP_ID)
 * 3. Includes any comma-separated IDs configured via MAPPEDIN_ALLOWED_MAP_IDS
 */
function getApprovedMapIds() {
  const approved = new Set([PUBLIC_DEMO_MAP_ID]);
  if (DEFAULT_MAP_ID) {
    approved.add(DEFAULT_MAP_ID);
  }
  if (process.env.MAPPEDIN_ALLOWED_MAP_IDS) {
    for (const id of process.env.MAPPEDIN_ALLOWED_MAP_IDS.split(",")) {
      const clean = id.trim();
      if (clean) approved.add(clean);
    }
  }
  return approved;
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

// Rate Limiting: 60 requests per minute per IP
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;
const rateLimitMap = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded && typeof forwarded === "string") {
    const firstIp = forwarded.split(",")[0].trim();
    if (firstIp) return firstIp;
  }
  return req.socket?.remoteAddress || "127.0.0.1";
}

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetInSeconds: 60 };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    const resetInSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - entry.count,
    resetInSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}

// Helper to mask email address in logs (e.g., s***r@gmail.com)
function maskEmail(email) {
  if (!email || typeof email !== "string") return "unknown";
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const user = parts[0];
  const domain = parts[1];
  const maskedUser = user.length <= 2 ? user[0] + "*" : user[0] + "*".repeat(user.length - 2) + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}

// In-memory deduplication cache for sent incident emails: Map<incidentId, number (timestamp)>
const sentIncidentEmails = new Map();
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// Rate limit map for email dispatch: max 10 emails per minute per IP
const emailRateLimitMap = new Map();
const EMAIL_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_EMAILS_PER_WINDOW = 10;

function checkEmailRateLimit(ip) {
  const now = Date.now();
  const entry = emailRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    emailRateLimitMap.set(ip, { count: 1, resetAt: now + EMAIL_RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= MAX_EMAILS_PER_WINDOW) {
    return { allowed: false };
  }
  entry.count++;
  return { allowed: true };
}

// Clean up stale rate limit entries periodically
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
  for (const [ip, entry] of emailRateLimitMap.entries()) {
    if (now > entry.resetAt) {
      emailRateLimitMap.delete(ip);
    }
  }
  for (const [incId, timestamp] of sentIncidentEmails.entries()) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      sentIncidentEmails.delete(incId);
    }
  }
}, 5 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

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
    // 1. Strict HTTP Method validation: only GET is allowed
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, OPTIONS");
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Method Not Allowed",
          message: "Only GET and OPTIONS methods are allowed on this endpoint.",
        })
      );
      return;
    }

    // 2. Strict Origin check (CORS is enforced server-side, not just in browser)
    if (origin && !isOriginAllowed(origin)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden", message: "Origin not allowed by CORS policy." }));
      return;
    }

    // 3. Rate limiting per client IP
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp);
    res.setHeader("X-RateLimit-Limit", String(MAX_REQUESTS_PER_WINDOW));
    res.setHeader("X-RateLimit-Remaining", String(rateCheck.remaining));

    if (!rateCheck.allowed) {
      res.setHeader("Retry-After", String(rateCheck.resetInSeconds));
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Too Many Requests",
          message: "Rate limit exceeded. Please wait before making additional token requests.",
        })
      );
      return;
    }

    // 4. Validate query parameters if provided, else fall back to server env defaults
    const requestedMapId = (url.searchParams.get("mapId") || DEFAULT_MAP_ID).trim();
    const requestedEnv = (url.searchParams.get("environment") || DEFAULT_ENV).trim().toLowerCase();

    // 4a. Validate environment
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

    // 4b. Validate mapId format
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

    // 4c. Validate map authorization against explicit allowlist
    const approvedMapIds = getApprovedMapIds();
    if (!approvedMapIds.has(requestedMapId)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Forbidden",
          message: "Requested map ID is not authorized by the backend allowlist.",
        })
      );
      return;
    }

    // 4d. Validate environment compatibility
    if (requestedMapId === PUBLIC_DEMO_MAP_ID && requestedEnv !== "us") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Incompatible Environment",
          message: "The public demo venue is only available in the 'us' environment.",
        })
      );
      return;
    }

    if (process.env.MAPPEDIN_ENV && requestedEnv !== process.env.MAPPEDIN_ENV.toLowerCase()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Incompatible Environment",
          message: `Requested environment "${requestedEnv}" does not match configured backend environment "${process.env.MAPPEDIN_ENV.toLowerCase()}".`,
        })
      );
      return;
    }

    // 5. Determine credentials according to security policy:
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

  // SOS Emergency Email Notification Endpoint
  if (url.pathname === "/api/sos/notify-email") {
    // 1. Strict Method validation: POST only
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method Not Allowed", message: "Only POST is allowed on this endpoint." }));
      return;
    }

    // 2. Strict Origin check
    if (origin && !isOriginAllowed(origin)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden", message: "Origin not allowed by CORS policy." }));
      return;
    }

    // 3. Email rate limiting per client IP
    const clientIp = getClientIp(req);
    const emailRate = checkEmailRateLimit(clientIp);
    if (!emailRate.allowed) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Too Many Requests",
        message: "Email dispatch rate limit exceeded. Please wait before retrying.",
      }));
      return;
    }

    // 4. Secure body parsing (max 50KB)
    let bodyRaw = "";
    req.on("data", (chunk) => {
      bodyRaw += chunk;
      if (bodyRaw.length > 50 * 1024) {
        req.destroy();
      }
    });

    req.on("end", async () => {
      let body;
      try {
        body = JSON.parse(bodyRaw);
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Bad Request", message: "Invalid JSON payload." }));
        return;
      }

      const {
        incidentId,
        sosUrl,
        victimLocation,
        victimBuilding,
        victimFloor,
        victimCoordinates,
        timeReported,
        hazardsCount,
      } = body || {};

      // 5. Input validation
      if (!incidentId || typeof incidentId !== "string" || !/^[a-zA-Z0-9_-]{4,64}$/.test(incidentId)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid Parameter", message: "Missing or invalid incidentId format." }));
        return;
      }

      if (!sosUrl || typeof sosUrl !== "string" || !sosUrl.startsWith("http")) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid Parameter", message: "Missing or invalid sosUrl format." }));
        return;
      }

      // 6. Duplicate prevention check
      const now = Date.now();
      const lastSent = sentIncidentEmails.get(incidentId);
      if (lastSent && (now - lastSent) < DEDUP_WINDOW_MS) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          status: "already_sent",
          message: "Email notification was already dispatched for this incident.",
          incidentId,
        }));
        return;
      }

      // 7. Check SMTP Configuration (re-read .env in case credentials were updated at runtime)
      loadEnvConfig();
      const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
      const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
      const smtpUser = process.env.SMTP_USER;
      const rawPass = process.env.SMTP_PASS;
      const cleanPass = rawPass ? rawPass.replace(/\s+/g, "").trim() : "";
      const rescuerEmail = process.env.RESCUER_EMAIL || smtpUser;

      const isConfigured = Boolean(
        smtpUser &&
        cleanPass &&
        cleanPass !== "YOUR_NEW_GOOGLE_APP_PASSWORD" &&
        rescuerEmail
      );

      if (!isConfigured) {
        console.log(`[SOS Notification] SMTP not configured. Incident ${incidentId} created without email dispatch.`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          status: "not_configured",
          message: "SOS created. Email is not configured; copy the SOS link manually.",
          incidentId,
        }));
        return;
      }

      // 8. Dispatch Email via Nodemailer
      try {
        console.log(`[SOS Notification] Dispatching alert email for incident ${incidentId} to ${maskEmail(rescuerEmail)} via ${smtpHost}:${smtpPort}...`);
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: false, // port 587 uses STARTTLS
          auth: {
            user: smtpUser,
            pass: cleanPass,
          },
          tls: {
            rejectUnauthorized: true,
          },
        });

        const subject = `CampusResQ Emergency SOS — [${incidentId}]`;
        const locDisplay = victimLocation || "Reported Location";
        const buildingDisplay = victimBuilding || "Campus Building";
        const floorDisplay = victimFloor || "Level 1";
        const coordsDisplay = victimCoordinates && typeof victimCoordinates.latitude === "number" && typeof victimCoordinates.longitude === "number"
          ? `${victimCoordinates.latitude.toFixed(6)}, ${victimCoordinates.longitude.toFixed(6)}`
          : "N/A";
        const timeDisplay = timeReported || new Date().toLocaleTimeString();
        const hazardsDisplay = typeof hazardsCount === "number" ? hazardsCount : 0;

        const mailOptions = {
          from: `"CampusResQ Safety Beacon" <${smtpUser}>`,
          to: rescuerEmail,
          subject,
          text: `🚨 CAMPUSRESQ EMERGENCY SOS ALERT\n\n` +
            `Incident ID: ${incidentId}\n` +
            `Status: CRITICAL RESCUE DISPATCH\n` +
            `Victim Location: ${locDisplay}\n` +
            `Building: ${buildingDisplay}\n` +
            `Floor: ${floorDisplay}\n` +
            `Coordinates: ${coordsDisplay}\n` +
            `Time: ${timeDisplay}\n` +
            `Active Red-Zone Hazards: ${hazardsDisplay}\n\n` +
            `Open CampusResQ Rescuer Map:\n${sosUrl}\n\n` +
            `Instructions for Responders:\n` +
            `1. Open the rescue link above to launch the live navigation map.\n` +
            `2. The victim's destination is locked to their reported location.\n` +
            `3. Select an available building exterior entrance point to plot the safest route avoiding active red-zone hazards.\n` +
            `4. Follow turn-by-turn guidance and Blue Dot navigation to reach the victim safely.`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
              <div style="background: #dc2626; color: #ffffff; padding: 18px 24px;">
                <div style="font-size: 12px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;">CampusResQ Safety Operations</div>
                <h1 style="margin: 6px 0 0; font-size: 22px; font-weight: 800; color: #ffffff;">🚨 Emergency SOS Distress Alert</h1>
              </div>
              <div style="padding: 24px;">
                <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 4px; margin-bottom: 20px;">
                  <div style="font-size: 13px; font-weight: 700; color: #991b1b;">IMMEDIATE RESCUE DISPATCH REQUIRED</div>
                  <div style="font-size: 12px; color: #7f1d1d; margin-top: 2px;">A campus user has triggered an active SOS beacon. Open the rescuer map below to begin navigation.</div>
                </div>

                <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 8px 0; color: #64748b; font-weight: 600; width: 38%;">Incident ID:</td>
                    <td style="padding: 8px 0; font-weight: 700; color: #0f172a;"><span style="background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 4px; font-family: monospace;">${incidentId}</span></td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Reported Location:</td>
                    <td style="padding: 8px 0; font-weight: 700; color: #1e293b;">${locDisplay}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Building & Floor:</td>
                    <td style="padding: 8px 0; color: #334155;">${buildingDisplay} · ${floorDisplay}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Coordinates:</td>
                    <td style="padding: 8px 0; color: #334155; font-family: monospace; font-size: 12px;">${coordsDisplay}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Time Reported:</td>
                    <td style="padding: 8px 0; color: #334155;">${timeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Active Hazards:</td>
                    <td style="padding: 8px 0; color: ${hazardsDisplay > 0 ? '#dc2626' : '#16a34a'}; font-weight: 700;">${hazardsDisplay} hazard restriction(s) synchronized</td>
                  </tr>
                </table>

                <div style="text-align: center; margin: 28px 0;">
                  <a href="${sosUrl}" style="background-color: #dc2626; color: #ffffff; padding: 14px 28px; border-radius: 8px; font-size: 16px; font-weight: 800; text-decoration: none; display: inline-block; box-shadow: 0 4px 14px rgba(220,38,38,0.35);">
                    Open CampusResQ Rescuer Map
                  </a>
                </div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px;">
                  <div style="font-size: 12px; font-weight: 800; color: #334155; text-transform: uppercase; margin-bottom: 6px;">📋 Instructions for Responders</div>
                  <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.5;">
                    <li>Click <b>Open CampusResQ Rescuer Map</b> above to launch the live navigation map.</li>
                    <li>The victim's destination is locked to their reported location.</li>
                    <li>Select an available building exterior entrance point to plot the safest route avoiding active red-zone hazards.</li>
                    <li>Follow turn-by-turn guidance and Blue Dot navigation to reach the victim safely.</li>
                  </ol>
                </div>

                <p style="font-size: 11px; color: #94a3b8; line-height: 1.4; margin-top: 16px;">
                  If the button above does not open directly, copy and paste this link into your browser:<br/>
                  <a href="${sosUrl}" style="color: #2563eb; word-break: break-all;">${sosUrl}</a>
                </p>
              </div>
              <div style="background: #f1f5f9; padding: 12px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
                CampusResQ Emergency & Safe Route System · Automated Dispatch Alert
              </div>
            </div>
          `,
        };

        const info = await transporter.sendMail(mailOptions);
        sentIncidentEmails.set(incidentId, Date.now());
        console.log(`[SOS Notification] ✅ Email alert for incident ${incidentId} accepted by mail server (Message ID: ${info.messageId}) for ${maskEmail(rescuerEmail)}.`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          status: "sent",
          message: "Email sent successfully to rescuer.",
          incidentId,
          recipient: maskEmail(rescuerEmail),
        }));
      } catch (err) {
        console.error(`[SOS Notification Error] ❌ Failed to send email for incident ${incidentId}:`, err.message);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          status: "failed",
          message: "SOS created, but email delivery failed. Please copy the SOS link manually.",
          incidentId,
        }));
      }
    });
    return;
  }

  // 404 for other routes
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found", path: url.pathname }));
});

const isMainModule = process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href;
if (isMainModule && process.env.NODE_ENV !== "test") {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[CampusResQ Auth Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

export {
  server,
  fetchMappedinToken,
  getApprovedMapIds,
  checkRateLimit,
  checkEmailRateLimit,
  sentIncidentEmails,
  maskEmail,
  PUBLIC_DEMO_MAP_ID,
  PUBLIC_DEMO_KEY,
  PUBLIC_DEMO_SECRET,
};
