import {
  getMapData,
  MapData,
  MapView,
  Marker,
  show3dMap,
  Space,
  TGetMapDataOptions,
  TBlueDotPositionUpdate,
} from "@mappedin/mappedin-js";

import { DynamicFocus } from "@mappedin/dynamic-focus";
import { truck, tree_pine } from "@mappedin/3d-assets";

import "./mappedin.css";
const modelMap: Record<string, string> = {
  truck,
  tree_pine,
  // add more models here as needed
};
import globalModelsData from "../global-models.json";

import { generatePositionUpdates } from "./generator";
import { populateSpaceSelector } from "./spaceSelector";
import { populateFloorSelector } from "./floorSelector";
import { setSelectedFloor } from "./floorSelector";
import { saveTemplateAsFile } from "./fileDownloader";
import { DynamicPositionUpdater, getCurrentPosition } from "./positionUpdater";
import { emergencyPanel } from "./emergency/emergencyPanel";
import { exitRegistry } from "./emergency/exitRegistry";
import { doesRouteIntersectPolygon, isPointInPolygon } from "./emergency/safeRouteService";
import { hazardStore, CONFIGURED_BUILDINGS } from "./emergency/hazardStore";
import { BuildingEntranceExit } from "./emergency/types";
let currentStartBuildingId: string = "fs_6878b1ed316caa000b260be2";
let currentStartFloorId: string = "m_c5bac871ab66226c";
let currentDestBuildingId: string = "fs_6878b1ed316caa000b260be2";
let currentDestFloorId: string = "m_c5bac871ab66226c";
let currentNavBuildingId: string = "fs_6878b1ed316caa000b260be2"; // Default: Office Building 1
import { incidentService } from "./emergency/incidentService";
(window as any).hazardStore = hazardStore;
(window as any).exitRegistry = exitRegistry;
(window as any).emergencyPanel = emergencyPanel;
(window as any).emergencyPanelInstance = emergencyPanel;
(window as any).incidentService = incidentService;

// Rescuer session state tracker
export interface RescuerSessionState {
  isActive: boolean;
  victimSpaceId: string;
  victimName: string;
  victimBuildingId: string;
  victimBuildingName: string;
  victimFloorId: string;
  victimFloorName: string;
  victimCoordinates?: { latitude: number; longitude: number };
  incidentId: string;
  selectedEntranceDoorId: string | null;
}

export let rescuerSession: RescuerSessionState = {
  isActive: false,
  victimSpaceId: "",
  victimName: "",
  victimBuildingId: "",
  victimBuildingName: "",
  victimFloorId: "",
  victimFloorName: "",
  incidentId: "",
  selectedEntranceDoorId: null,
};

(window as any).rescuerSession = rescuerSession;
const professors: Record<string, string> = {
  "Dr. Smith": "Office 101",
  "Prof. John": "Office 202",
  "Dr. Lee": "Office 303",
};

const floorMap: Record<string, number> = {
  m_f7ad6268bf946916: 0, // Ground floor
  m_0cabb66d2b13d0d3: 1, // First floor
};

// Official public Mappedin trial demo venue and keys for open-source reference
// (See https://developer.mappedin.com/docs/demo-keys-and-maps)
const PUBLIC_DEMO_MAP_ID = "6878b313316caa000b260be4";
const PUBLIC_DEMO_KEY = "mik_LunzGF0BwzLu5wKnO569c07af";
const PUBLIC_DEMO_SECRET = "mis_Tu9IawAmFN1TK6h4HekLxdhpwCflxEx8WGTNfHa80FQ8b8a100f";
const DEFAULT_MAP_ID = (process.env.MAPPEDIN_MAP_ID as string) || PUBLIC_DEMO_MAP_ID;
const DEFAULT_ENV = (process.env.MAPPEDIN_ENV as "us" | "eu") || "us";

let mapData: MapData;
let mapView: MapView;

let blueDotEnabled = false;

let positions: TBlueDotPositionUpdate[] | undefined;

let followingBlueDot = true;

// ✅ CHANGED: default is now 'walk' so a fresh page load / fresh generate
// is already in chase-cam mode without requiring a manual toggle click.
let cameraMode: "map" | "walk" = "walk";

let lastAppliedPosition: { latitude: number; longitude: number } | null = null;

let lastComputedBearing = 0;

let animatedBearing = 0;

function getShortestBearing(from: number, to: number): number {
  const delta = ((to - from + 540) % 360) - 180; // normalize delta to -180..180
  return from + delta;
}

const WALK_CAMERA_PITCH_DEGREES = 65;

const MIN_BEARING_MOVE_METERS = 0.5;

let activeInstructions: {
  coord: { lat: number; lon: number };
  instruction: string;
  id: string;
  posIndex: number;
}[] = [];

let destinationCoord: {
  latitude: number;
  longitude: number;
  floorId?: string;
} | null = null;

let spokenSteps = new Set<string>();
let voicePrimed = false;

// ✅ NEW: mute toggle for voice nav. When true, speakInstruction() below
// skips speechSynthesis entirely — but still fires the haptic buzz, since
// someone who muted voice (e.g. in a lecture) likely still wants the
// physical turn cue.
let voiceMuted = false;

let lastDistanceToFrontInstruction: number | null = null;

type BuildingCrossingTarget = {
  index: number;
  buildingName: string;
  coordinate: { latitude: number; longitude: number; floorId?: string };
};
let buildingCrossings: BuildingCrossingTarget[] = [];
let nextCrossingPointer = 0;
const crossingToastShownFor = new Set<number>();

const fakePositionUpdater = new DynamicPositionUpdater();

function showAuthErrorToast(msg: string) {
  let errEl = document.getElementById("auth-error-banner");
  if (!errEl) {
    errEl = document.createElement("div");
    errEl.id = "auth-error-banner";
    errEl.style.position = "fixed";
    errEl.style.top = "20px";
    errEl.style.left = "50%";
    errEl.style.transform = "translateX(-50%)";
    errEl.style.background = "#d93025";
    errEl.style.color = "#ffffff";
    errEl.style.padding = "14px 22px";
    errEl.style.borderRadius = "8px";
    errEl.style.boxShadow = "0 6px 18px rgba(0,0,0,0.35)";
    errEl.style.zIndex = "999999";
    errEl.style.fontWeight = "600";
    errEl.style.maxWidth = "90vw";
    errEl.style.textAlign = "center";
    document.body.appendChild(errEl);
  }
  errEl.textContent = msg;
  errEl.style.display = "block";
}

function hideAuthErrorToast() {
  const errEl = document.getElementById("auth-error-banner");
  if (errEl) errEl.style.display = "none";
}

/**
 * Get UI elements
 */

const mapIdInput = document.getElementById("mapId") as HTMLInputElement | null;
const environmentSelect = document.getElementById(
  "environment"
) as HTMLSelectElement | null;

const loadMapButton = document.getElementById("loadMap")! as HTMLButtonElement;

const startSpaceSelector = document.getElementById(
  "startSpace"
)! as HTMLSelectElement;

const endSpaceSelector = document.getElementById(
  "endSpace"
)! as HTMLSelectElement;

const rescuerEntryGroup = document.getElementById(
  "rescuerEntryGroup"
) as HTMLDivElement | null;
const rescuerEntrySelector = document.getElementById(
  "rescuerEntrySelector"
) as HTMLSelectElement | null;
const rescuerEntryStatus = document.getElementById(
  "rescuerEntryStatus"
) as HTMLDivElement | null;

const showPathCheckbox = document.getElementById(
  "showPath"
)! as HTMLInputElement;

const generateButton = document.getElementById(
  "generate"
)! as HTMLButtonElement;
const downloadButton = document.getElementById(
  "download"
)! as HTMLButtonElement;
const resetButton = document.getElementById("reset")! as HTMLButtonElement;

const startLocationColor = document.getElementById(
  "startLocationColor"
) as HTMLInputElement;

const destinationLocationColor = document.getElementById(
  "destinationLocationColor"
) as HTMLInputElement;

/**
 * Resolves map data options with token-first authentication:
 * 1. Checks if a backend auth endpoint (MAPPEDIN_AUTH_URL or /api/mappedin-token) is reachable.
 * 2. Retrieves a short-lived ephemeral Mappedin accessToken from the backend service.
 * 3. Falls back to public demo credentials ONLY if the selected map is the public demo venue
 *    (https://developer.mappedin.com/docs/demo-keys-and-maps).
 * 4. Never reads or exposes private keys or secrets on the frontend.
 */
async function resolveMapDataOptions(): Promise<TGetMapDataOptions> {
  const mapId = (mapIdInput && mapIdInput.value.trim() !== "") ? mapIdInput.value.trim() : DEFAULT_MAP_ID;
  const environment = (environmentSelect && environmentSelect.value !== "") ? (environmentSelect.value as "us" | "eu") : DEFAULT_ENV;

  if (mapIdInput && !mapIdInput.value) mapIdInput.value = mapId;
  if (environmentSelect && !environmentSelect.value) environmentSelect.value = environment;

  // 1. Attempt token-based authentication via auth service
  const configuredAuthUrl =
    (process.env.MAPPEDIN_AUTH_URL as string) ||
    (window as any).MAPPEDIN_AUTH_URL;

  const candidateUrls: string[] = [];
  if (configuredAuthUrl) candidateUrls.push(configuredAuthUrl);
  candidateUrls.push("/api/mappedin-token");
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    candidateUrls.push("http://localhost:3000/api/mappedin-token");
  }

  const queryParams = `mapId=${encodeURIComponent(mapId)}&environment=${encodeURIComponent(environment)}`;

  for (const baseUrl of candidateUrls) {
    try {
      const url = baseUrl.includes("?")
        ? `${baseUrl}&${queryParams}`
        : `${baseUrl}?${queryParams}`;
      const res = await fetch(url, { method: "GET" });
      if (res.ok) {
        const authData = await res.json();
        const token = authData.accessToken || authData.access_token;
        if (token) {
          console.log("🔒 Map authenticated via secure Mappedin token service:", baseUrl);
          hideAuthErrorToast();
          return {
            mapId: (mapIdInput && mapIdInput.value.trim() !== "") ? mapIdInput.value.trim() : (authData.mapId || mapId),
            accessToken: token,
            environment: (environmentSelect && environmentSelect.value !== "") ? (environmentSelect.value as "us" | "eu") : ((authData.environment as "us" | "eu") || environment),
          } as TGetMapDataOptions;
        }
      } else {
        try {
          const errData = await res.json();
          if (errData && errData.message) {
            console.warn(`[Auth Service Warning] ${baseUrl}:`, errData.message);
          }
        } catch {
          // Response body was not JSON
        }
      }
    } catch {
      // Continue to next candidate URL
    }
  }

  // 2. Safe Fallback: only permitted for the official public trial demo venue
  if (mapId === PUBLIC_DEMO_MAP_ID) {
    console.log("ℹ️ Using public demo credentials for demo venue:", PUBLIC_DEMO_MAP_ID);
    hideAuthErrorToast();
    return {
      mapId: PUBLIC_DEMO_MAP_ID,
      key: PUBLIC_DEMO_KEY,
      secret: PUBLIC_DEMO_SECRET,
      environment,
    };
  }

  // 3. For custom venues without an available backend auth service, notify the user clearly
  const errorMsg = `Authentication required: Could not retrieve access token from backend auth service for venue "${mapId}". Ensure safety-exit-api is deployed and running.`;
  showAuthErrorToast(errorMsg);
  throw new Error(errorMsg);
}

let startTomSelect: any = null;
let endTomSelect: any = null;

let previousColouredStart: Space | undefined;
function onStartSpaceChange(event: any) {
  if (previousColouredStart) {
    if (hazardStore.isLocationBlocked(previousColouredStart.id, currentNavBuildingId)) {
      mapView.updateState(previousColouredStart, { color: "#d93025" });
    } else {
      mapView.updateState(previousColouredStart, {
        color: "initial",
      });
    }
  }

  const spaceToColor = mapData
    .getByType("space")
    .find((s) => s.id === event.target.value);
  if (spaceToColor) {
    const isBlocked = hazardStore.isLocationBlocked(spaceToColor.id, currentNavBuildingId);
    mapView.updateState(spaceToColor, {
      color: isBlocked ? "#d93025" : startLocationColor.value,
    });
    previousColouredStart = spaceToColor;
  }
}
startSpaceSelector.onchange = onStartSpaceChange;

let previousColouredEnd: Space | undefined;
function onEndSpaceChange(event: any) {
  if (previousColouredEnd) {
    if (hazardStore.isLocationBlocked(previousColouredEnd.id, currentNavBuildingId)) {
      mapView.updateState(previousColouredEnd, { color: "#d93025" });
    } else {
      mapView.updateState(previousColouredEnd, {
        color: "initial",
      });
    }
  }

  const spaceToColor = mapData
    .getByType("space")
    .find((s) => s.id === event.target.value);
  if (spaceToColor) {
    const isBlocked = hazardStore.isLocationBlocked(spaceToColor.id, currentNavBuildingId);
    mapView.updateState(spaceToColor, {
      color: isBlocked ? "#d93025" : destinationLocationColor.value,
    });
    previousColouredEnd = spaceToColor;
  }
}
endSpaceSelector.onchange = onEndSpaceChange;

downloadButton.onclick = () => {
  if (positions) {
    saveTemplateAsFile("positions.json", positions);
  } else {
    alert("Generate a route first");
  }
};

// Dashboard collapsible controls (Issue 2)
function toggleStartDashboard(expand?: boolean) {
  const content = document.getElementById("startDashboardContent");
  const icon = document.getElementById("startDashboardToggleIcon");
  const btn = document.getElementById("btnToggleStartDashboard");
  if (!content) return;
  const isCurrentlyHidden = content.style.display === "none";
  const shouldExpand = expand !== undefined ? expand : isCurrentlyHidden;
  content.style.display = shouldExpand ? "block" : "none";
  if (icon) icon.textContent = shouldExpand ? "▼" : "▶";
  if (btn) btn.setAttribute("aria-expanded", shouldExpand ? "true" : "false");
}

function toggleDestDashboard(expand?: boolean) {
  const content = document.getElementById("destDashboardContent");
  const icon = document.getElementById("destDashboardToggleIcon");
  const btn = document.getElementById("btnToggleDestDashboard");
  if (!content) return;
  const isCurrentlyHidden = content.style.display === "none";
  const shouldExpand = expand !== undefined ? expand : isCurrentlyHidden;
  content.style.display = shouldExpand ? "block" : "none";
  if (icon) icon.textContent = shouldExpand ? "▼" : "▶";
  if (btn) btn.setAttribute("aria-expanded", shouldExpand ? "true" : "false");
}

function collapseDashboardsAfterRouteSuccess() {
  toggleStartDashboard(false);
  toggleDestDashboard(false);
  if (emergencyPanel && typeof (emergencyPanel as any).collapse === "function") {
    (emergencyPanel as any).collapse();
  }
  const sidebarEl = document.getElementById("sidebar");
  if (sidebarEl) {
    if (rescuerSession.isActive) {
      // In rescuer SOS mode, keep sidebar accessible (never collapse away) so step-by-step directions remain visible
      sidebarEl.classList.remove("collapsed");
    } else if (window.innerWidth < 900) {
      sidebarEl.classList.add("collapsed");
    }
  }
}

function expandAllDashboards() {
  toggleStartDashboard(true);
  toggleDestDashboard(true);
  if (emergencyPanel && typeof emergencyPanel.isEmergencyModeActive === "function" && emergencyPanel.isEmergencyModeActive()) {
    emergencyPanel.expand();
  }
  const sidebarEl = document.getElementById("sidebar");
  if (sidebarEl) {
    sidebarEl.classList.remove("collapsed");
  }
}

(window as any).toggleStartDashboard = toggleStartDashboard;
(window as any).toggleDestDashboard = toggleDestDashboard;
(window as any).collapseDashboardsAfterRouteSuccess = collapseDashboardsAfterRouteSuccess;
(window as any).expandAllDashboards = expandAllDashboards;

resetButton.onclick = () => {
  if (!mapView) {
    console.error("MapView not loaded!");
    return;
  }

  mapView.Navigation.clear();

  activeInstructions = [];

  spokenSteps.clear();

  lastDistanceToFrontInstruction = null;

  lastAppliedPosition = null;
  lastComputedBearing = 0;
  animatedBearing = 0;

  buildingCrossings = [];
  nextCrossingPointer = 0;
  crossingToastShownFor.clear();

  hideInstructionBanner();
  hideRouteSummary();

  const directionsListEl = document.getElementById("directionsList");
  if (directionsListEl) {
    directionsListEl.innerHTML = "";
    const detailsEl = directionsListEl.closest("details");
    if (detailsEl) detailsEl.open = false;
  }

  // Clear start and destination selections
  if (startTomSelect && typeof startTomSelect.clear === "function") {
    try {
      startTomSelect.clear();
    } catch (e) {
      console.warn("Failed to clear startTomSelect:", e);
    }
  }
  if (endTomSelect && typeof endTomSelect.clear === "function" && !rescuerSession.isActive) {
    try {
      endTomSelect.clear();
    } catch (e) {
      console.warn("Failed to clear endTomSelect:", e);
    }
  }
  if (startSpaceSelector) {
    startSpaceSelector.value = "";
  }
  if (endSpaceSelector && !rescuerSession.isActive) {
    endSpaceSelector.value = "";
  }

  // If in an active SOS rescuer session, keep victim destination strictly locked and preserve red zones
  if (rescuerSession.isActive) {
    if (rescuerSession.victimSpaceId) {
      endSpaceSelector.value = rescuerSession.victimSpaceId;
      if (endTomSelect && typeof endTomSelect.setValue === "function") {
        endTomSelect.setValue(rescuerSession.victimSpaceId);
      }
    }
    const rescuerSel = document.getElementById("rescuerEntrySelector") as HTMLSelectElement | null;
    if (rescuerSel) rescuerSel.value = "";
    const rescuerStatusEl = document.getElementById("rescuerEntryStatus");
    if (rescuerStatusEl) rescuerStatusEl.style.display = "none";

    if (rescuerSession.victimCoordinates && mapView?.Markers) {
      try {
        mapView.Markers.add(
          rescuerSession.victimCoordinates,
          `<div style="font-size: 13px; font-weight: 800; background: #dc2626; color: #fff; padding: 4px 8px; border-radius: 6px; box-shadow: 0 2px 8px rgba(220,38,38,0.5); border: 2px solid #fff;">🚨 SOS VICTIM: ${rescuerSession.victimName}</div>`
        );
      } catch {}
    }

    if (emergencyPanel) {
      emergencyPanel.renderMapMarkers();
    }
  }

  // Restore colored spaces if any
  if (previousColouredStart && mapView) {
    if (hazardStore.isLocationBlocked(previousColouredStart.id, currentNavBuildingId)) {
      mapView.updateState(previousColouredStart, { color: "#d93025" });
    } else {
      mapView.updateState(previousColouredStart, { color: "initial" });
    }
    previousColouredStart = undefined;
  }

  if (previousColouredEnd && mapView) {
    if (hazardStore.isLocationBlocked(previousColouredEnd.id, currentNavBuildingId)) {
      mapView.updateState(previousColouredEnd, { color: "#d93025" });
    } else {
      mapView.updateState(previousColouredEnd, { color: "initial" });
    }
    previousColouredEnd = undefined;
  }

  mapView.Markers.removeAll();

  positions = undefined;
  fakePositionUpdater.reset();
  mapView.BlueDot?.disable?.();
  blueDotEnabled = false;

  followingBlueDot = true;

  // Restore verified entrance and exit markers and expand sidebars
  const sidebarEl = document.getElementById("sidebar");
  if (sidebarEl) {
    sidebarEl.classList.remove("collapsed");
  }
  if (emergencyPanel) {
    emergencyPanel.renderMapMarkers();
    emergencyPanel.expand();
  }
  expandAllDashboards();

  console.log("✅ Map reset complete (all markers cleared)");
};

/**
 * Helper functions
 */

const getNumericInputFromElementById = (
  id: string,
  fallback: number
): number => {
  return parseFloat(
    (document.getElementById(id) as HTMLInputElement)?.value ||
      fallback.toString()
  );
};

/**
 * Initialize the map content
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // distance in meters
}

function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

function findPositionIndexForCoordinate(
  positionsRef: TBlueDotPositionUpdate[],
  coord: { latitude: number; longitude: number; floorId?: string },
  searchFrom = 0
): number {
  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = searchFrom; i < positionsRef.length; i++) {
    const p = positionsRef[i];
    if (p.latitude == null || p.longitude == null) continue;
    if (
      coord.floorId &&
      p.floorOrFloorId &&
      p.floorOrFloorId !== coord.floorId
    ) {
      continue;
    }
    const d = haversineDistance(
      p.latitude,
      p.longitude,
      coord.latitude,
      coord.longitude
    );
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  if (bestIdx === -1) {
    for (let i = searchFrom; i < positionsRef.length; i++) {
      const p = positionsRef[i];
      if (p.latitude == null || p.longitude == null) continue;
      const d = haversineDistance(
        p.latitude,
        p.longitude,
        coord.latitude,
        coord.longitude
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
  }

  return bestIdx;
}

function simplifyInstructions(instructions: any[]): any[] {
  const simplified: any[] = [];
  let carryDistance = 0;

  for (const instr of instructions) {
    const type = instr.action?.type;
    const bearing = instr.action?.bearing;

    const isMinorBend =
      type === "Turn" &&
      (bearing === "SlightLeft" ||
        bearing === "SlightRight" ||
        bearing === "Straight");

    if (isMinorBend) {
      carryDistance += instr.distance;
      continue;
    }

    simplified.push({
      ...instr,
      distance: instr.distance + carryDistance,
    });
    carryDistance = 0;
  }

  return simplified;
}

function findNearestLandmark(
  fromCoord: { latitude: number; longitude: number; floorId?: string },
  toCoord: { latitude: number; longitude: number; floorId?: string },
  mapDataRef: MapData,
  maxDistance = 40
): string | null {
  const getFloorId = (s: any): string | undefined =>
    typeof s.floor === "string" ? s.floor : s.floor?.id;

  const spaces = mapDataRef
    .getByType("space")
    .filter((s) => s.name && getFloorId(s) === toCoord.floorId && s.center);

  if (spaces.length === 0) return null;

  const fractions = [0.4, 0.65, 0.85, 1.0];

  let nearestName: string | null = null;
  let nearestDist = Infinity;

  for (const f of fractions) {
    const lat =
      fromCoord.latitude + (toCoord.latitude - fromCoord.latitude) * f;
    const lon =
      fromCoord.longitude + (toCoord.longitude - fromCoord.longitude) * f;

    for (const s of spaces) {
      const d = haversineDistance(
        lat,
        lon,
        s.center!.latitude,
        s.center!.longitude
      );
      if (d <= maxDistance && d < nearestDist) {
        nearestDist = d;
        nearestName = s.name;
      }
    }
  }

  if (!nearestName) {
    for (const s of spaces) {
      const d = haversineDistance(
        toCoord.latitude,
        toCoord.longitude,
        s.center!.latitude,
        s.center!.longitude
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearestName = s.name;
      }
    }
  }

  return nearestName;
}

function extractLandmarkFromInstruction(instruction?: string): string | null {
  if (!instruction) return null;
  const match = instruction.match(/\bat\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

type BuildingInfo = { buildingId: string; buildingName: string };

function buildFloorToBuildingMap(
  mapDataRef: MapData
): Record<string, BuildingInfo> {
  const map: Record<string, BuildingInfo> = {};
  const floorStacks = mapDataRef.getByType("floor-stack");

  floorStacks.forEach((fs: any) => {
    const buildingId: string = fs.id;
    const buildingName: string = fs.name ?? "the next building";
    const floors: any[] = fs.floors ?? [];

    floors.forEach((f: any) => {
      const floorId = typeof f === "string" ? f : f?.id;
      if (floorId) {
        map[floorId] = { buildingId, buildingName };
      }
    });
  });

  if (Object.keys(map).length === 0) {
    console.warn(
      "⚠️ buildFloorToBuildingMap found no floor→building mappings. " +
        "Check the actual shape of mapData.getByType('floor-stack') in " +
        "devtools — the 'floors' property name may differ. Falling back " +
        "to treating all floor changes as same-building (old behavior)."
    );
  }

  return map;
}

function getBuildingInfo(
  floorId: string | undefined,
  floorToBuilding: Record<string, BuildingInfo>
): BuildingInfo | null {
  if (!floorId) return null;
  return floorToBuilding[floorId] ?? null;
}

function collapseOutdoorLegs(
  instructions: any[],
  floorToBuilding: Record<string, BuildingInfo>
): any[] {
  const result: any[] = [];
  let i = 0;

  while (i < instructions.length) {
    const instr = instructions[i];
    const currBuilding = getBuildingInfo(
      instr.coordinate?.floorId,
      floorToBuilding
    );
    const next = instructions[i + 1];
    const nextBuilding = next
      ? getBuildingInfo(next.coordinate?.floorId, floorToBuilding)
      : null;

    const crossingBuildings =
      next &&
      currBuilding &&
      nextBuilding &&
      currBuilding.buildingId !== nextBuilding.buildingId;
    const enteringOutdoorUnknown = next && currBuilding && !nextBuilding;

    if (crossingBuildings || enteringOutdoorUnknown) {
      let j = i + 1;
      let landingBuilding: BuildingInfo | null = null;
      while (j < instructions.length) {
        const b = getBuildingInfo(
          instructions[j].coordinate?.floorId,
          floorToBuilding
        );
        if (b && (!currBuilding || b.buildingId !== currBuilding.buildingId)) {
          landingBuilding = b;
          break;
        }
        j++;
      }

      if (j < instructions.length && landingBuilding) {
        let totalDistance = 0;
        for (let k = i + 1; k <= j; k++) {
          totalDistance += instructions[k].distance ?? 0;
        }

        result.push(instr);
        result.push({
          ...instructions[j],
          distance: totalDistance,
          isBuildingCrossing: true,
          crossingToBuildingName: landingBuilding.buildingName,
        });
        i = j + 1;
        continue;
      }
    }

    result.push(instr);
    i++;
  }

  return result;
}

function straightenOutdoorPath(
  coordinates: any[],
  floorToBuilding: Record<string, BuildingInfo>
): any[] {
  if (!coordinates || coordinates.length === 0) return coordinates;

  const result: any[] = [];
  let i = 0;

  while (i < coordinates.length) {
    const curr = coordinates[i];
    result.push(curr);

    const next = coordinates[i + 1];
    if (!next) {
      i++;
      continue;
    }

    const currBuilding = getBuildingInfo(curr.floorId, floorToBuilding);
    const nextBuilding = getBuildingInfo(next.floorId, floorToBuilding);

    const leavingBuilding =
      currBuilding &&
      (!nextBuilding || nextBuilding.buildingId !== currBuilding.buildingId);

    if (leavingBuilding) {
      let j = i + 1;
      let landingBuilding: BuildingInfo | null = null;
      while (j < coordinates.length) {
        const b = getBuildingInfo(coordinates[j].floorId, floorToBuilding);
        if (b && (!currBuilding || b.buildingId !== currBuilding.buildingId)) {
          landingBuilding = b;
          break;
        }
        j++;
      }

      if (landingBuilding && j < coordinates.length) {
        result.push(coordinates[j]);
        i = j + 1;
        continue;
      }
    }

    i++;
  }

  return result;
}

const bearingPhrase: Record<string, string> = {
  Left: "turn left",
  Right: "turn right",
};

const SHORT_LEG_THRESHOLD_METERS = 12;

type Announcement = { id: string; coordinate: any; text: string };

function buildAnnouncements(
  instructions: any[],
  mapDataRef: MapData,
  destinationName?: string
): Announcement[] {
  const announcements: Announcement[] = [];
  let idCounter = 0;
  const nextId = () => `ann-${idCounter++}`;

  for (let i = 0; i < instructions.length; i++) {
    const instr = instructions[i];
    const next = instructions[i + 1];

    if (instr.isBuildingCrossing) {
      announcements.push({
        id: nextId(),
        coordinate: instr.coordinate,
        text: `Now enter ${instr.crossingToBuildingName} and walk straight`,
      });
    }

    if (instr.action?.type === "Turn") {
      const turnPhrase =
        bearingPhrase[instr.action?.bearing as string] || "continue";
      announcements.push({
        id: nextId(),
        coordinate: instr.coordinate,
        text: turnPhrase.charAt(0).toUpperCase() + turnPhrase.slice(1),
      });
    } else if (instr.action?.type === "Arrival") {
      announcements.push({
        id: nextId(),
        coordinate: instr.coordinate,
        text: destinationName
          ? `You have arrived at ${destinationName}`
          : "You have arrived at your destination",
      });
    } else if (instr.action?.type === "TakeVortex" || instr.action?.type === "TakeConnection") {
      const act = instr.action as any;
      const connType = act.connectionType || act.connection?.type || "stairs or elevator";
      const direction = act.direction && act.direction !== "none" ? ` ${act.direction}` : "";
      const toFloorName = act.toFloor?.name || (act.toFloor ? `Floor ${act.toFloor.id || act.toFloor}` : "");
      const toText = toFloorName ? ` to ${toFloorName}` : "";

      let text: string;
      if (connType === "door") {
        const entry =
          (rescuerSession?.isActive && rescuerSession?.selectedEntranceDoorId
            ? exitRegistry.getByDoorId(rescuerSession.selectedEntranceDoorId)
            : null) ||
          (act.connection?.id ? exitRegistry.getByDoorId(act.connection.id) : null);

        const isInitialEntry = !announcements.some((a) =>
          a.text.toLowerCase().includes("door") || a.text.toLowerCase().includes("enter")
        );

        if (isInitialEntry && entry) {
          text = `Enter via ${entry.name}${toText}`;
        } else if (isInitialEntry) {
          text = `Enter via entrance door${toText}`;
        } else {
          text = `Pass through door${toText}`;
        }
      } else {
        text = `Take the ${connType}${direction}${toText}`;
      }

      announcements.push({
        id: nextId(),
        coordinate: instr.coordinate,
        text,
      });
    }

    if (next) {
      const legDistance = next.distance ?? 0;

      if (next.isBuildingCrossing) {
        announcements.push({
          id: nextId(),
          coordinate: instr.coordinate,
          text: `Exit the building and continue until you reach ${next.crossingToBuildingName}`,
        });
      } else if (legDistance >= SHORT_LEG_THRESHOLD_METERS) {
        const nextType = next.action?.type;
        const landmark =
          extractLandmarkFromInstruction(next.instruction) ||
          findNearestLandmark(instr.coordinate, next.coordinate, mapDataRef);

        let leadText: string;

        if (nextType === "Turn") {
          leadText = landmark
            ? `Continue straight until you see ${landmark}`
            : `Continue straight for ${Math.round(legDistance)} meters`;
        } else if (nextType === "Arrival") {
          leadText = destinationName
            ? `Continue straight, ${destinationName} is just ahead`
            : landmark
            ? `Continue straight until you see ${landmark}`
            : "Continue straight, you're almost there";
        } else if (nextType === "TakeVortex" || nextType === "TakeConnection") {
          const act = next.action as any;
          const connType = act.connectionType || act.connection?.type || "stairs or elevator";
          leadText = landmark
            ? `Continue straight until you see ${landmark}, then take the ${connType}`
            : `Continue straight to the ${connType}`;
        } else {
          leadText = "Continue straight";
        }

        announcements.push({
          id: nextId(),
          coordinate: instr.coordinate,
          text: leadText,
        });
      }
    }
  }

  return announcements;
}

async function loadGlobalModels() {
  try {
    let data: any = globalModelsData;
    if (!data || !data.models) {
      const response = await fetch("/global-models.json");
      if (response.ok) {
        data = await response.json();
      }
    }

    if (data && Array.isArray(data.models)) {
      data.models.forEach((model: any) => {
        let floor = null;

        if (model.floorId) {
          floor = mapData.getById("floor", model.floorId);
        } else if (model.floorName) {
          floor = mapData
            .getByType("floor")
            .find((f) => f.name === model.floorName);
        }

        if (!floor) {
          console.warn(`Floor not found for model:`, model);
          return;
        }

        try {
          const coord = mapView.createCoordinate(
            model.latitude,
            model.longitude,
            floor
          );
          const modelUrl = modelMap[model.modelId];

          if (!modelUrl) {
            console.warn(`Unknown modelId: ${model.modelId}`);
            return;
          }

          mapView.Models.add(coord, modelUrl, {
            rotation: model.rotation || [0, 0, 0],
            scale: model.scale || [1, 1, 1],
            verticalOffset: model.verticalOffset || 0,
            material: {
              Default: { color: model.color || "#ffffff" },
            },
          });
        } catch (mErr) {
          console.warn("⚠️ Could not place model coordinate:", model, mErr);
        }
      });
    }
  } catch (err) {
    console.warn("⚠️ Could not load global models, continuing map init:", err);
  }
}
function setupCategoryDropdown(
  categorySelect: HTMLSelectElement,
  spaceSelect: HTMLSelectElement,
  mapDataRef: MapData,
  isDestination: boolean = false
): any {
  let activeBuildingId = currentNavBuildingId;
  let activeFloorId: string | undefined = undefined;

  const ts = new TomSelect(spaceSelect, {
    create: false,
    searchField: "text",
    placeholder: isDestination
      ? "Choose destination (room / exit)..."
      : "Choose starting location...",
    sortField: { field: "text", direction: "asc" },
  });

  ts.on("change", (val: string) => {
    if (spaceSelect.value !== val) {
      spaceSelect.value = val;
    }
    if (isDestination) {
      if (typeof onEndSpaceChange === "function") {
        onEndSpaceChange({ target: { value: val } });
      }
    } else {
      if (typeof onStartSpaceChange === "function") {
        onStartSpaceChange({ target: { value: val } });
      }
    }
  });

  function updateForBuilding(buildingId: string, floorId?: string) {
    activeBuildingId = buildingId;
    activeFloorId = floorId;
    const normBId = hazardStore.normalizeBuildingId(buildingId);
    const building =
      CONFIGURED_BUILDINGS.find(
        (b) => hazardStore.normalizeBuildingId(b.id) === normBId
      ) || CONFIGURED_BUILDINGS[0];

    const buildingFloors = (
      building.floors || [{ id: building.floorId, name: building.floorName }]
    ).map((f) => f.id);
    const targetFloors =
      floorId && floorId !== "all" ? [floorId] : buildingFloors;

    // Filter spaces belonging to this building and target floors
    const bSpaces = mapDataRef.getByType("space").filter((s) => {
      const sFloorId = typeof s.floor === "string" ? s.floor : s.floor?.id;
      return (
        sFloorId &&
        targetFloors.includes(sFloorId) &&
        s.name &&
        s.name.trim().length > 0
      );
    });

    // Filter verified exits and entrances belonging to this building and target floors
    const bExits = exitRegistry.getAll().filter((e) => {
      const matchB = hazardStore.normalizeBuildingId(e.buildingId) === normBId;
      const matchF = !floorId || floorId === "all" || e.floorId === floorId;
      return matchB && matchF;
    });

    const verifiedEntrances = bExits.filter((e) => e.isEntrance);
    const verifiedEmergencyExits = bExits.filter((e) => e.isEmergencyExit);

    // Build categories
    const categories: Record<
      string,
      { type: "space" | "exit"; item: any }[]
    > = {
      "All Locations": [],
      "Emergency Exits": [],
      "Building Entrances": [],
      Classrooms: [],
      Offices: [],
      Labs: [],
      "Bedrooms / Living": [],
      Washrooms: [],
      "Canteens & Dining": [],
      Professors: [],
      "Other Spaces": [],
    };

    // 1. Add emergency exits
    verifiedEmergencyExits.forEach((ex) => {
      categories["Emergency Exits"].push({ type: "exit", item: ex });
      categories["All Locations"].push({ type: "exit", item: ex });
    });

    // 2. Add building entrances
    verifiedEntrances.forEach((en) => {
      categories["Building Entrances"].push({ type: "exit", item: en });
      if (!verifiedEmergencyExits.some((ex) => ex.doorId === en.doorId)) {
        categories["All Locations"].push({ type: "exit", item: en });
      }
    });

    // 3. Classify spaces
    bSpaces.forEach((s) => {
      const name = s.name.trim().toLowerCase();
      let cat = "Other Spaces";
      if (name.startsWith("classroom") || name.includes("class")) {
        cat = "Classrooms";
      } else if (name.startsWith("office") || name.includes("office")) {
        cat = "Offices";
      } else if (name.includes("lab")) {
        cat = "Labs";
      } else if (
        name.includes("bed") ||
        name.includes("living") ||
        name.includes("drawing") ||
        name.includes("lobby") ||
        name.includes("porch") ||
        name.includes("court")
      ) {
        cat = "Bedrooms / Living";
      } else if (
        name.includes("washroom") ||
        name.includes("toilet") ||
        name.includes("bath") ||
        name.includes("wc")
      ) {
        cat = "Washrooms";
      } else if (
        name.includes("canteen") ||
        name.includes("cafeteria") ||
        name.includes("dining") ||
        name.includes("kitchen") ||
        name.includes("break")
      ) {
        cat = "Canteens & Dining";
      } else if (s.name && Object.values(professors).includes(s.name)) {
        cat = "Professors";
      }

      categories[cat].push({ type: "space", item: s });
      categories["All Locations"].push({ type: "space", item: s });
    });

    // Populate categorySelect
    categorySelect.innerHTML = "";
    Object.keys(categories).forEach((cat) => {
      if (categories[cat].length > 0) {
        const option = document.createElement("option");
        option.value = cat;
        option.textContent = `${cat} (${categories[cat].length})`;
        categorySelect.appendChild(option);
      }
    });

    function populateCategoryItems(selectedCategory: string) {
      ts.clearOptions();
      const placeholderText = isDestination
        ? "Choose destination (room / exit)..."
        : "Choose starting location...";
      ts.addOption({ value: "", text: placeholderText });

      const items = categories[selectedCategory] || [];
      items.forEach(({ type, item }) => {
        if (type === "exit") {
          const ex: BuildingEntranceExit = item;
          const isBlocked =
            hazardStore.isLocationBlocked(ex.doorId, normBId) ||
            hazardStore.isFloorBlocked(ex.floorId, normBId);
          const icon = isBlocked
            ? "⛔ [BLOCKED] "
            : ex.isEmergencyExit
            ? "🚨 "
            : "🚪 ";
          const text = `${icon}${ex.name} (${ex.floorName})`;
          ts.addOption({ value: ex.doorId, text });
        } else {
          const sp: Space = item;
          const sFloorId =
            typeof sp.floor === "string" ? sp.floor : sp.floor?.id;
          const flObj = mapDataRef.getById("floor", sFloorId || "");
          const floorLabel = flObj?.name || "Floor";
          const isBlocked =
            hazardStore.isLocationBlocked(sp.id, normBId) ||
            (sFloorId ? hazardStore.isFloorBlocked(sFloorId, normBId) : false);
          const prefix = isBlocked ? "⛔ [BLOCKED] " : "";
          const text = `${prefix}${sp.name} (${floorLabel})`;
          ts.addOption({ value: sp.id, text });
        }
      });

      ts.refreshOptions(false);
    }

    categorySelect.onchange = () => {
      populateCategoryItems(categorySelect.value);
    };

    if (categorySelect.options.length > 0) {
      categorySelect.selectedIndex = 0;
      populateCategoryItems(categorySelect.value);
    }
  }

  (ts as any).updateForBuilding = updateForBuilding;
  return ts;
}

function showInstructionBanner(
  text: string,
  upcoming?: string,
  etaText?: string
) {
  let banner = document.getElementById(
    "nav-instruction-banner"
  ) as HTMLDivElement;

  if (!banner) {
    banner = document.createElement("div");
    banner.id = "nav-instruction-banner";
    banner.style.position = "fixed";
    banner.style.top = "16px";
    banner.style.left = "50%";
    banner.style.transform = "translateX(-50%)";
    banner.style.maxWidth = "min(90%, 480px)";
    banner.style.background = "rgba(20,20,20,0.9)";
    banner.style.color = "#fff";
    banner.style.padding = "10px 20px";
    banner.style.borderRadius = "10px";
    banner.style.zIndex = "9998";
    banner.style.textAlign = "center";
    banner.style.boxShadow = "0 2px 10px rgba(0,0,0,0.35)";
    banner.style.lineHeight = "1.35";
    banner.style.pointerEvents = "none";
    document.body.appendChild(banner);
  }

  banner.innerHTML = `
    <div style="font-size:16px; font-weight:600;">${text}</div>
    ${
      upcoming
        ? `<div style="font-size:12px; opacity:0.7; margin-top:4px;">Then: ${upcoming}</div>`
        : ""
    }
    ${
      etaText
        ? `<div style="font-size:12px; opacity:0.85; margin-top:6px; font-weight:600;">${etaText}</div>`
        : ""
    }
  `;

  banner.style.display = "block";
}

function hideInstructionBanner() {
  const banner = document.getElementById("nav-instruction-banner");
  if (banner) banner.style.display = "none";
}

// ✅ NEW: single choke point for every spoken nav announcement (turn
// instructions, floor-change resumes, arrival). Centralizing this means
// the mute toggle and haptic buzz apply everywhere consistently instead of
// having to touch every individual `new SpeechSynthesisUtterance(...)`
// call site. `buzz` defaults to true — pass `{ buzz: false }` for
// non-turn speech like the initial voice-priming test utterance.
function speakInstruction(text: string, opts?: { buzz?: boolean }) {
  const shouldBuzz = opts?.buzz ?? true;

  if (!voiceMuted) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.pitch = 1;
    utterance.rate = 0.95;
    utterance.volume = 1;
    speechSynthesis.speak(utterance);
  }

  // ✅ Haptic buzz fires on the turn/announcement regardless of mute state
  // — muting is "don't talk to me right now", not "don't buzz me either".
  // navigator.vibrate is unsupported on iOS Safari and desktop browsers;
  // guarded so it's a silent no-op there instead of throwing.
  if (shouldBuzz && "vibrate" in navigator) {
    navigator.vibrate(200);
  }
}

function renderTurnByTurnDirections(
  announcements: Announcement[],
  withBuildingCrossings: any[],
  totalDistance: number,
  etaText: string
) {
  const directionsListEl = document.getElementById("directionsList");
  if (!directionsListEl) return;
  directionsListEl.innerHTML = "";

  const detailsEl = directionsListEl.closest("details");
  if (detailsEl) {
    detailsEl.open = true; // Auto-expand so directions are visible right away
  }

  // Header summary badge
  const headerLi = document.createElement("li");
  headerLi.style.listStyleType = "none";
  headerLi.style.marginLeft = "-1.1rem";
  headerLi.style.marginBottom = "10px";
  headerLi.style.padding = "8px 12px";
  headerLi.style.background = "#e8f0fe";
  headerLi.style.borderRadius = "8px";
  headerLi.style.color = "#1a73e8";
  headerLi.style.fontWeight = "700";
  headerLi.style.fontSize = "13px";
  headerLi.style.display = "flex";
  headerLi.style.alignItems = "center";
  headerLi.style.justifyContent = "space-between";
  headerLi.innerHTML = `<span>🧭 <b>${etaText}</b> (${Math.round(totalDistance)}m)</span> <span style="font-size:11px; background:#fff; padding:2px 8px; border-radius:999px; border:1px solid #c2e7ff;">${announcements.length} steps</span>`;
  directionsListEl.appendChild(headerLi);

  announcements.forEach((ann, idx) => {
    const li = document.createElement("li");
    li.style.padding = "6px 0";
    li.style.borderBottom = "1px solid var(--border)";
    li.style.fontSize = "13px";
    li.style.lineHeight = "1.4";

    let icon = "🚶";
    const lower = ann.text.toLowerCase();
    if (lower.includes("left")) icon = "⬅️";
    else if (lower.includes("right")) icon = "➡️";
    else if (lower.includes("straight") || lower.includes("walk") || lower.includes("proceed")) icon = "⬆️";
    else if (lower.includes("elevator") || lower.includes("lift")) icon = "🛗";
    else if (lower.includes("stair") || lower.includes("floor") || lower.includes("vortex") || lower.includes("connection")) icon = "🪜";
    else if (lower.includes("enter") || lower.includes("building")) icon = "🏢";
    else if (lower.includes("destination") || lower.includes("arrive") || lower.includes("exit") || lower.includes("reach")) icon = "🎯";

    const crossingInstr = withBuildingCrossings && withBuildingCrossings[idx];
    const distText = crossingInstr && crossingInstr.distance ? ` <span style="color:var(--text-muted); font-size:11px;">(${Math.round(crossingInstr.distance)}m)</span>` : "";

    li.innerHTML = `<span style="font-size:14px; margin-right:6px;">${icon}</span> <b>Step ${idx + 1}:</b> ${ann.text}${distText}`;
    directionsListEl.appendChild(li);
  });
}

function updateToastPosition() {
  const toast = document.getElementById("nav-toast") as HTMLDivElement | null;
  if (!toast) return;

  const summaryOverlay = document.getElementById("route-summary-overlay");
  const summaryCard = summaryOverlay?.querySelector(".route-summary-card, div") as HTMLElement | null;
  const isSummaryVisible =
    summaryOverlay &&
    summaryOverlay.style.display !== "none" &&
    summaryCard &&
    summaryCard.offsetParent !== null;

  if (isSummaryVisible) {
    const cardRect = summaryCard.getBoundingClientRect();
    const cardHeight = cardRect.height || 54;
    const isMobile = window.innerWidth <= 600;
    const overlayBottom = isMobile ? 12 : 20;
    const gap = isMobile ? 14 : 20;
    const computedBottom = Math.max(90, Math.round(overlayBottom + cardHeight + gap));
    toast.style.bottom = `${computedBottom}px`;
  } else {
    toast.style.bottom = window.innerWidth <= 600 ? "16px" : "20px";
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("resize", updateToastPosition);
}

// Route-summary floating card, shown after Generate computes a route.
// Sits neatly at the bottom of the screen without dimming or blocking the map.
function showRouteSummary(
  stats: { turns: number; floors: number; etaText: string },
  onStart: () => void,
  onCancel: () => void
) {
  let overlay = document.getElementById(
    "route-summary-overlay"
  ) as HTMLDivElement;

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "route-summary-overlay";
    document.body.appendChild(overlay);
  }

  overlay.className = "route-summary-overlay";
  overlay.style.position = "fixed";
  overlay.style.bottom = window.innerWidth <= 600 ? "12px" : "20px";
  overlay.style.left = "0";
  overlay.style.right = "0";
  overlay.style.top = "auto";
  overlay.style.background = "transparent";
  overlay.style.pointerEvents = "none";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "10000";
  overlay.style.padding = window.innerWidth <= 600 ? "0 8px" : "0 12px";
  overlay.style.boxSizing = "border-box";

  overlay.innerHTML = "";

  const card = document.createElement("div");
  card.className = "route-summary-card";
  card.style.background = "rgba(255, 255, 255, 0.98)";
  card.style.backdropFilter = "blur(8px)";
  (card.style as any).webkitBackdropFilter = "blur(8px)";
  card.style.borderRadius = "14px";
  card.style.padding = window.innerWidth <= 600 ? "10px 14px" : "12px 18px";
  card.style.pointerEvents = "auto";
  card.style.display = "flex";
  card.style.alignItems = "center";
  card.style.justifyContent = "space-between";
  card.style.flexWrap = "wrap";
  card.style.gap = window.innerWidth <= 600 ? "10px" : "16px";
  card.style.maxWidth = "min(94vw, 560px)";
  card.style.boxSizing = "border-box";
  card.style.boxShadow = "0 8px 30px rgba(0,0,0,0.22)";
  card.style.border = "1px solid #e2e8f0";
  card.style.fontFamily = "inherit";
  card.style.position = "relative";
  card.style.zIndex = "10001";

  const infoCol = document.createElement("div");
  infoCol.className = "route-summary-info";
  infoCol.style.minWidth = "180px";
  const title = document.createElement("div");
  title.innerHTML = `🏁 <b>Route Ready: ${stats.etaText}</b>`;
  title.style.fontSize = "14px";
  title.style.color = "#1e293b";
  infoCol.appendChild(title);

  const floorWord = stats.floors > 1 ? "floors" : "floor";
  const turnWord = stats.turns === 1 ? "turn" : "turns";
  const subLine = document.createElement("div");
  subLine.textContent = `${stats.turns} ${turnWord} · ${stats.floors} ${floorWord} · Directions loaded`;
  subLine.style.fontSize = "11px";
  subLine.style.color = "#64748b";
  infoCol.appendChild(subLine);
  card.appendChild(infoCol);

  const buttonRow = document.createElement("div");
  buttonRow.className = "route-summary-buttons";
  buttonRow.style.display = "flex";
  buttonRow.style.gap = "8px";
  buttonRow.style.alignItems = "center";
  buttonRow.style.flexShrink = "0";
  buttonRow.style.position = "relative";
  buttonRow.style.zIndex = "10002";

  const startBtn = document.createElement("button");
  startBtn.className = "route-summary-start-btn";
  startBtn.innerHTML = "▶ Start Walk";
  startBtn.style.padding = "8px 16px";
  startBtn.style.borderRadius = "8px";
  startBtn.style.border = "none";
  startBtn.style.background = "#188038";
  startBtn.style.color = "#fff";
  startBtn.style.fontWeight = "700";
  startBtn.style.fontSize = "13px";
  startBtn.style.cursor = "pointer";
  startBtn.style.pointerEvents = "auto";
  startBtn.style.boxShadow = "0 2px 8px rgba(24,128,56,0.35)";
  startBtn.onclick = () => {
    hideRouteSummary();
    const navToast = document.getElementById("nav-toast");
    if (navToast) navToast.style.display = "none";
    onStart();
  };
  buttonRow.appendChild(startBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "route-summary-cancel-btn";
  cancelBtn.innerHTML = "✕ Clear";
  cancelBtn.style.padding = "8px 12px";
  cancelBtn.style.borderRadius = "8px";
  cancelBtn.style.border = "1px solid #cbd5e1";
  cancelBtn.style.background = "#f8fafc";
  cancelBtn.style.color = "#475569";
  cancelBtn.style.fontWeight = "600";
  cancelBtn.style.fontSize = "13px";
  cancelBtn.style.cursor = "pointer";
  cancelBtn.style.pointerEvents = "auto";
  cancelBtn.onclick = () => {
    hideRouteSummary();
    const navToast = document.getElementById("nav-toast");
    if (navToast) navToast.style.display = "none";
    mapView.Navigation.clear();
    deleteSpaceMarker();
    onCancel();
  };
  buttonRow.appendChild(cancelBtn);

  card.appendChild(buttonRow);
  overlay.appendChild(card);
  overlay.style.display = "flex";

  // Reposition toast nicely above route summary overlay
  requestAnimationFrame(updateToastPosition);
}

function hideRouteSummary() {
  const overlay = document.getElementById("route-summary-overlay");
  if (overlay) overlay.style.display = "none";
  updateToastPosition();
}

// ✅ NEW: classifies a washroom space's name into 'men' | 'women' |
// 'unisex'. Word-boundary regexes so "Women's Washroom" doesn't
// false-match the men's pattern (the substring "men" inside "women" isn't
// preceded by a word boundary, so \bmen\b correctly skips it — verified,
// not just assumed). Falls back to 'unisex' for anything that doesn't
// clearly say one or the other (e.g. plain "Washroom", "Accessible
// Washroom", "Family Washroom").
function classifyWashroomGender(name: string): "men" | "women" | "unisex" {
  const lower = name.toLowerCase();
  if (/\bwomen'?s?\b|\bfemale\b|\bladies\b/.test(lower)) return "women";
  if (/\bmen'?s?\b|\bmale\b|\bgents?\b/.test(lower)) return "men";
  return "unisex";
}

// ✅ NEW: small two-button chooser, same visual pattern as the route
// summary card. Used by the Washroom chip when the venue has distinct
// men's/women's washrooms, so the chip can ask which one before routing.
function showGenderPrompt(onMen: () => void, onWomen: () => void) {
  let overlay = document.getElementById(
    "gender-prompt-overlay"
  ) as HTMLDivElement;

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "gender-prompt-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.55)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "10001"; // above the route-summary overlay
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = "";

  const card = document.createElement("div");
  card.style.background = "#fff";
  card.style.borderRadius = "14px";
  card.style.padding = "22px 26px";
  card.style.minWidth = "240px";
  card.style.maxWidth = "90%";
  card.style.textAlign = "center";
  card.style.boxShadow = "0 8px 30px rgba(0,0,0,0.3)";

  const title = document.createElement("div");
  title.textContent = "Which washroom?";
  title.style.fontSize = "16px";
  title.style.fontWeight = "700";
  title.style.marginBottom = "16px";
  card.appendChild(title);

  const buttonRow = document.createElement("div");
  buttonRow.style.display = "flex";
  buttonRow.style.gap = "10px";
  buttonRow.style.justifyContent = "center";

  const menBtn = document.createElement("button");
  menBtn.textContent = "🚹 Men's";
  menBtn.style.padding = "10px 18px";
  menBtn.style.borderRadius = "8px";
  menBtn.style.border = "none";
  menBtn.style.background = "#4C8FD0";
  menBtn.style.color = "#fff";
  menBtn.style.fontWeight = "700";
  menBtn.style.cursor = "pointer";
  menBtn.onclick = () => {
    hideGenderPrompt();
    onMen();
  };
  buttonRow.appendChild(menBtn);

  const womenBtn = document.createElement("button");
  womenBtn.textContent = "🚺 Women's";
  womenBtn.style.padding = "10px 18px";
  womenBtn.style.borderRadius = "8px";
  womenBtn.style.border = "none";
  womenBtn.style.background = "#D04C9E";
  womenBtn.style.color = "#fff";
  womenBtn.style.fontWeight = "700";
  womenBtn.style.cursor = "pointer";
  womenBtn.onclick = () => {
    hideGenderPrompt();
    onWomen();
  };
  buttonRow.appendChild(womenBtn);

  card.appendChild(buttonRow);
  overlay.appendChild(card);
  overlay.style.display = "flex";
}

function hideGenderPrompt() {
  const overlay = document.getElementById("gender-prompt-overlay");
  if (overlay) overlay.style.display = "none";
}

async function init(mapDataOptions: TGetMapDataOptions) {
  let currentTickSpeedMs = 1000;

  // Load data
  try {
    mapData = await getMapData(mapDataOptions);
    hideAuthErrorToast();
  } catch (err: any) {
    console.error("❌ Failed to load Mappedin map data:", err);
    showAuthErrorToast(`Map Load Error: ${err?.message || "Failed to load map data."}`);
    return;
  }
  console.log("FLOORS:", mapData.getByType("floor"));

  const floorToBuilding = buildFloorToBuildingMap(mapData);
  console.log("FLOOR → BUILDING MAP:", floorToBuilding);

  // Clear any existing map and load a new one
  const container = document.getElementById("map-container") as HTMLDivElement;
  const mapEl = document.createElement("div");
  (container as any)?.replaceChildren(mapEl);
  mapView = await show3dMap(mapEl, mapData);
  const dynamicFocus = new DynamicFocus(mapView, {
    autoFocus: false,
    setFloorOnFocus: true,
    indoorZoomThreshold: 18,
    outdoorZoomThreshold: 17,
  });

  mapView.auto();
  await loadGlobalModels();

  mapData
    .getByType("space")
    .filter((s) => s.name.startsWith("Office"))
    .forEach((s) => {
      mapView.updateState(s, {
        color: "#1890FF",
      });
    });
  mapData
    .getByType("space")
    .filter((s) => s.name.startsWith("Classroom"))
    .forEach((s) => {
      mapView.updateState(s, {
        color: "#4CD0A4",
      });
    });

  mapData.getByType("space").forEach((space) => {
    if (space.name) {
      mapView.updateState(space, {
        interactive: true,
      });
    }
  });

  mapData.getByType("floor-stack").forEach((fs) => {
    if (!fs.facade?.center) return;
    mapView.Markers.add(fs.facade.center, `<div>${fs.name}</div>`);
  });

  if (mapView.BlueDot && typeof mapView.BlueDot.enable === "function") {
    mapView.BlueDot.enable();
    blueDotEnabled = true;
  }

  if ("speechSynthesis" in window) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => {
      console.log("✅ Voices ready:", speechSynthesis.getVoices().length);
    };
  }

  // ✅ NEW: incrementing token — see comment near its declaration below for
  // why this exists. Declared at init() scope so every animateTo call site
  // in this function (follow-loop, Recenter click, view-mode toggle, and
  // the new Generate-time snap) shares the exact same counter.
  let programmaticMoveToken = 0;
  let isProgrammaticCameraMove = false;
  let recenterButton: HTMLButtonElement | null = null;
  let viewModeButton: HTMLButtonElement | null = null;
  let muteButton: HTMLButtonElement | null = null;

  function applyDirectionsAndRenderInstructions(
    directions: any,
    startTarget: any,
    destinationTarget: any,
    options?: { isEmergency?: boolean }
  ): boolean {
    if (!directions) return false;

    if (fakePositionUpdater.isRunning()) {
      fakePositionUpdater.stop();
    }

    if (!voicePrimed) {
      speakInstruction("Voice navigation enabled", { buzz: false });
      voicePrimed = true;
      console.log("✅ Voice primed");
    }

    followingBlueDot = true;
    updateRecenterButtonState();

    if (!blueDotEnabled && mapView.BlueDot && typeof mapView.BlueDot.enable === "function") {
      mapView.BlueDot.enable();
      blueDotEnabled = true;
    }

    const lastStep =
      directions.instructions && directions.instructions.length > 0
        ? directions.instructions[directions.instructions.length - 1]
        : null;
    if (lastStep) {
      destinationCoord = {
        latitude: lastStep.coordinate.latitude,
        longitude: lastStep.coordinate.longitude,
        floorId: lastStep.coordinate.floorId,
      };
      console.log("🎯 Destination set:", destinationCoord);

      const targetId = (destinationTarget as any)?.id || endSpaceSelector.value;
      const isExitOrEntrance =
        exitRegistry.getByDoorId(targetId) ||
        exitRegistry.getBySpaceId(targetId);
      const targetName =
        (destinationTarget as any)?.name ||
        (isExitOrEntrance ? isExitOrEntrance.name : "Destination");
      const markerLabel = isExitOrEntrance
        ? (isExitOrEntrance.type === "entrance"
            ? `🚪 ${isExitOrEntrance.name}`
            : `🚨 ${isExitOrEntrance.name}`)
        : rescuerSession.isActive
        ? `🚨 SOS VICTIM: ${rescuerSession.victimName || targetName}`
        : `🏁 ${targetName}`;

      try {
        mapView.Markers.add(
          lastStep.coordinate,
          `<div style="font-size: 16px; font-weight: bold; background: white; padding: 4px 8px; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); border: 2px solid ${isExitOrEntrance || rescuerSession.isActive ? "#dc2626" : "#2563eb"};">${markerLabel}</div>`,
          { rank: 10 }
        );
      } catch {}
    }

    const positionDirections = {
      ...directions,
      coordinates: straightenOutdoorPath(
        directions.coordinates,
        floorToBuilding
      ),
    };

    const jitter = getNumericInputFromElementById("jitter", 0);
    const speed = getNumericInputFromElementById("speed", 1000);
    currentTickSpeedMs = speed;
    const accuracy = getNumericInputFromElementById("accuracy", 5);
    const updateDistance = getNumericInputFromElementById(
      "updateDistance",
      5
    );

    positions = generatePositionUpdates(mapData, positionDirections, {
      maxJitter: jitter,
      accuracy,
      updateDistance: updateDistance,
    });
    console.log("Generated positions:", positions ? positions.slice(0, 5) : null);
    (window as any).positions = positions;

    if (positions && positions.length > 0 && mapView.BlueDot) {
      try {
        mapView.BlueDot.update(positions[0]);
        const blueDotPositionElement = document.getElementById("bluedotupdate");
        if (blueDotPositionElement) {
          blueDotPositionElement.textContent = JSON.stringify(positions[0], null, 2);
        }
      } catch (bdErr) {
        console.warn("Could not set initial BlueDot position:", bdErr);
      }
    }

    activeInstructions = [];
    spokenSteps.clear();
    lastDistanceToFrontInstruction = null;

    buildingCrossings = [];
    nextCrossingPointer = 0;
    crossingToastShownFor.clear();

    const simplified = simplifyInstructions(directions.instructions);
    const withBuildingCrossings = collapseOutdoorLegs(
      simplified,
      floorToBuilding
    );
    const announcements = buildAnnouncements(
      withBuildingCrossings,
      mapData,
      (destinationTarget as any)?.name || endSpaceSelector.value
    );
    console.log(
      "ANNOUNCEMENTS:",
      announcements.map((a) => a.text)
    );

    activeInstructions = announcements.map(({ id, coordinate, text }) => {
      const posIndex = positions
        ? findPositionIndexForCoordinate(positions, coordinate as any)
        : -1;
      return {
        coord: coordinate,
        instruction: text,
        id,
        posIndex,
      };
    });

    if (positions) {
      let crossingSearchFrom = 0;
      for (const instr of withBuildingCrossings) {
        if (instr.isBuildingCrossing) {
          const idx = findPositionIndexForCoordinate(
            positions,
            instr.coordinate,
            crossingSearchFrom
          );
          if (idx >= 0) {
            buildingCrossings.push({
              index: idx,
              buildingName: instr.crossingToBuildingName,
              coordinate: instr.coordinate,
            });
            crossingSearchFrom = idx;
          } else {
            console.warn(
              "⚠️ Could not locate a position index for building crossing:",
              instr.crossingToBuildingName
            );
          }
        }
      }
      console.log("BUILDING CROSSINGS:", buildingCrossings);
    }

    const pathColor = (
      document.getElementById("pathColor") as HTMLInputElement
    )?.value || "#4b90e2";
    const pathRadius = Number(
      (document.getElementById("pathRadius") as HTMLInputElement)?.value || 0.2
    );

    const isEmergencyRoute =
      Boolean(options?.isEmergency) ||
      rescuerSession.isActive ||
      emergencyPanel?.isEmergencyModeActive?.() ||
      !!exitRegistry.getByDoorId(endSpaceSelector.value) ||
      !!exitRegistry.getBySpaceId(endSpaceSelector.value);
    const effectiveColor = isEmergencyRoute ? "#188038" : pathColor;

    if (showPathCheckbox?.checked !== false || isEmergencyRoute) {
      mapView.Navigation.draw(directions, {
        pathOptions: {
          color: effectiveColor,
          nearRadius: pathRadius,
        },
      });
    }

    // On mobile only (< 900px), collapse sheet slightly to open up map view
    if (window.innerWidth < 900) {
      const mainSidebarEl = document.getElementById("sidebar");
      if (mainSidebarEl && !rescuerSession.isActive) {
        mainSidebarEl.classList.remove("expanded");
      }
    }

    // Auto chase-cam snap
    if (positions && positions.length > 1) {
      cameraMode = "walk";
      updateViewModeButtonLabel();

      const first = positions[0];
      const second = positions
        .slice(1)
        .find((p) => p.latitude != null && p.longitude != null);

      if (
        first.latitude != null &&
        first.longitude != null &&
        second &&
        second.latitude != null &&
        second.longitude != null
      ) {
        const initialBearing = calculateBearing(
          first.latitude,
          first.longitude,
          second.latitude,
          second.longitude
        );
        lastComputedBearing = initialBearing;
        animatedBearing = initialBearing;
        lastAppliedPosition = {
          latitude: first.latitude,
          longitude: first.longitude,
        };

        if (
          first.floorOrFloorId &&
          mapView.currentFloor?.id !== first.floorOrFloorId
        ) {
          mapView.setFloor(first.floorOrFloorId);
        }

        const moveToken = ++programmaticMoveToken;
        isProgrammaticCameraMove = true;
        const startFloorObj = first.floorOrFloorId
          ? mapData.getById("floor", first.floorOrFloorId)
          : undefined;
        try {
          const startCoordinate = startFloorObj
            ? mapView.createCoordinate(
                first.latitude,
                first.longitude,
                startFloorObj
              )
            : mapView.createCoordinate({
                latitude: first.latitude,
                longitude: first.longitude,
                floorId: first.floorOrFloorId,
              });
          mapView.Camera.animateTo(
            {
              center: startCoordinate,
              bearing: initialBearing,
              pitch: WALK_CAMERA_PITCH_DEGREES,
              zoomLevel: 30,
            },
            { duration: 500, easing: "ease-in-out" }
          );
        } catch {}
        setTimeout(() => {
          if (moveToken === programmaticMoveToken) {
            isProgrammaticCameraMove = false;
          }
        }, 600);
      }

      followingBlueDot = true;
      updateRecenterButtonState();
    }

    const turnCount = withBuildingCrossings.filter(
      (instr) => instr.action?.type === "Turn"
    ).length;

    const floorIds = new Set(
      positions
        ? positions
            .map((p) => p.floorOrFloorId)
            .filter((f): f is string => !!f)
        : []
    );
    const floorCount = Math.max(1, floorIds.size);

    const totalDistance = positions
      ? computeRemainingDistanceMeters(positions, 0)
      : (directions.distance || 0);
    const etaText = formatEtaText(totalDistance);

    // 1. Immediately show Instruction Banner
    if (activeInstructions.length > 0) {
      showInstructionBanner(
        activeInstructions[0].instruction,
        activeInstructions[1]?.instruction,
        etaText
      );
    }

    // 2. Immediately populate Turn-by-Turn Directions in the sidebar
    renderTurnByTurnDirections(
      announcements,
      withBuildingCrossings,
      totalDistance,
      etaText
    );

    const startNavigation = () => {
      hideToast();
      if (positions) {
        fakePositionUpdater.start(
          positions,
          speed,
          onFakePositionReceived
        );
      }
    };
    (window as any).startNavigation = startNavigation;

    const cancelNavigation = () => {
      positions = undefined;
      (window as any).positions = undefined;
      fakePositionUpdater.stop();
      mapView.BlueDot?.disable?.();
      blueDotEnabled = false;
      activeInstructions = [];
      buildingCrossings = [];
      nextCrossingPointer = 0;
      crossingToastShownFor.clear();
      hideInstructionBanner();
      hideToast();
      const directionsListEl = document.getElementById("directionsList");
      if (directionsListEl) {
        directionsListEl.innerHTML = "";
      }
    };
    (window as any).cancelNavigation = cancelNavigation;

    showRouteSummary(
      { turns: turnCount, floors: floorCount, etaText },
      startNavigation,
      cancelNavigation
    );

    collapseDashboardsAfterRouteSuccess();

    // Voice guidance for first instruction
    if (activeInstructions.length > 0) {
      speakInstruction(activeInstructions[0].instruction);
    }

    return true;
  }

  function executeRouteGeneration(options?: { destinationId?: string; isEmergency?: boolean }): boolean {
    if (options?.destinationId) {
      const targetId = options.destinationId;
      const door = mapData.getById("door", targetId);
      const space = mapData.getById("space", targetId);
      const exit =
        exitRegistry.getByDoorId(targetId) ||
        exitRegistry.getBySpaceId(targetId);
      const displayName = exit
        ? `${exit.type === "entrance" ? "🚪" : "🚨"} ${exit.name}`
        : door
        ? door.name || "Entrance / Exit Door"
        : space
        ? space.name
        : targetId;

      if (endTomSelect && typeof endTomSelect.addOption === "function") {
        endTomSelect.addOption({ value: targetId, text: displayName });
        endTomSelect.setValue(targetId);
      }
      endSpaceSelector.value = targetId;
      onEndSpaceChange({ target: { value: targetId } });
      updateFavoriteButtonState();
    }

    if (mapData == null) return false;

    // In rescuer session, strictly sync chosen exterior entrance origin and locked victim destination
    if (rescuerSession.isActive) {
      const selectedDoorId = (rescuerEntrySelector && rescuerEntrySelector.value) ? rescuerEntrySelector.value : null;
      if (selectedDoorId) {
        rescuerSession.selectedEntranceDoorId = selectedDoorId;
        const entrance = exitRegistry.getByDoorId(selectedDoorId) || exitRegistry.getById(selectedDoorId);
        if (entrance) {
          currentStartBuildingId = entrance.buildingId;
          currentStartFloorId = entrance.floorId;

          const startBSel = document.getElementById("startBuildingSelector") as HTMLSelectElement | null;
          if (startBSel) startBSel.value = entrance.buildingId;

          const startFSel = document.getElementById("startFloorSelector") as HTMLSelectElement | null;
          const startBadge = document.getElementById("startFloorBadge");
          if (startFSel) {
            populateFloorSelect(startFSel, entrance.buildingId, entrance.floorId, startBadge);
          }

          if (startTomSelect && typeof (startTomSelect as any).updateForBuilding === "function") {
            (startTomSelect as any).updateForBuilding(entrance.buildingId, entrance.floorId);
          }

          const startTargetId = entrance.doorId;
          let startOpt = startSpaceSelector.querySelector(`option[value="${startTargetId}"]`) as HTMLOptionElement | null;
          if (!startOpt) {
            startOpt = document.createElement("option");
            startOpt.value = startTargetId;
            startOpt.textContent = `🚪 Entrance: ${entrance.name}`;
            startSpaceSelector.appendChild(startOpt);
          }
          startSpaceSelector.value = startTargetId;

          if (startTomSelect && typeof startTomSelect.addOption === "function") {
            startTomSelect.addOption({
              value: startTargetId,
              text: `🚪 Entrance: ${entrance.name}`,
            });
            startTomSelect.setValue(startTargetId);
          }
          onStartSpaceChange({ target: { value: startTargetId } });
        }

        if (rescuerSession.victimSpaceId) {
          let opt = endSpaceSelector.querySelector(`option[value="${rescuerSession.victimSpaceId}"]`) as HTMLOptionElement | null;
          if (!opt) {
            opt = document.createElement("option");
            opt.value = rescuerSession.victimSpaceId;
            opt.textContent = `🚨 Victim: ${rescuerSession.victimName}`;
            endSpaceSelector.appendChild(opt);
          }
          endSpaceSelector.value = rescuerSession.victimSpaceId;
          if (endTomSelect && typeof endTomSelect.setValue === "function") {
            try { endTomSelect.setValue(rescuerSession.victimSpaceId); } catch {}
          }
        }
      } else {
        if (rescuerSession.selectedEntranceDoorId && !startSpaceSelector.value) {
          startSpaceSelector.value = rescuerSession.selectedEntranceDoorId;
        }
        if (rescuerSession.victimSpaceId && !endSpaceSelector.value) {
          startSpaceSelector.value = rescuerSession.victimSpaceId;
        }
      }
    }

    if (!startSpaceSelector.value || !endSpaceSelector.value) {
      if (rescuerSession.isActive && !rescuerSession.selectedEntranceDoorId) {
        showToast("🚪 Please select a building exterior entrance point first.");
        rescuerEntrySelector?.focus?.();
        return false;
      }
      showToast("Please select both a Starting Location and a Destination.");
      return false;
    }

    if (startSpaceSelector.value === endSpaceSelector.value) {
      showToast("Starting location and destination cannot be the same.");
      return false;
    }

    if (startSpaceSelector.value && endSpaceSelector.value) {
      const start =
        mapData.getById("door", startSpaceSelector.value) ||
        mapData.getById("space", startSpaceSelector.value);
      const end =
        mapData.getById("door", endSpaceSelector.value) ||
        mapData.getById("space", endSpaceSelector.value);

      if (start && end) {
        // 1. Strict Hazard Checks: Blocked starting location
        const sBuilding = currentStartBuildingId;
        const eBuilding = currentDestBuildingId;
        const isInterBuilding = hazardStore.normalizeBuildingId(sBuilding) !== hazardStore.normalizeBuildingId(eBuilding);

        if (hazardStore.isLocationBlocked(startSpaceSelector.value, sBuilding)) {
          mapView.Navigation.clear();
          positions = undefined;
          activeInstructions = [];
          hideInstructionBanner();
          hideRouteSummary();
          const directionsListEl = document.getElementById("directionsList");
          if (directionsListEl) directionsListEl.innerHTML = "";
          alert("NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.");
          return false;
        }

        // 2. Strict Hazard Checks: Blocked destination
        if (hazardStore.isLocationBlocked(endSpaceSelector.value, eBuilding)) {
          mapView.Navigation.clear();
          positions = undefined;
          activeInstructions = [];
          hideInstructionBanner();
          hideRouteSummary();
          const directionsListEl = document.getElementById("directionsList");
          if (directionsListEl) directionsListEl.innerHTML = "";
          alert("NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.");
          return false;
        }

        // 3. Strict Hazard Checks: Blocked floor traversal
        const startFloorId = typeof (start as any).floor === "string" ? (start as any).floor : (start as any).floor?.id;
        const endFloorId = typeof (end as any).floor === "string" ? (end as any).floor : (end as any).floor?.id;
        if (startFloorId && hazardStore.isFloorBlocked(startFloorId, sBuilding)) {
          mapView.Navigation.clear();
          positions = undefined;
          activeInstructions = [];
          hideInstructionBanner();
          hideRouteSummary();
          const directionsListEl = document.getElementById("directionsList");
          if (directionsListEl) directionsListEl.innerHTML = "";
          alert("NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.");
          return false;
        }
        if (endFloorId && hazardStore.isFloorBlocked(endFloorId, eBuilding)) {
          mapView.Navigation.clear();
          positions = undefined;
          activeInstructions = [];
          hideInstructionBanner();
          hideRouteSummary();
          const directionsListEl = document.getElementById("directionsList");
          if (directionsListEl) directionsListEl.innerHTML = "";
          alert("NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.");
          return false;
        }

        // 4. Strict Hazard Checks: Start or Destination inside an active hazard polygon
        const activeHazardsForEndpoints = isInterBuilding
          ? hazardStore.getActiveHazards()
          : hazardStore.getActiveHazards().filter(
              (h) => hazardStore.normalizeBuildingId(h.buildingId) === hazardStore.normalizeBuildingId(sBuilding)
            );
        for (const h of activeHazardsForEndpoints) {
          if (h.polygon && h.polygon.geometry?.coordinates?.[0]) {
            const ring = h.polygon.geometry.coordinates[0];
            const startFlMatch = !startFloorId || h.floorId === "all" || h.floorId === startFloorId;
            if (startFlMatch && (start as any).center && isPointInPolygon((start as any).center.latitude, (start as any).center.longitude, ring)) {
              mapView.Navigation.clear();
              positions = undefined;
              activeInstructions = [];
              hideInstructionBanner();
              hideRouteSummary();
              alert("NO SAFE ROUTE AVAILABLE — YOUR STARTING LOCATION IS INSIDE A BLOCKED AREA.");
              return false;
            }
            const endFlMatch = !endFloorId || h.floorId === "all" || h.floorId === endFloorId;
            if (endFlMatch && (end as any).center && isPointInPolygon((end as any).center.latitude, (end as any).center.longitude, ring)) {
              mapView.Navigation.clear();
              positions = undefined;
              activeInstructions = [];
              hideInstructionBanner();
              hideRouteSummary();
              alert("NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.");
              return false;
            }
          }
        }

        // Zones check: if inter-building route, gather campus-wide zones; otherwise building-specific
        const zones = isInterBuilding
          ? hazardStore.getMappedinZones(mapData)
          : hazardStore.getMappedinZones(mapData, sBuilding);

        let directions =
          zones.length > 0
            ? mapData.getDirections(start, end, { zones })
            : mapData.getDirections(start, end);

        // Fallback: If routing directly to door failed, try door.center coordinate
        if (!directions) {
          const navStart = (start as any).center || start;
          const navEnd = (end as any).center || end;
          directions =
            zones.length > 0
              ? mapData.getDirections(navStart, navEnd, { zones })
              : mapData.getDirections(navStart, navEnd);
        }

        // Intersection validation: verify route and endpoints do not cross active hazard polygon
        if (directions && zones.length > 0 && directions.coordinates) {
          const activeHazards = isInterBuilding
            ? hazardStore.getActiveHazards()
            : hazardStore.getActiveHazards().filter(
                (h) => hazardStore.normalizeBuildingId(h.buildingId) === hazardStore.normalizeBuildingId(sBuilding)
              );
          for (const h of activeHazards) {
            if (h.polygon && doesRouteIntersectPolygon(directions.coordinates, h.polygon, h.floorId)) {
              console.warn(`executeRouteGeneration: Route intersects active hazard "${h.name}". Refusing unsafe route.`);
              directions = undefined;
              break;
            }
          }
        }

        if (!directions) {
          console.warn("⚠️ No safe route found between start and end!");
          const unconstrained = mapData.getDirections(start, end);
          mapView.Navigation.clear();
          positions = undefined;
          (window as any).positions = undefined;
          activeInstructions = [];
          fakePositionUpdater.stop();
          mapView.BlueDot?.disable?.();
          blueDotEnabled = false;
          hideInstructionBanner();
          hideRouteSummary();
          const directionsListEl = document.getElementById("directionsList");
          if (directionsListEl) directionsListEl.innerHTML = "";
          const statusEl = document.getElementById("rescuerEntryStatus");
          if (statusEl && rescuerSession.isActive) {
            statusEl.style.display = "block";
            statusEl.style.background = "#fee2e2";
            statusEl.style.color = "#991b1b";
            statusEl.style.border = "1px solid #f87171";
            statusEl.innerHTML = `⛔ <b>No Safe Route:</b> Paths from selected entrance to victim cross active red-zone hazards. Please select an alternate entrance.`;
          }
          if (unconstrained && zones.length > 0) {
            alert("NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.");
          } else if (!unconstrained) {
            alert("A continuous route between these locations is currently unavailable in the venue network.");
          } else {
            alert("NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.");
          }
          return false;
        }

        if (directions) {
          const routeResult = applyDirectionsAndRenderInstructions(directions, start, end, options);
          if (routeResult && rescuerSession.isActive) {
            const statusEl = document.getElementById("rescuerEntryStatus");
            if (statusEl && rescuerSession.selectedEntranceDoorId) {
              const entrance = exitRegistry.getByDoorId(rescuerSession.selectedEntranceDoorId) || exitRegistry.getById(rescuerSession.selectedEntranceDoorId);
              const entranceName = entrance?.name || "Selected Entrance";
              statusEl.style.display = "block";
              statusEl.style.background = "#dcfce7";
              statusEl.style.color = "#15803d";
              statusEl.style.border = "1px solid #86efac";
              statusEl.innerHTML = `✅ <b>Safe Rescue Route Plotted:</b> Entering via <b>${entranceName}</b> &rarr; Navigating safely to victim (<b>${rescuerSession.victimName}</b>).`;
              showToast(`🏃 RESCUE ROUTE: Enter via ${entranceName} and follow green safe route to victim!`);
            }
            const directionsListEl = document.getElementById("directionsList");
            const detailsEl = directionsListEl?.closest("details");
            if (detailsEl) {
              detailsEl.open = true;
            }
          }
          return routeResult;
        }
      }
    }
    return false;
  }

  generateButton.onclick = () => {
    executeRouteGeneration();
  };

  populateFloorSelector(
    document.getElementById("floorSelector")! as HTMLSelectElement,
    mapData,
    mapView
  );

  startTomSelect = setupCategoryDropdown(
    document.getElementById("startCategory") as HTMLSelectElement,
    document.getElementById("startSpace") as HTMLSelectElement,
    mapData,
    false
  );

  endTomSelect = setupCategoryDropdown(
    document.getElementById("endCategory") as HTMLSelectElement,
    document.getElementById("endSpace") as HTMLSelectElement,
    mapData,
    true
  );

  (window as any).startTomSelect = startTomSelect;
  (window as any).endTomSelect = endTomSelect;
  (window as any).executeRouteGeneration = executeRouteGeneration;

  // ------------------ QUICK-ACCESS CHIPS ------------------
  // ✅ CHANGED: category chips (Canteen / Washroom / Water Cooler) no
  // longer just grab the first match in the venue — they find the
  // NEAREST matching space to whatever's currently picked in the START
  // selector, then immediately trigger route generation to it. Professor
  // chips are unchanged (each professor maps to exactly one office, so
  // "nearest" doesn't apply — tapping one just routes straight there).
  //
  // ⚠️ Nearest-search prefers a match on the SAME FLOOR as the start
  // space when one exists, falling back to nearest-overall only if no
  // same-floor match exists — avoids sending someone to a washroom two
  // floors away when a closer one on their own floor exists but happens
  // to be a few extra meters of straight-line distance from a different
  // floor's option.
  function getSpaceFloorId(s: any): string | undefined {
    return typeof s.floor === "string" ? s.floor : s.floor?.id;
  }

  function findNearestSpace(candidates: Space[]): Space | undefined {
    const startId = startSpaceSelector.value;
    const withCenters = candidates.filter((s) => s.center);

    if (!startId) {
      // No start picked yet — nothing to measure "nearest" against, so
      // just fall back to whatever's first rather than blocking the chip.
      return withCenters[0];
    }

    const startSpace = (mapData.getById("door", startId) as any) || mapData.getById("space", startId);
    if (!startSpace || !startSpace.center) return withCenters[0];

    const startFloorId = getSpaceFloorId(startSpace);
    const startCenter = startSpace.center;
    const pool = withCenters.filter((s) => s.id !== startId);
    if (pool.length === 0) return undefined;

    const sameFloor = startFloorId
      ? pool.filter((s) => getSpaceFloorId(s) === startFloorId)
      : [];
    const searchPool = sameFloor.length > 0 ? sameFloor : pool;

    let nearest: Space | undefined;
    let nearestDist = Infinity;
    for (const s of searchPool) {
      const d = haversineDistance(
        startCenter.latitude,
        startCenter.longitude,
        s.center!.latitude,
        s.center!.longitude
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearest = s;
      }
    }
    return nearest;
  }

  // ✅ NEW: after picking the destination for a chip, immediately runs
  // the same flow a manual Generate click would (voice priming, camera
  // snap, route-summary card) — so tapping a chip is a genuine one-tap
  // "take me to the nearest X" action, not just a form-fill.
  function selectDestinationAndGenerate(space: Space) {
    // ✅ FIX: TomSelect only has options loaded for whichever category tab
    // is currently active (e.g. "Classrooms") — calling setValue() for a
    // space outside that list (a washroom, while some other category is
    // selected) used to silently do nothing, leaving the underlying
    // <select> unchanged. Generate would then run against a stale/empty
    // destination and do nothing beyond the voice-priming line that fires
    // on every click regardless. Registering the option first guarantees
    // setValue always succeeds, no matter which category tab is active.
    if (endTomSelect && typeof endTomSelect.addOption === "function") {
      endTomSelect.addOption({ value: space.id, text: space.name });
    }
    if (endTomSelect && typeof endTomSelect.setValue === "function") {
      endTomSelect.setValue(space.id);
    }
    // Belt-and-braces: force the underlying <select> value directly too,
    // in case the TomSelect wrapper doesn't propagate for any reason.
    endSpaceSelector.value = space.id;
    onEndSpaceChange({ target: { value: space.id } });
    executeRouteGeneration({ destinationId: space.id });
  }

  function buildQuickAccessChips(spaces: Space[]) {
    const existing = document.getElementById("quick-access-chips");
    if (existing) existing.remove();

    const chipBar = document.createElement("div");
    chipBar.id = "quick-access-chips";
    chipBar.style.display = "flex";
    chipBar.style.gap = "8px";
    chipBar.style.overflowX = "auto";
    chipBar.style.padding = "4px 2px 8px";
    chipBar.style.marginBottom = "6px";

    type ChipDef = { label: string; onTap: () => void };
    const chipDefs: ChipDef[] = [];

    // Professors — fixed destination each (their specific office), so no
    // nearest-search needed. Routes straight there on tap.
    Object.entries(professors).forEach(([profName, officeName]) => {
      const space = spaces.find((s) => s.name === officeName);
      if (space) {
        chipDefs.push({
          label: `👤 ${profName}`,
          onTap: () => selectDestinationAndGenerate(space),
        });
      }
    });

    // Canteen — nearest match to current start, resolved at tap time.
    const canteenSpaces = spaces.filter((s) =>
      s.name.toLowerCase().includes("canteen")
    );
    if (canteenSpaces.length > 0) {
      chipDefs.push({
        label: "🍽️ Canteen",
        onTap: () => {
          const nearest = findNearestSpace(canteenSpaces);
          if (nearest) selectDestinationAndGenerate(nearest);
          else console.warn("⚠️ No reachable canteen found");
        },
      });
    }

    // Washroom — if the venue has distinguishable men's/women's
    // washrooms, prompt which one before routing; otherwise (venue only
    // labels them generically, e.g. plain "Washroom") just go straight to
    // nearest, same as before.
    const washroomSpaces = spaces.filter(
      (s) =>
        s.name.toLowerCase().includes("washroom") ||
        s.name.toLowerCase().includes("toilet")
    );
    if (washroomSpaces.length > 0) {
      const menSpaces = washroomSpaces.filter(
        (s) => classifyWashroomGender(s.name) === "men"
      );
      const womenSpaces = washroomSpaces.filter(
        (s) => classifyWashroomGender(s.name) === "women"
      );
      const hasGenderSplit = menSpaces.length > 0 && womenSpaces.length > 0;

      chipDefs.push({
        label: "🚻 Washroom",
        onTap: () => {
          if (hasGenderSplit) {
            showGenderPrompt(
              () => {
                const nearest = findNearestSpace(menSpaces);
                if (nearest) selectDestinationAndGenerate(nearest);
                else console.warn("⚠️ No reachable men's washroom found");
              },
              () => {
                const nearest = findNearestSpace(womenSpaces);
                if (nearest) selectDestinationAndGenerate(nearest);
                else console.warn("⚠️ No reachable women's washroom found");
              }
            );
          } else {
            const nearest = findNearestSpace(washroomSpaces);
            if (nearest) selectDestinationAndGenerate(nearest);
            else console.warn("⚠️ No reachable washroom found");
          }
        },
      });
    }

    // ✅ NEW: Water Cooler — same nearest-search pattern. Matches a few
    // common naming variants since venues label these inconsistently.
    const waterCoolerSpaces = spaces.filter((s) => {
      const n = s.name.toLowerCase();
      return (
        n.includes("water cooler") ||
        n.includes("watercooler") ||
        n.includes("water fountain") ||
        n.includes("drinking water")
      );
    });
    if (waterCoolerSpaces.length > 0) {
      chipDefs.push({
        label: "🚰 Water Cooler",
        onTap: () => {
          const nearest = findNearestSpace(waterCoolerSpaces);
          if (nearest) selectDestinationAndGenerate(nearest);
          else console.warn("⚠️ No reachable water cooler found");
        },
      });
    }

    chipDefs.forEach(({ label, onTap }) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = label;
      chip.style.flex = "0 0 auto";
      chip.style.padding = "8px 14px";
      chip.style.borderRadius = "999px";
      chip.style.border = "1px solid #ccc";
      chip.style.background = "#f5f5f5";
      chip.style.color = "#222";
      chip.style.fontSize = "13px";
      chip.style.fontWeight = "600";
      chip.style.cursor = "pointer";
      chip.style.whiteSpace = "nowrap";
      chip.onclick = onTap;
      chipBar.appendChild(chip);
    });

    // Insert directly above the end-space category/search controls. Falls
    // back to inserting before the select itself if a dedicated container
    // isn't present in this venue's HTML.
    const endCategoryEl = document.getElementById("endCategory");
    const anchor = endCategoryEl?.parentElement ?? endSpaceSelector;
    anchor.parentElement?.insertBefore(chipBar, anchor);
  }

  buildQuickAccessChips(mapData.getByType("space"));

  // =========================================================================
  // ✅ NEW (additive only — nothing above this block was changed):
  //   1) Dark mode toggle
  //   2) Shareable route link (?start=..&end=..)
  //   3) Favorite destinations
  // Each feature only creates its own elements/listeners and, where it
  // needs to react to an existing selector, WRAPS the existing handler
  // (calls it first, then adds its own bit) rather than replacing it.
  // =========================================================================

  // ------------------ DARK MODE TOGGLE ------------------
  const DARK_MODE_STORAGE_KEY = "bluedot-dark-mode";

  function isDarkModeStored(): boolean {
    try {
      return localStorage.getItem(DARK_MODE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function updateDarkModeButtonLabel() {
    if (!darkModeButton) return;
    const on = document.body.classList.contains("dark-mode");
    darkModeButton.textContent = on ? "☀️" : "🌙";
    darkModeButton.title = on ? "Switch to light mode" : "Switch to dark mode";
  }

  function setDarkMode(enabled: boolean) {
    document.body.classList.toggle("dark-mode", enabled);
    try {
      localStorage.setItem(DARK_MODE_STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // localStorage unavailable (private mode etc.) — just won't persist
    }
    updateDarkModeButtonLabel();
  }

  let darkModeButton = document.getElementById(
    "darkModeButton"
  ) as HTMLButtonElement | null;

  if (!darkModeButton) {
    darkModeButton = document.createElement("button");
    darkModeButton.id = "darkModeButton";
    darkModeButton.style.position = "fixed";
    darkModeButton.style.top = "16px";
    darkModeButton.style.right = "64px"; // left of the existing mute button
    darkModeButton.style.width = "40px";
    darkModeButton.style.height = "40px";
    darkModeButton.style.borderRadius = "50%";
    darkModeButton.style.border = "none";
    darkModeButton.style.background = "rgba(20,20,20,0.85)";
    darkModeButton.style.color = "#fff";
    darkModeButton.style.fontSize = "18px";
    darkModeButton.style.display = "flex";
    darkModeButton.style.alignItems = "center";
    darkModeButton.style.justifyContent = "center";
    darkModeButton.style.cursor = "pointer";
    darkModeButton.style.boxShadow = "0 2px 8px rgba(0,0,0,0.35)";
    darkModeButton.style.zIndex = "9999";
    document.body.appendChild(darkModeButton);
  }

  darkModeButton.addEventListener("click", () => {
    setDarkMode(!document.body.classList.contains("dark-mode"));
  });

  // Note: this only re-themes YOUR UI chrome (sidebar/topbar/buttons) via
  // the --surface/--text/--border CSS variables already used throughout
  // index.html. The actual 3D map render itself isn't re-themed — Mappedin
  // doesn't expose a safe runtime dark-style switch, and faking it with a
  // CSS filter on the map canvas would also invert marker/label text and
  // make them unreadable, so that part is intentionally left alone.
  setDarkMode(isDarkModeStored());

  // ------------------ SHARE ROUTE LINK ------------------
  // ✅ CHANGED: a share link is "meet me here" — it only encodes YOUR
  // current location (the "From" selector) as the destination for
  // whoever opens it. It deliberately does NOT also lock in an "end",
  // since your friend needs to pick THEIR OWN current location as the
  // start and route to you — that's the whole point of sharing it.
  function buildShareUrl(): string | null {
    if (!startSpaceSelector.value) return null;
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("meet", startSpaceSelector.value);
    return url.toString();
  }

  let shareButton = document.getElementById(
    "shareButton"
  ) as HTMLButtonElement | null;

  if (!shareButton) {
    shareButton = document.createElement("button");
    shareButton.id = "shareButton";
    shareButton.textContent = "🔗";
    shareButton.title = "Copy shareable route link";
    shareButton.style.position = "fixed";
    shareButton.style.bottom = "128px";
    shareButton.style.right = "16px";
    shareButton.style.width = "44px";
    shareButton.style.height = "44px";
    shareButton.style.borderRadius = "50%";
    shareButton.style.border = "none";
    shareButton.style.background = "rgba(20,20,20,0.85)";
    shareButton.style.color = "#fff";
    shareButton.style.fontSize = "18px";
    shareButton.style.display = "flex";
    shareButton.style.alignItems = "center";
    shareButton.style.justifyContent = "center";
    shareButton.style.cursor = "pointer";
    shareButton.style.boxShadow = "0 2px 8px rgba(0,0,0,0.35)";
    shareButton.style.zIndex = "9997";
    document.body.appendChild(shareButton);
  }

  shareButton.addEventListener("click", async () => {
    const url = buildShareUrl();
    if (!url) {
      showToast("Pick where you are (From) first, then share");
      setTimeout(hideToast, 2200);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("📋 Link copied — send it to meet up here!");
      setTimeout(hideToast, 2200);
    } catch {
      // Clipboard API blocked/unsupported (e.g. non-HTTPS or no
      // permission) — fall back to a prompt so it can still be copied.
      window.prompt("Copy this link:", url);
    }
  });

  // ------------------ SOS RESCUE BROADCAST & INCIDENT SHARING ------------------
  let sosButton = document.getElementById(
    "sosButton"
  ) as HTMLButtonElement | null;

  if (!sosButton) {
    sosButton = document.createElement("button");
    sosButton.id = "sosButton";
    sosButton.textContent = "🆘";
    sosButton.title = "Broadcast Emergency SOS link to rescue responders";
    sosButton.style.position = "fixed";
    sosButton.style.bottom = "180px";
    sosButton.style.right = "16px";
    sosButton.style.width = "44px";
    sosButton.style.height = "44px";
    sosButton.style.borderRadius = "50%";
    sosButton.style.border = "none";
    sosButton.style.background = "#d93025";
    sosButton.style.color = "#fff";
    sosButton.style.fontSize = "18px";
    sosButton.style.display = "flex";
    sosButton.style.alignItems = "center";
    sosButton.style.justifyContent = "center";
    sosButton.style.cursor = "pointer";
    sosButton.style.boxShadow = "0 2px 10px rgba(217,48,37,0.45)";
    sosButton.style.zIndex = "9997";
    document.body.appendChild(sosButton);

    sosButton.addEventListener("click", async () => {
      let spaceId = startSpaceSelector.value;
      if (!spaceId) {
        const building =
          CONFIGURED_BUILDINGS.find(
            (b) =>
              hazardStore.normalizeBuildingId(b.id) ===
              hazardStore.normalizeBuildingId(currentStartBuildingId)
          ) || CONFIGURED_BUILDINGS[0];
        spaceId = building.defaultStartSpaceId;
        startSpaceSelector.value = spaceId;
        if (startTomSelect && typeof startTomSelect.setValue === "function") {
          startTomSelect.setValue(spaceId);
        }
      }

      const victimSpace =
        (mapData.getById("door", spaceId) as any) ||
        mapData.getById("space", spaceId);
      const locName = victimSpace?.name || spaceId;
      const bId = currentStartBuildingId;
      const flId = currentStartFloorId || (typeof victimSpace?.floor === "string" ? victimSpace.floor : victimSpace?.floor?.id) || "m_c5bac871ab66226c";
      const bObj = CONFIGURED_BUILDINGS.find(b => hazardStore.normalizeBuildingId(b.id) === hazardStore.normalizeBuildingId(bId));
      const activeHazards = hazardStore.getActiveHazards();

      const snapshot = incidentService.createEmergencySnapshot({
        victimSpaceId: spaceId,
        victimLocationName: locName,
        buildingId: bId,
        buildingName: bObj?.name,
        floorId: flId,
        victimCoordinates: victimSpace?.center,
        hazards: activeHazards,
      });

      const sosData = incidentService.encodeSnapshot(snapshot);

      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("meet", spaceId);
      url.searchParams.set("sos", "true");
      url.searchParams.set("b", bId);
      url.searchParams.set("fl", flId);
      url.searchParams.set("inc", snapshot.incidentId);
      url.searchParams.set("sosData", sosData);
      const sosUrl = url.toString();

      incidentService.createIncident({
        reportedLocation: `${locName} (${bObj?.shortName || "SOS Beacon"})`,
        locationSpaceId: spaceId,
        incidentType: "sos",
        severity: "critical",
        notes: `Emergency SOS distress beacon broadcasted by user (${activeHazards.length} active red-zone restrictions synchronized).`,
      });

      // Synchronize via backend API if available
      incidentService.syncWithBackend(snapshot.incidentId, snapshot);

      try {
        await navigator.clipboard.writeText(sosUrl);
        showToast("🆘 SOS Link copied! Opening Emergency Safety Hub...");
        setTimeout(hideToast, 2500);
      } catch {
        window.prompt("Copy Emergency SOS Link:", sosUrl);
      }

      // Immediately activate emergency mode and open SOS Hub!
      emergencyPanel.setEmergencyMode(true);
      emergencyPanel.expand();
      emergencyPanel.showIncidentDashboard();
    });
  }

  // Reset rescuer session state on map init
  rescuerSession = {
    isActive: false,
    victimSpaceId: "",
    victimName: "",
    victimBuildingId: "",
    victimBuildingName: "",
    victimFloorId: "",
    victimFloorName: "",
    incidentId: "",
    selectedEntranceDoorId: null,
  };

  (window as any).rescuerSession = rescuerSession;

  function populateRescuerEntrySelector(targetBuildingId: string) {
    if (!rescuerEntryGroup || !rescuerEntrySelector) return;

    rescuerEntryGroup.style.display = "block";
    rescuerEntrySelector.innerHTML = "";

    // Query genuine audited exterior entrances from exitRegistry
    const allVerified = exitRegistry.getExteriorEntrances();
    // Validate against actual mapData doors
    const genuineEntrances = allVerified.filter((e) => {
      const door = mapData.getById("door", e.doorId);
      const space = e.spaceId ? mapData.getById("space", e.spaceId) : null;
      return Boolean(door || space);
    });

    if (genuineEntrances.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "⚠️ No verified exterior entrances found in venue data";
      rescuerEntrySelector.appendChild(opt);
      rescuerEntrySelector.disabled = true;
      if (rescuerEntryStatus) {
        rescuerEntryStatus.style.display = "block";
        rescuerEntryStatus.style.background = "#fee2e2";
        rescuerEntryStatus.style.color = "#991b1b";
        rescuerEntryStatus.textContent = "No verified exterior entrances are available in map data for this venue.";
      }
      return;
    }

    rescuerEntrySelector.disabled = false;
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "-- Select Building Exterior Entry / Exit --";
    rescuerEntrySelector.appendChild(defaultOpt);

    const normTarget = hazardStore.normalizeBuildingId(targetBuildingId);
    const targetBuildingEntrances = genuineEntrances.filter(
      (e) => hazardStore.normalizeBuildingId(e.buildingId) === normTarget
    );
    const otherBuildingEntrances = genuineEntrances.filter(
      (e) => hazardStore.normalizeBuildingId(e.buildingId) !== normTarget
    );

    const addOption = (e: BuildingEntranceExit, parent: HTMLElement) => {
      const opt = document.createElement("option");
      opt.value = e.doorId;
      const isEmerg = e.isEmergencyExit && !e.isEntrance;
      opt.textContent = `${isEmerg ? "🚨" : "🚪"} ${e.name} (${e.floorName || "Ground"})`;
      parent.appendChild(opt);
    };

    if (targetBuildingEntrances.length > 0) {
      const targetGroup = document.createElement("optgroup");
      const targetBuildingName = rescuerSession.victimBuildingName || targetBuildingEntrances[0].buildingName || "Victim's Building";
      targetGroup.label = `Victim's Building (${targetBuildingName})`;
      for (const e of targetBuildingEntrances) {
        addOption(e, targetGroup);
      }
      rescuerEntrySelector.appendChild(targetGroup);
    }

    if (otherBuildingEntrances.length > 0) {
      const otherGroup = document.createElement("optgroup");
      otherGroup.label = "Other Campus Exterior Entrances";
      for (const e of otherBuildingEntrances) {
        addOption(e, otherGroup);
      }
      rescuerEntrySelector.appendChild(otherGroup);
    }

    rescuerEntrySelector.onchange = (ev: Event) => {
      const selectedDoorId = (ev.target as HTMLSelectElement).value;
      if (selectedDoorId) {
        handleRescuerEntranceSelection(selectedDoorId);
      }
    };
  }

  function handleRescuerEntranceSelection(doorId: string) {
    if (!doorId) return;
    const entrance = exitRegistry.getByDoorId(doorId) || exitRegistry.getById(doorId);
    if (!entrance) {
      console.warn("Entrance not found in registry:", doorId);
      return;
    }

    const doorObj = mapData.getById("door", entrance.doorId);
    const spaceObj = entrance.spaceId ? mapData.getById("space", entrance.spaceId) : null;
    const startTarget = doorObj || spaceObj;
    if (!startTarget) {
      console.error("Selected entrance door/space missing in mapData:", doorId);
      return;
    }

    rescuerSession.selectedEntranceDoorId = entrance.doorId;

    // 1. Set Rescuer Start Building & Floor
    currentStartBuildingId = entrance.buildingId;
    currentStartFloorId = entrance.floorId;

    const startBSel = document.getElementById("startBuildingSelector") as HTMLSelectElement | null;
    if (startBSel) startBSel.value = entrance.buildingId;

    const startFSel = document.getElementById("startFloorSelector") as HTMLSelectElement | null;
    const startBadge = document.getElementById("startFloorBadge");
    if (startFSel) {
      populateFloorSelect(startFSel, entrance.buildingId, entrance.floorId, startBadge);
    }

    if (startTomSelect && typeof (startTomSelect as any).updateForBuilding === "function") {
      (startTomSelect as any).updateForBuilding(entrance.buildingId, entrance.floorId);
    }

    const startTargetId = doorObj ? doorObj.id : spaceObj!.id;

    // Guarantee native startSpaceSelector contains the option so .value is never dropped
    let startOpt = startSpaceSelector.querySelector(`option[value="${startTargetId}"]`) as HTMLOptionElement | null;
    if (!startOpt) {
      startOpt = document.createElement("option");
      startOpt.value = startTargetId;
      startOpt.textContent = `🚪 Entrance: ${entrance.name}`;
      startSpaceSelector.appendChild(startOpt);
    }
    startSpaceSelector.value = startTargetId;

    if (startTomSelect && typeof startTomSelect.addOption === "function") {
      startTomSelect.addOption({
        value: startTargetId,
        text: `🚪 Entrance: ${entrance.name}`,
      });
      startTomSelect.setValue(startTargetId);
    }
    onStartSpaceChange({ target: { value: startTargetId } });

    // 2. Guarantee Victim Destination remains locked
    let victimOpt = endSpaceSelector.querySelector(`option[value="${rescuerSession.victimSpaceId}"]`) as HTMLOptionElement | null;
    if (!victimOpt) {
      victimOpt = document.createElement("option");
      victimOpt.value = rescuerSession.victimSpaceId;
      victimOpt.textContent = `🚨 Victim: ${rescuerSession.victimName}`;
      endSpaceSelector.appendChild(victimOpt);
    }
    endSpaceSelector.value = rescuerSession.victimSpaceId;
    if (endTomSelect && typeof endTomSelect.setValue === "function") {
      try { endTomSelect.setValue(rescuerSession.victimSpaceId); } catch {}
    }

    // 3. Mark Rescuer Entry Point on Map
    if (mapView.Markers && entrance.coordinates) {
      try {
        mapView.Markers.add(
          entrance.coordinates,
          `<div style="font-size: 12px; font-weight: 800; background: #16a34a; color: #fff; padding: 4px 8px; border-radius: 6px; box-shadow: 0 2px 8px rgba(22,163,74,0.5); border: 2px solid #fff;">🚪 RESCUER ENTRY: ${entrance.name}</div>`,
          { rank: 9 }
        );
      } catch {}
    }

    // 4. Ensure red hazard overlays are 100% rendered and preserved
    if (emergencyPanel) {
      emergencyPanel.renderMapMarkers();
    }

    // 5. Check if entrance itself is blocked by an active hazard
    const isEntranceBlocked =
      hazardStore.isLocationBlocked(entrance.doorId, entrance.buildingId) ||
      hazardStore.isLocationBlocked(entrance.id, entrance.buildingId);

    const statusEl = document.getElementById("rescuerEntryStatus");

    if (isEntranceBlocked) {
      mapView.Navigation.clear();
      positions = undefined;
      (window as any).positions = undefined;
      fakePositionUpdater.stop();
      mapView.BlueDot?.disable?.();
      blueDotEnabled = false;
      activeInstructions = [];
      hideInstructionBanner();
      hideRouteSummary();
      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.style.background = "#fee2e2";
        statusEl.style.color = "#991b1b";
        statusEl.style.border = "1px solid #f87171";
        statusEl.innerHTML = `⚠️ <b>Entrance Blocked:</b> "${entrance.name}" is directly compromised by a reported hazard. Please select an alternate entry point.`;
      }
      alert("NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.");
      return;
    }

    // 6. Execute Route Generation from Entrance to Locked Victim
    const routeSuccess = executeRouteGeneration();

    if (routeSuccess) {
      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.style.background = "#dcfce7";
        statusEl.style.color = "#15803d";
        statusEl.style.border = "1px solid #86efac";
        statusEl.innerHTML = `✅ <b>Safe Rescue Route Plotted:</b> Entering via <b>${entrance.name}</b> &rarr; Navigating safely to victim (<b>${rescuerSession.victimName}</b>).`;
      }
      showToast(`🏃 RESCUE ROUTE: Enter via ${entrance.name} and follow green safe route to victim!`);

      // Auto-expand Turn-by-Turn directions in sidebar
      const directionsListEl = document.getElementById("directionsList");
      const detailsEl = directionsListEl?.closest("details");
      if (detailsEl) {
        detailsEl.open = true;
      }
    } else {
      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.style.background = "#fee2e2";
        statusEl.style.color = "#991b1b";
        statusEl.style.border = "1px solid #f87171";
        statusEl.innerHTML = `⛔ <b>No Safe Route:</b> Paths from "${entrance.name}" to victim cross active red-zone hazards. Please select an alternate entrance.`;
      }
    }
  }

  function activateRescuerSession(params: {
    victimSpaceId: string;
    victimName: string;
    buildingId: string;
    buildingName?: string;
    floorId: string;
    floorName?: string;
    coordinates?: { latitude: number; longitude: number };
    incidentId?: string;
  }) {
    rescuerSession.isActive = true;
    rescuerSession.victimSpaceId = params.victimSpaceId;
    rescuerSession.victimName = params.victimName;
    rescuerSession.victimBuildingId = params.buildingId;
    rescuerSession.victimBuildingName = params.buildingName || "Target Building";
    rescuerSession.victimFloorId = params.floorId;
    rescuerSession.victimFloorName = params.floorName || "Level 1";
    rescuerSession.victimCoordinates = params.coordinates;
    rescuerSession.incidentId = params.incidentId || "INC-SHARED";
    rescuerSession.selectedEntranceDoorId = null;

    // 1. Lock Destination controls to ensure victim destination is never overwritten
    const destBSel = document.getElementById("destBuildingSelector") as HTMLSelectElement | null;
    const destFSel = document.getElementById("destFloorSelector") as HTMLSelectElement | null;
    const destBadge = document.getElementById("destFloorBadge");
    const destSection = document.getElementById("destDashboardSection");
    if (destBSel) destBSel.disabled = true;
    if (destFSel) destFSel.disabled = true;
    if (endSpaceSelector) endSpaceSelector.disabled = true;
    if (endTomSelect && typeof (endTomSelect as any).disable === "function") {
      try { (endTomSelect as any).disable(); } catch {}
    }
    if (destBadge) {
      destBadge.textContent = "🔒 LOCKED TO VICTIM";
      destBadge.style.background = "#fee2e2";
      destBadge.style.color = "#dc2626";
    }
    if (destSection) {
      destSection.style.borderLeftColor = "#ef4444";
    }

    // 2. Populate and display Rescuer Entry Point Selector
    populateRescuerEntrySelector(params.buildingId);
  }

  (window as any).handleRescuerEntranceSelection = handleRescuerEntranceSelection;
  (window as any).populateRescuerEntrySelector = populateRescuerEntrySelector;

  // Load a shared "meet me here" or SOS rescue link (Issue 1)
  function loadSharedMeetLinkFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const isSos = params.get("sos") === "true";
    const meetSpaceId = params.get("victim") || params.get("meet");
    const sosData = params.get("sosData");
    const incId = params.get("inc");

    if (sosData) {
      const snapshot = incidentService.decodeSnapshot(sosData);
      if (snapshot) {
        console.log("🚨 Ingested verified Emergency Incident Snapshot:", snapshot.incidentId, snapshot);

        // 1. Ingest victim's active hazards
        if (snapshot.hazards && snapshot.hazards.length > 0) {
          hazardStore.importIncidentHazards(snapshot.hazards);
        }

        // 2. Set Destination Building and Floor (DO NOT TOUCH START!)
        if (snapshot.victim.buildingId) {
          currentDestBuildingId = snapshot.victim.buildingId;
          const destBSel = document.getElementById("destBuildingSelector") as HTMLSelectElement;
          if (destBSel) destBSel.value = snapshot.victim.buildingId;
          const destFSel = document.getElementById("destFloorSelector") as HTMLSelectElement;
          const destBadge = document.getElementById("destFloorBadge");
          if (destFSel) {
            currentDestFloorId = populateFloorSelect(destFSel, snapshot.victim.buildingId, snapshot.victim.floorId, destBadge);
          }
          if (endTomSelect && typeof (endTomSelect as any).updateForBuilding === "function") {
            (endTomSelect as any).updateForBuilding(snapshot.victim.buildingId, snapshot.victim.floorId);
          }
        }

        // 3. Validate victim target exists in venue data
        const victimTarget: any =
          mapData.getById("door", snapshot.victim.spaceId) ||
          mapData.getById("space", snapshot.victim.spaceId);
        if (!victimTarget) {
          console.error("🚨 Shared victim space does not exist in venue data:", snapshot.victim.spaceId);
          showToast(`⚠️ Shared victim location (${snapshot.victim.locationName || snapshot.victim.spaceId}) could not be resolved in this venue.`);
          alert(`⚠️ UNABLE TO RESOLVE VICTIM LOCATION\n\nThe shared location "${snapshot.victim.locationName || snapshot.victim.spaceId}" does not exist in the venue map data.`);
          return;
        }
        const victimName = snapshot.victim.locationName || victimTarget.name || snapshot.victim.spaceId;

        if (endTomSelect && typeof endTomSelect.addOption === "function") {
          endTomSelect.addOption({
            value: snapshot.victim.spaceId,
            text: `🚨 Victim: ${victimName}`,
          });
          endTomSelect.setValue(snapshot.victim.spaceId);
        }
        endSpaceSelector.value = snapshot.victim.spaceId;
        onEndSpaceChange({ target: { value: snapshot.victim.spaceId } });

        // 4. Show Shared Incident Banner & Legend
        const banner = document.getElementById("sharedIncidentBanner");
        const detailsEl = document.getElementById("sharedIncidentDetails");
        const syncBadge = document.getElementById("sharedIncidentSyncBadge");
        if (banner && detailsEl) {
          banner.style.display = "block";
          const activeCount = snapshot.hazards.filter((h) => !h.isCleared && h.status !== "Cleared").length;
          detailsEl.innerHTML = `Victim: <b>${victimName}</b> (${snapshot.victim.buildingName || "Building"}) &bull; Floor: <b>${snapshot.victim.floorName || "Level 1"}</b><br/>` +
            `Reported: <b>${snapshot.timeReported}</b> &bull; Incident: <code>${snapshot.incidentId}</code><br/>` +
            `<b>${activeCount} active red-zone restriction${activeCount === 1 ? "" : "s"} synchronized.</b>`;
          if (syncBadge) {
            syncBadge.textContent = "VERIFIED SNAPSHOT";
            syncBadge.style.background = "#dcfce7";
            syncBadge.style.color = "#15803d";
          }
        }

        // 5. Switch mapView to victim's floor so rescuer sees victim & hazards immediately
        if (snapshot.victim.floorId) {
          mapView.setFloor(snapshot.victim.floorId);
        }

        // 6. Enter emergency mode and render active red zones
        if (emergencyPanel) {
          emergencyPanel.setEmergencyMode(true);
          emergencyPanel.setBuildingId(snapshot.victim.buildingId);
          emergencyPanel.renderMapMarkers();
        }

        // 7. Add Victim marker on map
        const victimCoord = snapshot.victim.coordinates || victimTarget?.center;
        if (mapView?.Markers) {
          try {
            const markerTarget = victimTarget || victimCoord;
            if (markerTarget) {
              mapView.Markers.add(
                markerTarget,
                `<div style="font-size: 13px; font-weight: 800; background: #dc2626; color: #fff; padding: 4px 8px; border-radius: 6px; box-shadow: 0 2px 8px rgba(220,38,38,0.5); border: 2px solid #fff;">🚨 SOS VICTIM: ${victimName}</div>`
              );
            }
          } catch (mErr) {
            console.warn("Could not add victim marker:", mErr);
          }
        }

        showToast(
          `🚨 RESCUE TARGET SYNCHRONIZED: Victim located at ${victimName}! Select your starting point (From) and tap Generate Route.`
        );
        setTimeout(hideToast, 6000);

        // Listen for live updates broadcasted by victim
        incidentService.listenForEmergencyUpdates((updated) => {
          if (updated.incidentId === snapshot.incidentId) {
            hazardStore.importIncidentHazards(updated.hazards);
            emergencyPanel.renderMapMarkers();
            showToast("🔄 Active incident restrictions updated by victim in real time!");
          }
        });

        // 8. Activate Rescuer-Only session and populate genuine exterior entry points
        activateRescuerSession({
          victimSpaceId: snapshot.victim.spaceId,
          victimName: victimName,
          buildingId: snapshot.victim.buildingId,
          buildingName: snapshot.victim.buildingName,
          floorId: snapshot.victim.floorId,
          floorName: snapshot.victim.floorName,
          coordinates: victimCoord,
          incidentId: snapshot.incidentId,
        });

        return;
      } else {
        showToast("⚠️ Missing or invalid emergency incident data in link.");
      }
    }

    if (!meetSpaceId) return;

    const meetTarget: any =
      mapData.getById("door", meetSpaceId) ||
      mapData.getById("space", meetSpaceId);
    if (!meetTarget) {
      console.warn(
        "⚠️ Shared link references a space/door that doesn't exist in this venue"
      );
      return;
    }
    const meetName =
      meetTarget.name ||
      exitRegistry.getByDoorId(meetSpaceId)?.name ||
      meetSpaceId;

    // Detect target building and floor
    const targetFloorId = typeof meetTarget.floor === "string" ? meetTarget.floor : meetTarget.floor?.id;
    let targetBuilding = CONFIGURED_BUILDINGS[0];
    if (targetFloorId) {
      for (const b of CONFIGURED_BUILDINGS) {
        if (b.floors.some((f) => f.id === targetFloorId) || (b as any).floors?.includes?.(targetFloorId)) {
          targetBuilding = b;
          break;
        }
      }
    }

    currentDestBuildingId = targetBuilding.id;
    const destBSel = document.getElementById("destBuildingSelector") as HTMLSelectElement;
    if (destBSel) destBSel.value = targetBuilding.id;
    const destFSel = document.getElementById("destFloorSelector") as HTMLSelectElement;
    const destBadge = document.getElementById("destFloorBadge");
    if (destFSel) {
      currentDestFloorId = populateFloorSelect(destFSel, targetBuilding.id, targetFloorId || targetBuilding.floorId, destBadge);
    }
    if (endTomSelect && typeof (endTomSelect as any).updateForBuilding === "function") {
      (endTomSelect as any).updateForBuilding(targetBuilding.id, targetFloorId || targetBuilding.floorId);
    }

    if (endTomSelect && typeof endTomSelect.addOption === "function") {
      endTomSelect.addOption({ value: meetSpaceId, text: meetName });
      endTomSelect.setValue(meetSpaceId);
    }
    endSpaceSelector.value = meetSpaceId;
    onEndSpaceChange({ target: { value: meetSpaceId } });
    updateFavoriteButtonState();

    if (targetFloorId) {
      mapView.setFloor(targetFloorId);
    }

    if (isSos) {
      if (emergencyPanel) {
        emergencyPanel.setEmergencyMode(true);
        emergencyPanel.setBuildingId(targetBuilding.id);
        emergencyPanel.renderMapMarkers();
      }
      activateRescuerSession({
        victimSpaceId: meetSpaceId,
        victimName: meetName,
        buildingId: targetBuilding.id,
        buildingName: targetBuilding.name,
        floorId: targetFloorId || targetBuilding.floorId,
        floorName: targetFloorId ? "Level 1" : undefined,
        coordinates: meetTarget?.center,
        incidentId: incId || "INC-SOS",
      });
      showToast(
        `🚨 SOS RESCUE ALERT: Victim located at ${meetName}! Select your entry point and follow safe route.`
      );
      setTimeout(hideToast, 6000);
    } else {
      showToast(
        `📍 Destination set to ${meetName} — pick "From" (where you are) and tap Generate Route`
      );
      setTimeout(hideToast, 5000);
    }
  }

  // ------------------ FAVORITE DESTINATIONS ------------------
  const FAVORITES_STORAGE_KEY = `bluedot-favorites-${mapIdInput.value}`;

  function getFavoriteIds(): string[] {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function setFavoriteIds(ids: string[]) {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // localStorage unavailable — favorites just won't persist
    }
  }

  function isFavorite(spaceId: string): boolean {
    return getFavoriteIds().includes(spaceId);
  }

  function toggleFavorite(spaceId: string) {
    const ids = getFavoriteIds();
    const idx = ids.indexOf(spaceId);
    if (idx >= 0) {
      ids.splice(idx, 1);
    } else {
      ids.push(spaceId);
    }
    setFavoriteIds(ids);
    updateFavoriteButtonState();
    buildFavoriteChips(mapData.getByType("space"));
  }

  let favoriteButton = document.getElementById(
    "favoriteButton"
  ) as HTMLButtonElement | null;

  if (!favoriteButton) {
    favoriteButton = document.createElement("button");
    favoriteButton.id = "favoriteButton";
    favoriteButton.type = "button";
    favoriteButton.style.marginTop = "6px";
    favoriteButton.style.width = "100%";
    favoriteButton.style.minHeight = "36px";
    favoriteButton.style.border = "1px solid var(--border, #e2e2e5)";
    favoriteButton.style.borderRadius = "8px";
    favoriteButton.style.background = "transparent";
    favoriteButton.style.color = "inherit";
    favoriteButton.style.fontSize = "13px";
    favoriteButton.style.fontWeight = "600";
    favoriteButton.style.cursor = "pointer";

    const endCategoryEl = document.getElementById("endCategory");
    const endFieldGroup =
      endCategoryEl?.closest(".field-group") ?? endSpaceSelector.parentElement;
    endFieldGroup?.appendChild(favoriteButton);
  }

  function updateFavoriteButtonState() {
    if (!favoriteButton) return;
    const currentEnd = endSpaceSelector.value;
    if (!currentEnd) {
      favoriteButton.textContent = "☆ Save as favorite";
      favoriteButton.disabled = true;
      favoriteButton.style.opacity = "0.5";
      return;
    }
    favoriteButton.disabled = false;
    favoriteButton.style.opacity = "1";
    favoriteButton.textContent = isFavorite(currentEnd)
      ? "★ Saved as favorite"
      : "☆ Save as favorite";
  }

  favoriteButton.addEventListener("click", () => {
    if (!endSpaceSelector.value) return;
    toggleFavorite(endSpaceSelector.value);
  });

  // Keep the star in sync whenever the end space changes via the normal
  // dropdown — wraps the EXISTING onchange handler (still runs first, so
  // its space-coloring logic is completely untouched) rather than
  // overwriting it.
  const originalOnEndSpaceChange = endSpaceSelector.onchange;
  endSpaceSelector.onchange = (event) => {
    if (typeof originalOnEndSpaceChange === "function") {
      originalOnEndSpaceChange.call(endSpaceSelector, event as any);
    }
    updateFavoriteButtonState();
  };

  function buildFavoriteChips(spaces: Space[]) {
    const existing = document.getElementById("favorite-chips");
    if (existing) existing.remove();

    const favIds = getFavoriteIds();
    if (favIds.length === 0) return;

    const favSpaces = favIds
      .map((id) => spaces.find((s) => s.id === id))
      .filter((s): s is Space => !!s);
    if (favSpaces.length === 0) return;

    const chipBar = document.createElement("div");
    chipBar.id = "favorite-chips";
    chipBar.style.display = "flex";
    chipBar.style.gap = "8px";
    chipBar.style.overflowX = "auto";
    chipBar.style.padding = "4px 2px 8px";
    chipBar.style.marginBottom = "2px";

    favSpaces.forEach((space) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = `★ ${space.name}`;
      chip.style.flex = "0 0 auto";
      chip.style.padding = "8px 14px";
      chip.style.borderRadius = "999px";
      chip.style.border = "1px solid #e0b84c";
      chip.style.background = "#fff8e6";
      chip.style.color = "#7a5b00";
      chip.style.fontSize = "13px";
      chip.style.fontWeight = "600";
      chip.style.cursor = "pointer";
      chip.style.whiteSpace = "nowrap";
      chip.onclick = () => selectDestinationAndGenerate(space);
      chipBar.appendChild(chip);
    });

    // Sits just above the existing quick-access chip bar so favorites
    // read as "your saved shortcuts", with the generic category chips
    // right below.
    const quickAccessBar = document.getElementById("quick-access-chips");
    const endCategoryEl = document.getElementById("endCategory");
    const anchor =
      quickAccessBar ?? endCategoryEl?.parentElement ?? endSpaceSelector;
    anchor.parentElement?.insertBefore(chipBar, anchor);
  }

  let setSpaceMarker: Marker | undefined;

  const deleteSpaceMarker = () => {
    if (setSpaceMarker) {
      mapView.Markers.remove(setSpaceMarker);
      setSpaceMarker = undefined;
    }
  };
  (window as any).deleteSpaceMarker = deleteSpaceMarker;
  (window as any).hazardStore = hazardStore;
  (window as any).exitRegistry = exitRegistry;
  (window as any).emergencyPanel = emergencyPanel;
  (window as any).emergencyPanelInstance = emergencyPanel;
  (window as any).mapView = mapView;
  (window as any).mapViewInstance = mapView;
  (window as any).mapData = mapData;
  (window as any).mapDataInstance = mapData;
  (window as any).startTomSelect = startTomSelect;
  (window as any).endTomSelect = endTomSelect;
  (window as any).incidentService = incidentService;
  (window as any).fakePositionUpdater = fakePositionUpdater;

  function populateFloorSelect(
    selectEl: HTMLSelectElement | null,
    buildingId: string,
    selectedFloorId?: string,
    badgeEl?: HTMLElement | null
  ): string {
    if (!selectEl) return "";
    const normBId = hazardStore.normalizeBuildingId(buildingId);
    const building =
      CONFIGURED_BUILDINGS.find(
        (b) => hazardStore.normalizeBuildingId(b.id) === normBId
      ) || CONFIGURED_BUILDINGS[0];
    const floors = building.floors || [
      { id: building.floorId, name: building.floorName },
    ];
    selectEl.innerHTML = "";
    floors.forEach((fl) => {
      const opt = document.createElement("option");
      opt.value = fl.id;
      opt.textContent = fl.name;
      selectEl.appendChild(opt);
    });
    if (floors.length > 1) {
      const allOpt = document.createElement("option");
      allOpt.value = "all";
      allOpt.textContent = "All Floors";
      selectEl.appendChild(allOpt);
    }
    const chosen =
      selectedFloorId && (floors.some((f) => f.id === selectedFloorId) || selectedFloorId === "all")
        ? selectedFloorId
        : building.floorId;
    selectEl.value = chosen;
    if (badgeEl) {
      const flName = floors.find((f) => f.id === chosen)?.name || (chosen === "all" ? "All Floors" : "Level 1");
      badgeEl.textContent = flName;
    }
    return chosen;
  }

  function switchStartBuilding(
    buildingId: string,
    preserveSelection: boolean = true
  ) {
    const normId = hazardStore.normalizeBuildingId(buildingId);
    const building =
      CONFIGURED_BUILDINGS.find(
        (b) => hazardStore.normalizeBuildingId(b.id) === normId
      ) || CONFIGURED_BUILDINGS[0];

    currentStartBuildingId = building.id;
    currentNavBuildingId = currentStartBuildingId;
    if (emergencyPanel && typeof (emergencyPanel as any).setBuildingId === "function") {
      (emergencyPanel as any).setBuildingId(building.id);
    }

    const startBSel = (document.getElementById("startBuildingSelector") ||
      document.getElementById("navBuildingSelector")) as HTMLSelectElement;
    if (startBSel && startBSel.value !== building.id) {
      startBSel.value = building.id;
    }
    const navBSel = document.getElementById("navBuildingSelector") as HTMLSelectElement;
    if (navBSel && navBSel !== startBSel && navBSel.value !== building.id) {
      navBSel.value = building.id;
    }

    const startFSel = (document.getElementById("startFloorSelector") ||
      document.getElementById("navFloorSelector")) as HTMLSelectElement;
    const badge = document.getElementById("startFloorBadge");
    currentStartFloorId = populateFloorSelect(
      startFSel,
      building.id,
      currentStartFloorId,
      badge
    );
    const navFSel = document.getElementById("navFloorSelector") as HTMLSelectElement;
    if (navFSel && navFSel !== startFSel) {
      populateFloorSelect(navFSel, building.id, currentStartFloorId);
    }

    if (
      startTomSelect &&
      typeof (startTomSelect as any).updateForBuilding === "function"
    ) {
      (startTomSelect as any).updateForBuilding(
        currentStartBuildingId,
        currentStartFloorId
      );
    }

    // Check if current start space is valid in this building/floor
    const curStartVal = startSpaceSelector.value;
    const sp = curStartVal
      ? mapData.getById("space", curStartVal) || mapData.getById("door", curStartVal)
      : null;
    const sFl = sp
      ? typeof (sp as any).floor === "string"
        ? (sp as any).floor
        : (sp as any).floor?.id
      : null;
    const bFloors = (building.floors || [{ id: building.floorId }]).map((f) => f.id);
    const isValid =
      sp && sFl && bFloors.includes(sFl) && (currentStartFloorId === "all" || sFl === currentStartFloorId);

    if (!isValid || !preserveSelection) {
      if (building.defaultStartSpaceId && !preserveSelection) {
        startSpaceSelector.value = building.defaultStartSpaceId;
        if (startTomSelect) startTomSelect.setValue(building.defaultStartSpaceId);
      } else if (!isValid) {
        startSpaceSelector.value = "";
        if (startTomSelect) startTomSelect.setValue("");
      }
    }

    // Update floor in mapView if viewing start building
    if (currentStartFloorId && currentStartFloorId !== "all" && mapView.currentFloor?.id !== currentStartFloorId) {
      mapView.setFloor(currentStartFloorId);
    }

    emergencyPanel?.renderMapMarkers?.();
  }

  function switchStartFloor(floorId: string) {
    currentStartFloorId = floorId;
    const badge = document.getElementById("startFloorBadge");
    if (badge) {
      const fl = mapData.getById("floor", floorId);
      badge.textContent = fl?.name || (floorId === "all" ? "All Floors" : "Level 1");
    }
    const navFSel = document.getElementById("navFloorSelector") as HTMLSelectElement;
    if (navFSel && navFSel.value !== floorId) navFSel.value = floorId;

    if (
      startTomSelect &&
      typeof (startTomSelect as any).updateForBuilding === "function"
    ) {
      (startTomSelect as any).updateForBuilding(
        currentStartBuildingId,
        currentStartFloorId
      );
    }

    if (floorId && floorId !== "all" && mapView.currentFloor?.id !== floorId) {
      mapView.setFloor(floorId);
    }
    emergencyPanel?.renderMapMarkers?.();
  }

  function switchDestBuilding(
    buildingId: string,
    preserveSelection: boolean = true
  ) {
    const normId = hazardStore.normalizeBuildingId(buildingId);
    const building =
      CONFIGURED_BUILDINGS.find(
        (b) => hazardStore.normalizeBuildingId(b.id) === normId
      ) || CONFIGURED_BUILDINGS[0];

    currentDestBuildingId = building.id;

    const destBSel = document.getElementById("destBuildingSelector") as HTMLSelectElement;
    if (destBSel && destBSel.value !== building.id) {
      destBSel.value = building.id;
    }

    const destFSel = document.getElementById("destFloorSelector") as HTMLSelectElement;
    const badge = document.getElementById("destFloorBadge");
    currentDestFloorId = populateFloorSelect(
      destFSel,
      building.id,
      currentDestFloorId,
      badge
    );

    if (
      endTomSelect &&
      typeof (endTomSelect as any).updateForBuilding === "function"
    ) {
      (endTomSelect as any).updateForBuilding(
        currentDestBuildingId,
        currentDestFloorId
      );
    }

    // Check if current end space is valid in this building/floor
    const curEndVal = endSpaceSelector.value;
    const sp = curEndVal
      ? mapData.getById("space", curEndVal) || mapData.getById("door", curEndVal)
      : null;
    const sFl = sp
      ? typeof (sp as any).floor === "string"
        ? (sp as any).floor
        : (sp as any).floor?.id
      : null;
    const bFloors = (building.floors || [{ id: building.floorId }]).map((f) => f.id);
    const isValid =
      sp && sFl && bFloors.includes(sFl) && (currentDestFloorId === "all" || sFl === currentDestFloorId);

    if (!isValid || !preserveSelection) {
      const defEnd = building.defaultEndTargetId;
      if (defEnd && !preserveSelection) {
        endSpaceSelector.value = defEnd;
        if (endTomSelect) endTomSelect.setValue(defEnd);
      } else if (!isValid) {
        endSpaceSelector.value = "";
        if (endTomSelect) endTomSelect.setValue("");
      }
    }
  }

  function switchDestFloor(floorId: string) {
    currentDestFloorId = floorId;
    const badge = document.getElementById("destFloorBadge");
    if (badge) {
      const fl = mapData.getById("floor", floorId);
      badge.textContent = fl?.name || (floorId === "all" ? "All Floors" : "Level 1");
    }

    if (
      endTomSelect &&
      typeof (endTomSelect as any).updateForBuilding === "function"
    ) {
      (endTomSelect as any).updateForBuilding(
        currentDestBuildingId,
        currentDestFloorId
      );
    }
  }

  // Legacy compatibility: switchNavBuilding
  function switchNavBuilding(
    buildingId: string,
    syncEmergencyPanel: boolean = true
  ) {
    switchStartBuilding(buildingId, false);
    if (!endSpaceSelector.value || currentDestBuildingId === currentStartBuildingId) {
      switchDestBuilding(buildingId, false);
    }
    if (syncEmergencyPanel && emergencyPanel) {
      if (emergencyPanel.getCurrentBuildingId() !== buildingId) {
        emergencyPanel.selectBuilding(buildingId, false);
      }
    }
  }

  // Wire up independent selectors
  const startBSel = document.getElementById("startBuildingSelector") as HTMLSelectElement;
  if (startBSel) {
    startBSel.value = currentStartBuildingId;
    startBSel.addEventListener("change", (e) => {
      switchStartBuilding((e.target as HTMLSelectElement).value, false);
    });
  }

  const startFSel = document.getElementById("startFloorSelector") as HTMLSelectElement;
  if (startFSel) {
    startFSel.addEventListener("change", (e) => {
      switchStartFloor((e.target as HTMLSelectElement).value);
    });
  }

  const destBSel = document.getElementById("destBuildingSelector") as HTMLSelectElement;
  if (destBSel) {
    destBSel.value = currentDestBuildingId;
    destBSel.addEventListener("change", (e) => {
      switchDestBuilding((e.target as HTMLSelectElement).value, false);
    });
  }

  const destFSel = document.getElementById("destFloorSelector") as HTMLSelectElement;
  if (destFSel) {
    destFSel.addEventListener("change", (e) => {
      switchDestFloor((e.target as HTMLSelectElement).value);
    });
  }

  // Legacy navBuildingSelector & navFloorSelector wire up
  const navBuildingSelect = document.getElementById("navBuildingSelector") as HTMLSelectElement;
  if (navBuildingSelect) {
    navBuildingSelect.value = currentStartBuildingId;
    navBuildingSelect.addEventListener("change", (e) => {
      switchStartBuilding((e.target as HTMLSelectElement).value, false);
    });
  }

  const navFloorSelect = document.getElementById("navFloorSelector") as HTMLSelectElement;
  if (navFloorSelect) {
    navFloorSelect.addEventListener("change", (e) => {
      switchStartFloor((e.target as HTMLSelectElement).value);
    });
  }

  // Helper to test if a position path intersects any active hazard zone
  function checkRouteIntersectsHazards(
    coords: TBlueDotPositionUpdate[],
    hazards: Hazard[]
  ): boolean {
    if (!coords || coords.length === 0 || !hazards || hazards.length === 0) return false;
    for (const pt of coords) {
      if (pt.latitude == null || pt.longitude == null) continue;
      for (const h of hazards) {
        if (h.floorId !== "all" && pt.floorOrFloorId && h.floorId !== pt.floorOrFloorId) continue;
        if (h.locationType === "floor") return true;
        const latDiff = (pt.latitude - h.coordinates.latitude) * 111000;
        const lonDiff = (pt.longitude - h.coordinates.longitude) * 80000;
        const dist = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
        if (dist <= (h.radiusMeters || 5.0)) return true;
      }
    }
    return false;
  }

  // Subscribe to real-time hazard changes to refresh dropdown item badges and check active navigation
  hazardStore.subscribe(() => {
    if (
      startTomSelect &&
      typeof (startTomSelect as any).updateForBuilding === "function"
    ) {
      (startTomSelect as any).updateForBuilding(
        currentNavBuildingId,
        navFloorSelect?.value
      );
    }
    if (
      endTomSelect &&
      typeof (endTomSelect as any).updateForBuilding === "function"
    ) {
      (endTomSelect as any).updateForBuilding(
        currentNavBuildingId,
        navFloorSelect?.value
      );
    }

    // Dynamic rerouting of active running navigation OR displayed route
    if (positions && positions.length > 0) {
      const activeHazards = hazardStore.getActiveHazards().filter(
        (h) => hazardStore.normalizeBuildingId(h.buildingId) === hazardStore.normalizeBuildingId(currentNavBuildingId)
      );
      const isRunning = fakePositionUpdater.isRunning();
      const remainingStartIndex = isRunning ? Math.max(0, fakePositionUpdater.getLastEmittedIndex()) : 0;
      const remainingPositions = positions.slice(remainingStartIndex);

      const isDestBlocked = hazardStore.isLocationBlocked(endSpaceSelector.value, currentNavBuildingId);
      const isStartBlocked = hazardStore.isLocationBlocked(startSpaceSelector.value, currentNavBuildingId);
      const isPathBlocked = isDestBlocked || isStartBlocked || checkRouteIntersectsHazards(remainingPositions, activeHazards);

      if (isPathBlocked) {
        console.warn("⚠️ Route intersects newly activated hazard zone!");
        if (isRunning) {
          fakePositionUpdater.stop();
        }

        const currentPos = isRunning ? (getCurrentPosition() || remainingPositions[0]) : null;
        const end = mapData.getById("door", endSpaceSelector.value) || mapData.getById("space", endSpaceSelector.value);
        const start = mapData.getById("door", startSpaceSelector.value) || mapData.getById("space", startSpaceSelector.value);
        const zones = hazardStore.getMappedinZones(mapData, currentNavBuildingId);

        let newDirections = null;
        if (end && !isDestBlocked) {
          try {
            if (isRunning && currentPos) {
              const startNav = mapView.createCoordinate(
                currentPos.latitude,
                currentPos.longitude,
                mapData.getById("floor", currentPos.floorOrFloorId || (currentPos as any).floorId)
              );
              newDirections = mapData.getDirections(startNav, end, { zones });
            } else if (start && !isStartBlocked) {
              newDirections = mapData.getDirections(start, end, { zones });
              if (!newDirections) {
                const navStart = (start as any).center || start;
                const navEnd = (end as any).center || end;
                newDirections = mapData.getDirections(navStart, navEnd, { zones });
              }
            }
          } catch {
            newDirections = null;
          }
        }

        if (newDirections) {
          speakInstruction("Hazard detected on route. Recalculating safe route.");
          showInstructionBanner("⚠️ Hazard detected! Recalculating safe route...");
          mapView.Navigation.draw(newDirections, {
            pathOptions: { color: "#188038", nearRadius: 5 },
          });
          const newPositions = generatePositionUpdates(mapData, newDirections, {
            maxJitter: 0,
            accuracy: 5,
            updateDistance: 5,
          });
          positions = newPositions;
          if (isRunning) {
            fakePositionUpdater.start(newPositions, currentTickSpeedMs || 1000, onFakePositionReceived);
          }
        } else {
          if (isRunning) {
            fakePositionUpdater.reset();
          }
          mapView.Navigation.clear();
          positions = undefined;
          activeInstructions = [];
          hideInstructionBanner();
          hideRouteSummary();
          const directionsListEl = document.getElementById("directionsList");
          if (directionsListEl) directionsListEl.innerHTML = "";
          speakInstruction("No safe route available. Stop navigation immediately.");
          alert("NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.");
        }
      }
    }
  });

  updateFavoriteButtonState();
// ------------------ CAMPUSRESQ EMERGENCY INITIALIZATION ------------------
  emergencyPanel.init(mapData, mapView, {
    getCurrentBuildingId: () => currentNavBuildingId,
    getCurrentStartSpace: () => {
      // 0. Rescuer active session: Chosen exterior entrance takes precedence
      if (rescuerSession.isActive && rescuerSession.selectedEntranceDoorId) {
        const entranceTarget =
          mapData.getById("door", rescuerSession.selectedEntranceDoorId) ||
          mapData.getById("space", rescuerSession.selectedEntranceDoorId);
        if (entranceTarget) return entranceTarget;
      }

      // 1. FIRST: User's explicitly selected starting location from route picker
      if (startSpaceSelector && startSpaceSelector.value) {
        const selected =
          mapData.getById("door", startSpaceSelector.value) ||
          mapData.getById("space", startSpaceSelector.value);
        if (selected) {
          return selected;
        }
      }

      // 2. Active simulated navigation position (only when actively running)
      if (fakePositionUpdater && typeof fakePositionUpdater.isRunning === "function" && fakePositionUpdater.isRunning()) {
        const curPos = getCurrentPosition();
        if (curPos && curPos.latitude != null && curPos.longitude != null) {
          const curFloorId = curPos.floorOrFloorId || mapView.currentFloor?.id;
          const spacesOnFloor = mapData.getByType("space").filter((s) => {
            const sFl = typeof s.floor === "string" ? s.floor : s.floor?.id;
            return sFl === curFloorId && s.center;
          });
          if (spacesOnFloor.length > 0) {
            let closestSpace = spacesOnFloor[0];
            let closestDist = Infinity;
            for (const s of spacesOnFloor) {
              const d = haversineDistance(
                curPos.latitude,
                curPos.longitude,
                s.center!.latitude,
                s.center!.longitude
              );
              if (d < closestDist) {
                closestDist = d;
                closestSpace = s;
              }
            }
            if (closestDist < 25) {
              return closestSpace;
            }
          }
        }
      }

      // 3. Fallback to building default start space if nothing selected
      const currentBId = currentNavBuildingId;
      const bConfig = CONFIGURED_BUILDINGS.find(
        (b) =>
          hazardStore.normalizeBuildingId(b.id) ===
          hazardStore.normalizeBuildingId(currentBId)
      );
      if (bConfig && bConfig.defaultStartSpaceId) {
        const defaultSpace =
          mapData.getById("door", bConfig.defaultStartSpaceId) ||
          mapData.getById("space", bConfig.defaultStartSpaceId);
        if (defaultSpace) {
          return defaultSpace;
        }
      }

      return undefined;
    },
    setDestinationSpace: (targetId: string) => {
      const door = mapData.getById("door", targetId);
      const space = mapData.getById("space", targetId);
      const exit =
        exitRegistry.getByDoorId(targetId) ||
        exitRegistry.getBySpaceId(targetId);
      const displayName = exit
        ? `${exit.type === "entrance" ? "🚪" : "🚨"} ${exit.name}`
        : door
        ? door.name || "Entrance / Exit Door"
        : space
        ? space.name
        : targetId;

      if (endTomSelect && typeof endTomSelect.addOption === "function") {
        endTomSelect.addOption({ value: targetId, text: displayName });
        endTomSelect.setValue(targetId);
      }
      endSpaceSelector.value = targetId;
      onEndSpaceChange({ target: { value: targetId } });
      updateFavoriteButtonState();
    },
    setStartSpace: (targetId: string) => {
      const door = mapData.getById("door", targetId);
      const space = mapData.getById("space", targetId);
      const exit =
        exitRegistry.getByDoorId(targetId) ||
        exitRegistry.getBySpaceId(targetId);
      const displayName = exit
        ? `${exit.type === "entrance" ? "🚪" : "🚨"} ${exit.name}`
        : door
        ? door.name || "Entrance / Exit Door"
        : space
        ? space.name
        : targetId;

      if (startTomSelect && typeof startTomSelect.addOption === "function") {
        startTomSelect.addOption({ value: targetId, text: displayName });
        startTomSelect.setValue(targetId);
      }
      startSpaceSelector.value = targetId;
      onStartSpaceChange({ target: { value: targetId } });
    },
    generateRoute: (options?: { destinationId?: string; isEmergency?: boolean }) => {
      return executeRouteGeneration(options);
    },
    onRouteGenerated: (directions: any, destinationTarget: any) => {
      let curStart: any = null;
      if (rescuerSession.isActive && rescuerSession.selectedEntranceDoorId) {
        curStart =
          mapData.getById("door", rescuerSession.selectedEntranceDoorId) ||
          mapData.getById("space", rescuerSession.selectedEntranceDoorId);
      }
      if (!curStart) {
        curStart =
          (emergencyPanel as any)?.callbacks?.getCurrentStartSpace?.() ||
          mapData.getById("door", startSpaceSelector.value) ||
          mapData.getById("space", startSpaceSelector.value);
      }

      applyDirectionsAndRenderInstructions(
        directions,
        curStart,
        destinationTarget,
        { isEmergency: true }
      );
    },
    onClearNavigation: () => {
      mapView.Navigation.clear();
      positions = undefined;
      fakePositionUpdater.reset();
      mapView.BlueDot?.disable?.();
      blueDotEnabled = false;
      hideInstructionBanner();
      hideRouteSummary();
      const directionsListEl = document.getElementById("directionsList");
      if (directionsListEl) {
        directionsListEl.innerHTML = "";
      }
      expandAllDashboards();
    },
    onBuildingChanged: (buildingId: string) => {
      switchNavBuilding(buildingId, false);
    },
  });

  switchStartBuilding(currentStartBuildingId, false);
  switchDestBuilding(currentDestBuildingId, false);

  // Wire up independent dashboard toggle buttons
  const btnToggleStart = document.getElementById("btnToggleStartDashboard");
  if (btnToggleStart) {
    btnToggleStart.addEventListener("click", () => toggleStartDashboard());
  }
  const btnToggleDest = document.getElementById("btnToggleDestDashboard");
  if (btnToggleDest) {
    btnToggleDest.addEventListener("click", () => toggleDestDashboard());
  }

  // Load verified Emergency SOS link after default selectors initialize
  loadSharedMeetLinkFromUrl();

  

  const btnOpenSosDashboard = document.getElementById("btnOpenSosDashboard");
  if (btnOpenSosDashboard) {
    btnOpenSosDashboard.addEventListener("click", () => {
      emergencyPanel.setEmergencyMode(true);
      emergencyPanel.expand();
      emergencyPanel.showIncidentDashboard();
    });
  }

  // ------------------ FEATURE 5: INTERACTIVE MAP PICKING ------------------
  let mapPickMode: "start" | "dest" | null = null;
  const btnPickStartOnMap = document.getElementById("btnPickStartOnMap") as HTMLButtonElement;
  const btnPickDestOnMap = document.getElementById("btnPickDestOnMap") as HTMLButtonElement;
  const btnCancelMapPick = document.getElementById("btnCancelMapPick") as HTMLButtonElement;
  const mapPickStatus = document.getElementById("mapPickStatus") as HTMLElement;

  function setMapPickMode(mode: "start" | "dest" | null) {
    mapPickMode = mode;
    if (!mapPickMode) {
      if (btnCancelMapPick) btnCancelMapPick.style.display = "none";
      if (mapPickStatus) mapPickStatus.style.display = "none";
      if (btnPickStartOnMap) {
        btnPickStartOnMap.style.background = "#e0f2fe";
        btnPickStartOnMap.style.color = "#0369a1";
        btnPickStartOnMap.style.borderColor = "#bae6fd";
      }
      if (btnPickDestOnMap) {
        btnPickDestOnMap.style.background = "#fef3c7";
        btnPickDestOnMap.style.color = "#b45309";
        btnPickDestOnMap.style.borderColor = "#fde68a";
      }
    } else if (mapPickMode === "start") {
      if (btnCancelMapPick) btnCancelMapPick.style.display = "inline-flex";
      if (mapPickStatus) {
        mapPickStatus.style.display = "block";
        mapPickStatus.innerHTML = "📍 <b>Click any space or room on the map</b> to set as START location.";
      }
      if (btnPickStartOnMap) {
        btnPickStartOnMap.style.background = "#0284c7";
        btnPickStartOnMap.style.color = "#ffffff";
        btnPickStartOnMap.style.borderColor = "#0369a1";
      }
      if (btnPickDestOnMap) {
        btnPickDestOnMap.style.background = "#fef3c7";
        btnPickDestOnMap.style.color = "#b45309";
        btnPickDestOnMap.style.borderColor = "#fde68a";
      }
    } else if (mapPickMode === "dest") {
      if (btnCancelMapPick) btnCancelMapPick.style.display = "inline-flex";
      if (mapPickStatus) {
        mapPickStatus.style.display = "block";
        mapPickStatus.innerHTML = "🎯 <b>Click any space, room, or exit on the map</b> to set as DESTINATION.";
      }
      if (btnPickDestOnMap) {
        btnPickDestOnMap.style.background = "#d97706";
        btnPickDestOnMap.style.color = "#ffffff";
        btnPickDestOnMap.style.borderColor = "#b45309";
      }
      if (btnPickStartOnMap) {
        btnPickStartOnMap.style.background = "#e0f2fe";
        btnPickStartOnMap.style.color = "#0369a1";
        btnPickStartOnMap.style.borderColor = "#bae6fd";
      }
    }
  }

  if (btnPickStartOnMap) {
    btnPickStartOnMap.addEventListener("click", () => {
      setMapPickMode(mapPickMode === "start" ? null : "start");
    });
  }

  if (btnPickDestOnMap) {
    btnPickDestOnMap.addEventListener("click", () => {
      if (rescuerSession.isActive) {
        showToast("⚠️ Destination is locked to the victim's location during an active SOS rescue.");
        return;
      }
      setMapPickMode(mapPickMode === "dest" ? null : "dest");
    });
  }

  if (btnCancelMapPick) {
    btnCancelMapPick.addEventListener("click", () => {
      setMapPickMode(null);
    });
  }

  const handleMainMapClick = async (event: any) => {
    // 1. If SOS drawing mode is active, do not interfere with drawing
    if ((emergencyPanel as any)?.isDrawingActive?.()) {
      return;
    }

    // 2. Feature 5: Map picking for Start / Destination
    if (mapPickMode) {
      let selectedTarget: any = event.spaces?.[0];
      if (!selectedTarget && event.coordinate) {
        const curFloorId = mapView.currentFloor?.id;
        const flSpaces = mapData.getByType("space").filter((s: any) => (s.floor?.id || s.floor) === curFloorId);
        let nearestDist = Infinity;
        for (const s of flSpaces) {
          if (s.center) {
            const d = haversineDistance(event.coordinate.latitude, event.coordinate.longitude, s.center.latitude, s.center.longitude);
            if (d < nearestDist) {
              nearestDist = d;
              selectedTarget = s;
            }
          }
        }
      }

      if (selectedTarget) {
        const targetId = selectedTarget.id;
        const targetName = selectedTarget.name || targetId;
        const targetFloorId =
          typeof selectedTarget.floor === "string"
            ? selectedTarget.floor
            : selectedTarget.floor?.id;
        const bInfo = getBuildingInfo(targetFloorId, floorToBuilding);
        const targetBuildingId = bInfo?.buildingId || currentNavBuildingId;

        if (mapPickMode === "start") {
          switchStartBuilding(targetBuildingId, true);
          if (targetFloorId) {
            currentStartFloorId = targetFloorId;
            const startFSel = (document.getElementById("startFloorSelector") ||
              document.getElementById("navFloorSelector")) as HTMLSelectElement;
            if (startFSel) startFSel.value = targetFloorId;
            const badge = document.getElementById("startFloorBadge");
            if (badge) {
              const fl = mapData.getById("floor", targetFloorId);
              badge.textContent = fl?.name || "Level 1";
            }
            if (startTomSelect) (startTomSelect as any).updateForBuilding(targetBuildingId, targetFloorId);
          }
          startSpaceSelector.value = targetId;
          if (startTomSelect && typeof startTomSelect.addOption === "function") {
            startTomSelect.addOption({ value: targetId, text: targetName });
            startTomSelect.setValue(targetId);
          }
          onStartSpaceChange({ target: { value: targetId } });
          setMapPickMode(null);
          showInstructionBanner(`📍 Start selected: ${targetName}`);
          setTimeout(() => hideInstructionBanner(), 3000);
        } else if (mapPickMode === "dest") {
          switchDestBuilding(targetBuildingId, true);
          if (targetFloorId) {
            currentDestFloorId = targetFloorId;
            const destFSel = document.getElementById("destFloorSelector") as HTMLSelectElement;
            if (destFSel) destFSel.value = targetFloorId;
            const badge = document.getElementById("destFloorBadge");
            if (badge) {
              const fl = mapData.getById("floor", targetFloorId);
              badge.textContent = fl?.name || "Level 1";
            }
            if (endTomSelect) (endTomSelect as any).updateForBuilding(targetBuildingId, targetFloorId);
          }
          endSpaceSelector.value = targetId;
          if (endTomSelect && typeof endTomSelect.addOption === "function") {
            endTomSelect.addOption({ value: targetId, text: targetName });
            endTomSelect.setValue(targetId);
          }
          onEndSpaceChange({ target: { value: targetId } });
          setMapPickMode(null);
          showInstructionBanner(`🎯 Destination selected: ${targetName}`);
          setTimeout(() => hideInstructionBanner(), 3000);
        }
        return; // Selection completed; do NOT auto-generate route
      }
    }

    deleteSpaceMarker();
    console.log(
      "Clicked here:",
      event.coordinate.latitude,
      event.coordinate.longitude
    );

    if (event.spaces[0]) {
      setSpaceMarker = mapView.Markers.add(
        event.spaces[0],
        `<div style="background: white; padding: 0.3rem;">
          <span>${event.spaces[0].name}</span><br />`
      );
    }
  };

  (window as any).dispatchMapClick = handleMainMapClick;
  mapView.on("click", handleMainMapClick);

  mapView.on("floor-change", (event) => {
    const id = event?.floor.id;
    if (!id) return;

    console.log("CURRENT FLOOR ID:", id);
    setSelectedFloor(id);
    const navFloorSelect = document.getElementById(
      "navFloorSelector"
    ) as HTMLSelectElement;
    if (navFloorSelect && navFloorSelect.value !== id) {
      navFloorSelect.value = id;
    }
    emergencyPanel?.renderMapMarkers?.();
  });

  // ------------------ RECENTER SUPPORT ------------------
  isProgrammaticCameraMove = false;

  mapView.on("camera-change", () => {
    if (isProgrammaticCameraMove) return;
    if (followingBlueDot) {
      followingBlueDot = false;
      updateRecenterButtonState();
    }
  });

  recenterButton = document.getElementById(
    "recenterButton"
  ) as HTMLButtonElement | null;

  if (!recenterButton) {
    recenterButton = document.createElement("button");
    recenterButton.id = "recenterButton";
    recenterButton.textContent = "🎯";
    recenterButton.title = "Recenter on blue dot";
    recenterButton.style.position = "fixed";
    recenterButton.style.bottom = "24px";
    recenterButton.style.right = "16px";
    recenterButton.style.width = "44px";
    recenterButton.style.height = "44px";
    recenterButton.style.borderRadius = "50%";
    recenterButton.style.border = "none";
    recenterButton.style.background = "rgba(20,20,20,0.85)";
    recenterButton.style.color = "#fff";
    recenterButton.style.fontSize = "20px";
    recenterButton.style.display = "flex";
    recenterButton.style.alignItems = "center";
    recenterButton.style.justifyContent = "center";
    recenterButton.style.cursor = "pointer";
    recenterButton.style.boxShadow = "0 2px 8px rgba(0,0,0,0.35)";
    recenterButton.style.zIndex = "9997";
    document.body.appendChild(recenterButton);
  }

  function updateRecenterButtonState() {
    if (!recenterButton) return;
    recenterButton.classList.toggle("following", followingBlueDot);
    recenterButton.classList.toggle("not-following", !followingBlueDot);
    recenterButton.style.opacity = followingBlueDot ? "1" : "0.5";
  }

  recenterButton?.addEventListener("click", () => {
    const pos = getCurrentPosition();
    console.log(
      "🎯 RECENTER CLICK:",
      pos,
      "currentFloor:",
      mapView.currentFloor.id
    );
    if (!pos || pos.latitude == null || pos.longitude == null) return;

    if (pos.floorOrFloorId && mapView.currentFloor.id !== pos.floorOrFloorId) {
      mapView.setFloor(pos.floorOrFloorId);
    }

    const moveToken = ++programmaticMoveToken; // ✅ FIX: token guard
    isProgrammaticCameraMove = true;
    const focusCoordinate = mapView.createCoordinate(
      pos.latitude,
      pos.longitude,
      pos.floorOrFloorId
    );
    const recenterTargetBearing = getShortestBearing(
      animatedBearing,
      lastComputedBearing
    );
    animatedBearing = recenterTargetBearing;
    const recenterTarget = {
      center: focusCoordinate,
      bearing: recenterTargetBearing,
      pitch: cameraMode === "walk" ? WALK_CAMERA_PITCH_DEGREES : 0,
      zoomLevel: 30,
    };
    mapView.Camera.animateTo(recenterTarget, {
      duration: 600,
      easing: "ease-in-out",
    });
    setTimeout(() => {
      if (moveToken === programmaticMoveToken) {
        // ✅ FIX: only clear if no newer move has been scheduled since
        isProgrammaticCameraMove = false;
      }
    }, 700);

    followingBlueDot = true;
    updateRecenterButtonState();
  });

  updateRecenterButtonState();

  // ------------------ MUTE / UNMUTE TOGGLE ------------------
  // ✅ NEW: sits next to the instruction banner (top-right, same row) so
  // it's obviously tied to voice nav rather than looking like a generic
  // map control down with Recenter/view-mode.
  muteButton = document.getElementById(
    "muteButton"
  ) as HTMLButtonElement | null;

  if (!muteButton) {
    muteButton = document.createElement("button");
    muteButton.id = "muteButton";
    muteButton.style.position = "fixed";
    muteButton.style.top = "16px";
    muteButton.style.right = "16px";
    muteButton.style.width = "40px";
    muteButton.style.height = "40px";
    muteButton.style.borderRadius = "50%";
    muteButton.style.border = "none";
    muteButton.style.background = "rgba(20,20,20,0.85)";
    muteButton.style.color = "#fff";
    muteButton.style.fontSize = "18px";
    muteButton.style.display = "flex";
    muteButton.style.alignItems = "center";
    muteButton.style.justifyContent = "center";
    muteButton.style.cursor = "pointer";
    muteButton.style.boxShadow = "0 2px 8px rgba(0,0,0,0.35)";
    muteButton.style.zIndex = "9999"; // above the banner so it never gets covered
    document.body.appendChild(muteButton);
  }

  function updateMuteButtonLabel() {
    if (!muteButton) return;
    muteButton.textContent = voiceMuted ? "🔇" : "🔊";
    muteButton.title = voiceMuted ? "Unmute voice" : "Mute voice";
  }

  muteButton.addEventListener("click", () => {
    voiceMuted = !voiceMuted;
    updateMuteButtonLabel();
    if (voiceMuted) {
      // Stop anything currently being read out immediately on mute —
      // otherwise the in-flight utterance keeps playing to the end.
      speechSynthesis.cancel();
    }
  });

  updateMuteButtonLabel();

  // ------------------ WALK-VIEW TOGGLE ------------------
  viewModeButton = document.getElementById(
    "viewModeButton"
  ) as HTMLButtonElement | null;

  if (!viewModeButton) {
    viewModeButton = document.createElement("button");
    viewModeButton.id = "viewModeButton";
    viewModeButton.style.position = "fixed";
    viewModeButton.style.bottom = "76px";
    viewModeButton.style.right = "16px";
    viewModeButton.style.width = "44px";
    viewModeButton.style.height = "44px";
    viewModeButton.style.borderRadius = "50%";
    viewModeButton.style.border = "none";
    viewModeButton.style.background = "rgba(20,20,20,0.85)";
    viewModeButton.style.color = "#fff";
    viewModeButton.style.fontSize = "20px";
    viewModeButton.style.display = "flex";
    viewModeButton.style.alignItems = "center";
    viewModeButton.style.justifyContent = "center";
    viewModeButton.style.cursor = "pointer";
    viewModeButton.style.boxShadow = "0 2px 8px rgba(0,0,0,0.35)";
    viewModeButton.style.zIndex = "9997";
    document.body.appendChild(viewModeButton);
  }

  function updateViewModeButtonLabel() {
    if (!viewModeButton) return;
    viewModeButton.textContent = cameraMode === "map" ? "🚶" : "🗺️";
    viewModeButton.title =
      cameraMode === "map" ? "Switch to walk view" : "Switch to map view";
  }

  viewModeButton.addEventListener("click", () => {
    cameraMode = cameraMode === "map" ? "walk" : "map";
    updateViewModeButtonLabel();

    const pos = getCurrentPosition();
    if (pos && pos.latitude != null && pos.longitude != null) {
      const moveToken = ++programmaticMoveToken; // ✅ FIX: token guard
      isProgrammaticCameraMove = true;
      const focusCoordinate = mapView.createCoordinate(
        pos.latitude,
        pos.longitude,
        pos.floorOrFloorId
      );
      const toggleTargetBearing = getShortestBearing(
        animatedBearing,
        lastComputedBearing
      );
      animatedBearing = toggleTargetBearing;
      const targetCamera = {
        center: focusCoordinate,
        bearing: toggleTargetBearing,
        pitch: cameraMode === "walk" ? WALK_CAMERA_PITCH_DEGREES : 0,
        zoomLevel: 30,
      };
      mapView.Camera.animateTo(targetCamera, {
        duration: 700,
        easing: "ease-in-out",
      });
      setTimeout(() => {
        if (moveToken === programmaticMoveToken) {
          isProgrammaticCameraMove = false;
        }
      }, 800);
    }
  });

  updateViewModeButtonLabel();

  // ------------------ STAIRS / FLOOR-TRANSITION HANDLER ------------------
  let countdownInterval: any = null;
  let autoResumeTimeout: any = null;
  let isStairsDelay = false;

  function getFloorNumber(floorId: string) {
    return floorMap[floorId] ?? 0;
  }

  function getStairsDelay(fromFloorId: string, toFloorId: string) {
    const diff = Math.abs(
      getFloorNumber(toFloorId) - getFloorNumber(fromFloorId)
    );
    return diff * 20000;
  }

  function showToast(msg: string, onArrived?: () => void) {
    let toast = document.getElementById("nav-toast") as HTMLDivElement;
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "nav-toast";
      toast.style.position = "fixed";
      toast.style.left = "50%";
      toast.style.transform = "translateX(-50%)";
      toast.style.padding = "10px 18px";
      toast.style.background = "rgba(20, 20, 20, 0.92)";
      toast.style.backdropFilter = "blur(6px)";
      (toast.style as any).webkitBackdropFilter = "blur(6px)";
      toast.style.color = "#fff";
      toast.style.fontSize = "14px";
      toast.style.fontWeight = "500";
      toast.style.lineHeight = "1.35";
      toast.style.borderRadius = "10px";
      toast.style.zIndex = "9999";
      toast.style.textAlign = "center";
      toast.style.boxShadow = "0 4px 20px rgba(0,0,0,0.35)";
      toast.style.maxWidth = "min(92vw, 540px)";
      toast.style.width = "max-content";
      toast.style.boxSizing = "border-box";
      toast.style.wordBreak = "break-word";
      toast.style.whiteSpace = "normal";
      toast.style.transition = "bottom 0.25s ease, opacity 0.2s ease";
      document.body.appendChild(toast);
    }

    // Purely informational toasts must NOT intercept clicks to underlying controls
    if (onArrived) {
      toast.style.pointerEvents = "auto";
    } else {
      toast.style.pointerEvents = "none";
    }

    toast.innerHTML = "";

    const msgEl = document.createElement("div");
    msgEl.id = "nav-toast-msg";
    msgEl.textContent = msg;
    msgEl.style.pointerEvents = "none";
    toast.appendChild(msgEl);

    if (onArrived) {
      const btn = document.createElement("button");
      btn.id = "nav-toast-arrived-btn";
      btn.textContent = "I've arrived";
      btn.style.marginTop = "8px";
      btn.style.display = "block";
      btn.style.marginLeft = "auto";
      btn.style.marginRight = "auto";
      btn.style.padding = "6px 14px";
      btn.style.borderRadius = "6px";
      btn.style.border = "none";
      btn.style.background = "#4CD0A4";
      btn.style.color = "#000";
      btn.style.fontWeight = "600";
      btn.style.cursor = "pointer";
      btn.style.pointerEvents = "auto";
      btn.onclick = onArrived;
      toast.appendChild(btn);
    }

    updateToastPosition();
    toast.style.display = "block";
    requestAnimationFrame(updateToastPosition);
  }

  function updateToast(msg: string) {
    const msgEl = document.getElementById("nav-toast-msg");
    if (msgEl) msgEl.textContent = msg;
    updateToastPosition();
  }

  function hideToast() {
    clearInterval(countdownInterval);
    if (autoResumeTimeout) clearTimeout(autoResumeTimeout);
    let toast = document.getElementById("nav-toast");
    if (toast) toast.style.display = "none";
  }

  function beginFloorTransition(pendingPosition: TBlueDotPositionUpdate) {
    const fromFloorId = mapView.currentFloor.id;
    const toFloorId = pendingPosition.floorOrFloorId!;
    const delayMs = getStairsDelay(fromFloorId, toFloorId);
    const targetFloor = getFloorNumber(toFloorId);

    fakePositionUpdater.pause();
    speechSynthesis.cancel();
    isStairsDelay = true;

    lastDistanceToFrontInstruction = null;

    lastAppliedPosition = null;

    let remaining = delayMs / 1000;
    let resolved = false;

    const finishTransition = () => {
      if (resolved) return;
      resolved = true;

      hideToast();
      isStairsDelay = false;

      applyPositionUpdate(pendingPosition);

      fakePositionUpdater.resume?.();
      console.log("▶️ Navigation resumed on floor:", toFloorId);

      if (activeInstructions.length > 0) {
        const nextInstr = activeInstructions[0].instruction;
        const nextId = activeInstructions[0].id;
        if (!spokenSteps.has(nextId)) {
          const floorMsg = `Now continue on floor ${targetFloor}`;
          speakInstruction(floorMsg);
          speakInstruction(nextInstr);

          spokenSteps.add(nextId);
          console.log("📢 Resumed with:", nextInstr);
        }

        const remainingMetersAfterStairs = positions
          ? computeRemainingDistanceMeters(
              positions,
              fakePositionUpdater.getLastEmittedIndex()
            )
          : 0;
        showInstructionBanner(
          `Floor ${targetFloor}: ${nextInstr}`,
          activeInstructions[1]?.instruction,
          formatEtaText(remainingMetersAfterStairs)
        );
      } else {
        hideInstructionBanner();
      }
    };

    showToast(
      `🚶 Please climb/take the elevator to floor ${targetFloor}. Resuming in ${remaining}s...`,
      finishTransition
    );

    countdownInterval = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        updateToast(
          `🚶 Please climb/take the elevator to floor ${targetFloor}. Resuming in ${remaining}s...`
        );
      }
    }, 1000);

    autoResumeTimeout = setTimeout(finishTransition, delayMs);
  }

  function applyPositionUpdate(position: TBlueDotPositionUpdate) {
    mapView.BlueDot?.update?.(position);

    if (mapView.currentFloor.id !== position.floorOrFloorId) {
      mapView.setFloor(position.floorOrFloorId!);
    }

    if (position.latitude && position.longitude) {
      if (lastAppliedPosition) {
        const movedDist = haversineDistance(
          lastAppliedPosition.latitude,
          lastAppliedPosition.longitude,
          position.latitude,
          position.longitude
        );
        if (movedDist >= MIN_BEARING_MOVE_METERS) {
          lastComputedBearing = calculateBearing(
            lastAppliedPosition.latitude,
            lastAppliedPosition.longitude,
            position.latitude,
            position.longitude
          );
        }
      }
      lastAppliedPosition = {
        latitude: position.latitude,
        longitude: position.longitude,
      };
    }

    if (followingBlueDot && position.latitude && position.longitude) {
      const focusCoordinate = mapView.createCoordinate(
        position.latitude,
        position.longitude
      );
      const moveToken = ++programmaticMoveToken; // ✅ FIX: token guard
      isProgrammaticCameraMove = true;
      const followTargetBearing = getShortestBearing(
        animatedBearing,
        lastComputedBearing
      );
      animatedBearing = followTargetBearing;
      const targetCamera = {
        center: focusCoordinate,
        bearing: followTargetBearing,
        pitch: cameraMode === "walk" ? WALK_CAMERA_PITCH_DEGREES : 0,
        zoomLevel: 30,
      };
      const followDuration = Math.max(
        200,
        Math.min(900, currentTickSpeedMs - 100)
      );
      mapView.Camera.animateTo(targetCamera, {
        duration: followDuration,
        easing: "ease-in-out",
      });
      setTimeout(() => {
        if (moveToken === programmaticMoveToken) {
          // ✅ FIX: this is the core bug fix — an EARLIER tick's timeout
          // used to be able to fire after a LATER tick had already started
          // a new animateTo, incorrectly clearing the flag mid-animation
          // and causing the camera-change listener to think the user had
          // dragged the map, silently killing auto-follow. Now only the
          // most recently scheduled reset is allowed to actually clear it.
          isProgrammaticCameraMove = false;
        }
      }, followDuration + 100);
    }

    const blueDotPositionElement = document.getElementById("bluedotupdate")!;
    blueDotPositionElement.textContent = JSON.stringify(position, null, 2);

    // ------------------ BUILDING-CROSSING CHECKPOINT ------------------
    if (
      buildingCrossings.length > 0 &&
      nextCrossingPointer < buildingCrossings.length &&
      !isStairsDelay
    ) {
      const crossing = buildingCrossings[nextCrossingPointer];
      const lastIdx = fakePositionUpdater.getLastEmittedIndex();

      if (lastIdx >= crossing.index) {
        hideToast();
        crossingToastShownFor.delete(nextCrossingPointer);
        nextCrossingPointer++;
      } else if (!crossingToastShownFor.has(nextCrossingPointer)) {
        crossingToastShownFor.add(nextCrossingPointer);
        showToast(
          `🚶 Walking to ${crossing.buildingName}. Tap once you're inside.`,
          () => onArrivedAtBuilding(nextCrossingPointer)
        );
      }
    }

    if (
      position.latitude &&
      position.longitude &&
      activeInstructions.length > 0 &&
      !isStairsDelay
    ) {
      const { coord, instruction, id } = activeInstructions[0];

      const onCorrectFloor =
        !coord.floorId || coord.floorId === mapView.currentFloor.id;

      if (onCorrectFloor) {
        const dist = haversineDistance(
          position.latitude,
          position.longitude,
          coord.latitude,
          coord.longitude
        );

        console.log("🔍 Next in queue:", instruction, "distance:", dist, "m");

        const PASS_RADIUS = 10;
        const reachedTightly = dist < 3;
        const passedThePoint =
          lastDistanceToFrontInstruction !== null &&
          lastDistanceToFrontInstruction < PASS_RADIUS &&
          dist > lastDistanceToFrontInstruction;

        if (reachedTightly || passedThePoint) {
          if (!spokenSteps.has(id)) {
            speakInstruction(instruction);
            spokenSteps.add(id);
            console.log("📢 Speaking:", instruction);

            const remainingMeters = positions
              ? computeRemainingDistanceMeters(
                  positions,
                  fakePositionUpdater.getLastEmittedIndex()
                )
              : 0;
            showInstructionBanner(
              instruction,
              activeInstructions[1]?.instruction,
              formatEtaText(remainingMeters)
            );
          }

          activeInstructions.shift();
          lastDistanceToFrontInstruction = null;
        } else {
          lastDistanceToFrontInstruction = dist;
        }
      }
    }

    if (destinationCoord && position.latitude && position.longitude) {
      const onDestinationFloor =
        !destinationCoord.floorId ||
        destinationCoord.floorId === mapView.currentFloor.id;

      if (onDestinationFloor) {
        const distToDest = haversineDistance(
          position.latitude,
          position.longitude,
          destinationCoord.latitude,
          destinationCoord.longitude
        );

        if (distToDest < 3) {
          if (!spokenSteps.has("destination")) {
            speakInstruction("You have reached your destination");

            spokenSteps.add("destination");
            console.log("🎯 Reached destination!");

            showInstructionBanner("🎯 You have reached your destination");
            setTimeout(hideInstructionBanner, 6000);

            fakePositionUpdater.stop();
            mapView.BlueDot?.disable?.();
            blueDotEnabled = false;
          }
        }
      }
    }
  }

  const AVERAGE_WALK_SPEED_MPS = 1.2;

  function computeRemainingDistanceMeters(
    positionsRef: TBlueDotPositionUpdate[],
    fromIndex: number
  ): number {
    let total = 0;
    for (let i = fromIndex; i < positionsRef.length - 1; i++) {
      const a = positionsRef[i];
      const b = positionsRef[i + 1];
      if (a.latitude == null || a.longitude == null) continue;
      if (b.latitude == null || b.longitude == null) continue;
      total += haversineDistance(
        a.latitude,
        a.longitude,
        b.latitude,
        b.longitude
      );
    }
    return total;
  }

  function formatEtaText(remainingMeters: number): string {
    const etaSeconds = remainingMeters / AVERAGE_WALK_SPEED_MPS;
    const distText =
      remainingMeters >= 1000
        ? `${(remainingMeters / 1000).toFixed(1)}km`
        : `${Math.round(remainingMeters)}m`;

    if (etaSeconds < 60) {
      const secs = Math.max(5, Math.round(etaSeconds / 5) * 5);
      return `${secs} sec · ${distText} remaining`;
    }

    const etaMinutes = Math.round(etaSeconds / 60);
    return `${etaMinutes} min · ${distText} remaining`;
  }

  function onArrivedAtBuilding(crossingIdx: number) {
    const crossing = buildingCrossings[crossingIdx];
    if (!crossing) return;

    hideToast();
    crossingToastShownFor.delete(crossingIdx);
    if (crossingIdx >= nextCrossingPointer) {
      nextCrossingPointer = crossingIdx + 1;
    }

    while (
      activeInstructions.length > 0 &&
      activeInstructions[0].posIndex >= 0 &&
      activeInstructions[0].posIndex <= crossing.index
    ) {
      console.log(
        "⏭️ Skipping stale instruction behind jump target:",
        activeInstructions[0].instruction
      );
      activeInstructions.shift();
    }
    lastDistanceToFrontInstruction = null;

    lastAppliedPosition = null;

    fakePositionUpdater.jumpToIndex(crossing.index, applyPositionUpdate);
    console.log(
      "🏢 Manually confirmed arrival at:",
      crossing.buildingName,
      "→ jumped to position index",
      crossing.index
    );

    if (activeInstructions.length > 0) {
      const remainingMetersAfterJump = positions
        ? computeRemainingDistanceMeters(
            positions,
            fakePositionUpdater.getLastEmittedIndex()
          )
        : 0;
      showInstructionBanner(
        activeInstructions[0].instruction,
        activeInstructions[1]?.instruction,
        formatEtaText(remainingMetersAfterJump)
      );
    } else {
      hideInstructionBanner();
    }
  }

  function onFakePositionReceived(position: TBlueDotPositionUpdate) {
    if (
      position.floorOrFloorId &&
      mapView.currentFloor.id !== position.floorOrFloorId
    ) {
      const fromBuilding = getBuildingInfo(
        mapView.currentFloor.id,
        floorToBuilding
      );
      const toBuilding = getBuildingInfo(
        position.floorOrFloorId,
        floorToBuilding
      );

      const isCrossBuilding =
        fromBuilding &&
        toBuilding &&
        fromBuilding.buildingId !== toBuilding.buildingId;

      if (!isCrossBuilding) {
        beginFloorTransition(position);
        return;
      }
    }
    applyPositionUpdate(position);
  }
}

// Load initial venue exactly once
resolveMapDataOptions()
  .then((options) => {
    init(options);
  })
  .catch((err) => {
    console.error("Initial map authentication error:", err);
    showAuthErrorToast(err?.message || "Failed to authenticate map venue.");
  });

// Load a new venue
loadMapButton.onclick = async () => {
  try {
    const options = await resolveMapDataOptions();
    await init(options);
  } catch (err: any) {
    console.error("Failed to load map:", err);
    showAuthErrorToast(err?.message || "Failed to load map.");
  }
};
