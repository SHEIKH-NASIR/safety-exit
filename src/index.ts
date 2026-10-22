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

import "@mappedin/mappedin-js/lib/index.css";
const modelMap: Record<string, string> = {
  truck,
  tree_pine,
  // add more models here as needed
};

import { generatePositionUpdates } from "./generator";
import { populateSpaceSelector } from "./spaceSelector";
import { populateFloorSelector } from "./floorSelector";
import { setSelectedFloor } from "./floorSelector";
import { saveTemplateAsFile } from "./fileDownloader";
import { DynamicPositionUpdater, getCurrentPosition } from "./positionUpdater";
import { emergencyPanel } from "./emergency/emergencyPanel";
import { exitRegistry } from "./emergency/exitRegistry";
import { hazardStore } from "./emergency/hazardStore";
import { incidentService } from "./emergency/incidentService";
const professors: Record<string, string> = {
  "Dr. Smith": "Office 101",
  "Prof. John": "Office 202",
  "Dr. Lee": "Office 303",
};

const floorMap: Record<string, number> = {
  m_f7ad6268bf946916: 0, // Ground floor
  m_0cabb66d2b13d0d3: 1, // First floor
};

// See Trial API key Terms and Conditions
// https://developer.mappedin.com/docs/demo-keys-and-maps
const DEMO_KEY = "mik_LunzGF0BwzLu5wKnO569c07af";
const DEMO_SECRET = "mis_Tu9IawAmFN1TK6h4HekLxdhpwCflxEx8WGTNfHa80FQ8b8a100f";

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

/**
 * Get UI elements
 */

const mapIdInput = document.getElementById("mapId")! as HTMLInputElement;
const clientIdInput = document.getElementById("key")! as HTMLInputElement;
const clientSecretInput = document.getElementById(
  "secret"
)! as HTMLInputElement;
const environmentSelect = document.getElementById(
  "environment"
)! as HTMLSelectElement;

const loadMapButton = document.getElementById("loadMap")! as HTMLButtonElement;

const startSpaceSelector = document.getElementById(
  "startSpace"
)! as HTMLSelectElement;

const endSpaceSelector = document.getElementById(
  "endSpace"
)! as HTMLSelectElement;

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

const getMapDataOptionsWithFallbacks = (): TGetMapDataOptions => {
  const options: TGetMapDataOptions = {
    mapId: mapIdInput.value,
    key: clientIdInput.value === "" ? DEMO_KEY : clientIdInput.value,
    secret:
      clientSecretInput.value === "" ? DEMO_SECRET : clientSecretInput.value,
    environment: environmentSelect.value as "us" | "eu",
  };
  return options;
};

let previousColouredStart: Space | undefined;
function onStartSpaceChange(event: any) {
  if (previousColouredStart) {
    mapView.updateState(previousColouredStart, {
      color: "initial",
    });
  }

  const spaceToColor = mapData
    .getByType("space")
    .find((s) => s.id === event.target.value);
  if (spaceToColor) {
    mapView.updateState(spaceToColor, {
      color: startLocationColor.value,
    });
    previousColouredStart = spaceToColor;
  }
}
startSpaceSelector.onchange = onStartSpaceChange;

let previousColouredEnd: Space | undefined;
function onEndSpaceChange(event: any) {
  if (previousColouredEnd) {
    mapView.updateState(previousColouredEnd, {
      color: "initial",
    });
  }

  const spaceToColor = mapData
    .getByType("space")
    .find((s) => s.id === event.target.value);
  if (spaceToColor) {
    mapView.updateState(spaceToColor, {
      color: destinationLocationColor.value,
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

  mapView.Markers.removeAll();

  positions = undefined;
  fakePositionUpdater.reset();
  mapView.BlueDot.disable();
  blueDotEnabled = false;

  followingBlueDot = true;

  // Restore verified entrance and exit markers
  if (emergencyPanel) {
    emergencyPanel.renderMapMarkers();
  }

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
    } else if (instr.action?.type === "TakeVortex") {
      announcements.push({
        id: nextId(),
        coordinate: instr.coordinate,
        text: "Take the stairs or elevator",
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
        } else if (nextType === "TakeVortex") {
          leadText = landmark
            ? `Continue straight until you see ${landmark}`
            : "Continue straight ahead";
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
  const response = await fetch("/global-models.json");
  const data = await response.json();

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
  });
}
function setupCategoryDropdown(
  categorySelect: HTMLSelectElement,
  spaceSelect: HTMLSelectElement,
  spaces: Space[]
): any {
  const verifiedEntrances = exitRegistry
    .getVerifiedEntrances()
    .map((e) => spaces.find((s) => s.id === e.spaceId))
    .filter((s): s is Space => !!s);

  const verifiedExits = exitRegistry
    .getVerifiedEmergencyExits()
    .map((e) => spaces.find((s) => s.id === e.spaceId))
    .filter((s): s is Space => !!s);

  const entranceExitSpaceIds = new Set(
    exitRegistry.getAll().map((e) => e.spaceId)
  );

  const categories: Record<string, Space[]> = {
    "Building Entrances": verifiedEntrances,
    "Emergency Exits": verifiedExits,
    Classrooms: spaces.filter((s) => s.name && s.name.startsWith("Classroom")),
    Offices: spaces.filter((s) => s.name && s.name.startsWith("Office")),
    Labs: spaces.filter((s) => s.name && s.name.toLowerCase().includes("lab")),
    Canteens: spaces.filter((s) => s.name && s.name.toLowerCase().includes("canteen")),
    Washrooms: spaces.filter(
      (s) =>
        s.name &&
        (s.name.toLowerCase().includes("washroom") ||
          s.name.toLowerCase().includes("toilet"))
    ),
    Professors: spaces.filter((s) =>
      s.name && Object.values(professors).includes(s.name)
    ),
    Other: spaces.filter(
      (s) =>
        s.name &&
        !entranceExitSpaceIds.has(s.id) &&
        !s.name.startsWith("Classroom") &&
        !s.name.startsWith("Office") &&
        !s.name.toLowerCase().includes("lab") &&
        !s.name.toLowerCase().includes("canteen") &&
        !s.name.toLowerCase().includes("washroom") &&
        !Object.values(professors).includes(s.name)
    ),
  };

  categorySelect.innerHTML = "";
  Object.keys(categories).forEach((cat) => {
    if (categories[cat].length > 0) {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      categorySelect.appendChild(option);
    }
  });

  const ts = new TomSelect(spaceSelect, {
    create: false,
    searchField: "text",
    placeholder: "Choose a space...",
    sortField: { field: "text", direction: "asc" },
  });

  categorySelect.onchange = () => {
    const selectedCategory = categorySelect.value;
    ts.clearOptions();

    if (selectedCategory === "Emergency Exits") {
      ts.addOption({ value: "", text: "Choose an emergency exit..." });
      ts.setValue("");
      exitRegistry.getVerifiedEmergencyExits().forEach((exit) => {
        ts.addOption({
          value: exit.spaceId,
          text: `🚨 ${exit.name} [${exit.buildingName} - ${exit.floorName}]`,
        });
      });
      ts.refreshOptions(false);
      return;
    }

    if (selectedCategory === "Building Entrances") {
      ts.addOption({ value: "", text: "Choose a building entrance..." });
      ts.setValue("");
      exitRegistry.getVerifiedEntrances().forEach((entrance) => {
        ts.addOption({
          value: entrance.spaceId,
          text: `🚪 ${entrance.name} [${entrance.buildingName} - ${entrance.floorName}]`,
        });
      });
      ts.refreshOptions(false);
      return;
    }

    if (selectedCategory === "Professors") {
      ts.addOption({ value: "", text: "Choose a professor..." });
      ts.setValue("");

      Object.entries(professors).forEach(([profName, officeName]) => {
        const space = spaces.find((s) => s.name === officeName);
        if (space) {
          ts.addOption({ value: space.id, text: profName });
        }
      });
      ts.refreshOptions(false);
      return;
    }

    const filteredSpaces = categories[selectedCategory] || [];
    ts.addOption({ value: "", text: "Choose a space..." });
    ts.setValue("");

    filteredSpaces.forEach((s) => {
      ts.addOption({ value: s.id, text: s.name });
    });
    ts.refreshOptions(false);
  };

  if (categorySelect.options.length > 0) {
    categorySelect.selectedIndex = 0;
    categorySelect.dispatchEvent(new Event("change"));
  }

  // ✅ NEW: returned so callers (quick-access chips) can jump straight to
  // a specific space without the user manually picking a category first.
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

// ✅ NEW: route-summary overlay, shown after Generate computes a route but
// BEFORE any simulated movement starts. Sits on its own layer above
// everything else (zIndex 10000) since it's meant to fully block
// interaction until the user taps Start or Cancel.
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
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.55)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "10000";
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = "";

  const card = document.createElement("div");
  card.style.background = "#fff";
  card.style.borderRadius = "14px";
  card.style.padding = "24px 28px";
  card.style.minWidth = "260px";
  card.style.maxWidth = "90%";
  card.style.textAlign = "center";
  card.style.boxShadow = "0 8px 30px rgba(0,0,0,0.3)";
  card.style.fontFamily = "inherit";

  const title = document.createElement("div");
  title.textContent = "Route ready";
  title.style.fontSize = "18px";
  title.style.fontWeight = "700";
  title.style.marginBottom = "10px";
  card.appendChild(title);

  const summaryLine = document.createElement("div");
  const floorWord = stats.floors > 1 ? "floors" : "floor";
  const turnWord = stats.turns === 1 ? "turn" : "turns";
  summaryLine.textContent = `${stats.turns} ${turnWord} · ${stats.floors} ${floorWord} · ${stats.etaText}`;
  summaryLine.style.fontSize = "14px";
  summaryLine.style.color = "#444";
  summaryLine.style.marginBottom = "20px";
  card.appendChild(summaryLine);

  const buttonRow = document.createElement("div");
  buttonRow.style.display = "flex";
  buttonRow.style.gap = "10px";
  buttonRow.style.justifyContent = "center";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.padding = "10px 20px";
  cancelBtn.style.borderRadius = "8px";
  cancelBtn.style.border = "1px solid #ccc";
  cancelBtn.style.background = "#fff";
  cancelBtn.style.color = "#333";
  cancelBtn.style.fontWeight = "600";
  cancelBtn.style.cursor = "pointer";
  cancelBtn.onclick = () => {
    hideRouteSummary();
    onCancel();
  };
  buttonRow.appendChild(cancelBtn);

  const startBtn = document.createElement("button");
  startBtn.textContent = "Start";
  startBtn.style.padding = "10px 24px";
  startBtn.style.borderRadius = "8px";
  startBtn.style.border = "none";
  startBtn.style.background = "#4CD0A4";
  startBtn.style.color = "#000";
  startBtn.style.fontWeight = "700";
  startBtn.style.cursor = "pointer";
  startBtn.onclick = () => {
    hideRouteSummary();
    onStart();
  };
  buttonRow.appendChild(startBtn);

  card.appendChild(buttonRow);
  overlay.appendChild(card);
  overlay.style.display = "flex";
}

function hideRouteSummary() {
  const overlay = document.getElementById("route-summary-overlay");
  if (overlay) overlay.style.display = "none";
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
  mapData = await getMapData(mapDataOptions);
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

  mapView.BlueDot.enable();
  blueDotEnabled = true;

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

  generateButton.onclick = () => {
    if (!voicePrimed) {
      // Not a turn instruction — no haptic buzz for the priming utterance.
      speakInstruction("Voice navigation enabled", { buzz: false });
      voicePrimed = true;
      console.log("✅ Voice primed");
    }

    followingBlueDot = true;
    updateRecenterButtonState();

    if (mapData == null) return;

    if (!blueDotEnabled) {
      mapView.BlueDot.enable();
      blueDotEnabled = true;
    }

    if (startSpaceSelector.value === endSpaceSelector.value) {
      console.error("Can't generate a path from a location to itself");
      return;
    }

    if (startSpaceSelector.value && endSpaceSelector.value) {
      const jitter = getNumericInputFromElementById("jitter", 0);
      const speed = getNumericInputFromElementById("speed", 1000);
      currentTickSpeedMs = speed;
      const accuracy = getNumericInputFromElementById("accuracy", 5);
      const updateDistance = getNumericInputFromElementById(
        "updateDistance",
        5
      );

      const start = mapData.getById("space", startSpaceSelector.value);
      const end = mapData.getById("space", endSpaceSelector.value);

      if (start && end) {
        const zones = hazardStore.getMappedinZones(mapData);
        const directions =
          zones.length > 0
            ? mapData.getDirections(start, end, { zones })
            : mapData.getDirections(start, end);

        if (!directions) {
          console.warn("⚠️ No route found between start and end!");
          if (zones.length > 0) {
            alert(
              "⚠️ ROUTE BLOCKED BY ACTIVE HAZARDS: All walkable paths between these locations are currently impassable due to reported hazard zones. Please select an alternative route or use CampusResQ 'Find Nearest Safe Exit'."
            );
          } else {
            alert(
              "No walkable path could be found between the selected locations."
            );
          }
          return;
        }

        if (directions) {
          const lastStep =
            directions.instructions[directions.instructions.length - 1];
          if (lastStep) {
            destinationCoord = {
              latitude: lastStep.coordinate.latitude,
              longitude: lastStep.coordinate.longitude,
              floorId: lastStep.coordinate.floorId,
            };
            console.log("🎯 Destination set:", destinationCoord);

            mapView.Markers.add(
              lastStep.coordinate,
              `<div style="font-size: 18px;">🏁 Destination</div>`,
              { rank: 10 }
            );
          }

          const positionDirections = {
            ...directions,
            coordinates: straightenOutdoorPath(
              directions.coordinates,
              floorToBuilding
            ),
          };

          positions = generatePositionUpdates(mapData, positionDirections, {
            maxJitter: jitter,
            accuracy,
            updateDistance: updateDistance,
          });
          console.log("Generated positions:", positions.slice(0, 5));

          // ------------------ AUTO CHASE-CAM ON GENERATE ------------------
          // ✅ NEW: forces walk (chase) mode and snaps the camera in behind
          // the dot's INITIAL heading immediately — no waiting for two live
          // ticks to accumulate a bearing, and no manual view-mode click
          // required. Every subsequent tick's follow-block (in
          // applyPositionUpdate) then keeps it locked in chase mode and
          // rotates it live as the dot turns, since cameraMode simply
          // never reverts to "map" on its own.
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
                mapView.currentFloor.id !== first.floorOrFloorId
              ) {
                mapView.setFloor(first.floorOrFloorId);
              }

              const moveToken = ++programmaticMoveToken;
              isProgrammaticCameraMove = true;
              const startCoordinate = mapView.createCoordinate(
                first.latitude,
                first.longitude,
                first.floorOrFloorId
              );
              mapView.Camera.animateTo(
                {
                  center: startCoordinate,
                  bearing: initialBearing,
                  pitch: WALK_CAMERA_PITCH_DEGREES,
                  zoomLevel: 30,
                },
                { duration: 500, easing: "ease-in-out" }
              );
              setTimeout(() => {
                if (moveToken === programmaticMoveToken) {
                  isProgrammaticCameraMove = false;
                }
              }, 600);
            }

            followingBlueDot = true;
            updateRecenterButtonState();
          }

          // ✅ CHANGED: instruction/building-crossing computation moved
          // OUT of the showPathCheckbox conditional and up here — the
          // route-summary card (below) needs the turn count regardless of
          // whether the user has "show path" ticked, so this now always
          // runs. Drawing the actual path line on the map is still gated
          // by showPathCheckbox, same as before.
          activeInstructions = [];
          spokenSteps.clear();
          lastDistanceToFrontInstruction = null;

          // NOTE: lastAppliedPosition / lastComputedBearing / animatedBearing
          // are deliberately NOT reset here — the auto chase-cam block
          // above just seeded them with the real initial heading, and
          // resetting them back to 0 here would undo that snap.

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
            end?.name
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

          if (showPathCheckbox.checked === true) {
            const pathColor = (
              document.getElementById("pathColor") as HTMLInputElement
            ).value;
            const pathRadius = Number(
              (document.getElementById("pathRadius") as HTMLInputElement).value
            );

            mapView.Navigation.draw(directions, {
              pathOptions: {
                color: pathColor,
                nearRadius: pathRadius,
              },
            });
          }

          // ------------------ ROUTE SUMMARY, THEN START ------------------
          // ✅ NEW: don't start simulated movement yet. Compute the
          // headline stats, show the summary card, and only call
          // fakePositionUpdater.start(...) once the user taps Start —
          // Cancel just discards the generated route instead.
          if (positions) {
            const turnCount = withBuildingCrossings.filter(
              (instr) => instr.action?.type === "Turn"
            ).length;

            // Distinct floors actually walked through, taken from the
            // generated position stream (more reliable than counting
            // TakeVortex instructions, which can be undercounted if a
            // multi-floor stack collapses oddly).
            const floorIds = new Set(
              positions
                .map((p) => p.floorOrFloorId)
                .filter((f): f is string => !!f)
            );
            const floorCount = Math.max(1, floorIds.size);

            const totalDistance = computeRemainingDistanceMeters(positions, 0);
            const etaText = formatEtaText(totalDistance);

            const startNavigation = () => {
              fakePositionUpdater.start(
                positions!,
                speed,
                onFakePositionReceived
              );
            };

            const cancelNavigation = () => {
              // Lightweight cancel: discard the generated route so a
              // stale queue/positions array can't linger into the next
              // Generate click. Doesn't touch BlueDot enable state or
              // markers — those are harmless left as-is until the user
              // either regenerates or hits the full Reset button.
              positions = undefined;
              activeInstructions = [];
              buildingCrossings = [];
              nextCrossingPointer = 0;
              crossingToastShownFor.clear();
              hideInstructionBanner();
            };

            showRouteSummary(
              { turns: turnCount, floors: floorCount, etaText },
              startNavigation,
              cancelNavigation
            );
          }
        }
      }
    }
  };

  populateFloorSelector(
    document.getElementById("floorSelector")! as HTMLSelectElement,
    mapData,
    mapView
  );

  const startTomSelect = setupCategoryDropdown(
    document.getElementById("startCategory") as HTMLSelectElement,
    document.getElementById("startSpace") as HTMLSelectElement,
    mapData.getByType("space")
  );

  const endTomSelect = setupCategoryDropdown(
    document.getElementById("endCategory") as HTMLSelectElement,
    document.getElementById("endSpace") as HTMLSelectElement,
    mapData.getByType("space")
  );

  if (endSpaceSelector.options.length > 1) {
    endSpaceSelector.value = startSpaceSelector.options[1].value;
  }

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

    const startSpace = mapData.getById("space", startId);
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
    generateButton.click();
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

  // ------------------ SOS RESCUE BROADCAST ------------------
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
      if (!startSpaceSelector.value) {
        showToast("Pick where you are (From) first to share your SOS location");
        setTimeout(hideToast, 2500);
        return;
      }
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("meet", startSpaceSelector.value);
      url.searchParams.set("sos", "true");
      const sosUrl = url.toString();

      const victimSpace = mapData.getById("space", startSpaceSelector.value);
      incidentService.createIncident({
        reportedLocation: `${victimSpace?.name || startSpaceSelector.value} (SOS)`,
        locationSpaceId: startSpaceSelector.value,
        incidentType: "sos",
        severity: "critical",
        notes: "Emergency SOS broadcast created by user.",
      });

      try {
        await navigator.clipboard.writeText(sosUrl);
        showToast("🆘 SOS Link copied! Share with responders to direct them to your location.");
        setTimeout(hideToast, 3500);
      } catch {
        window.prompt("Copy this SOS Rescue link:", sosUrl);
      }
    });
  }

  // Load a shared "meet me here" link, if present. This only pre-fills
  // the DESTINATION ("To") — the person opening it still needs to pick
  // their own current location as the start, then hit Generate
  // themselves. Runs once per init() call.
  (function loadSharedMeetLinkFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const meetSpaceId = params.get("meet");
    if (!meetSpaceId) return;

    const meetSpace = mapData.getById("space", meetSpaceId);
    if (!meetSpace) {
      console.warn(
        "⚠️ Shared link references a space that doesn't exist in this venue"
      );
      return;
    }

    if (endTomSelect && typeof endTomSelect.addOption === "function") {
      endTomSelect.addOption({ value: meetSpace.id, text: meetSpace.name });
      endTomSelect.setValue(meetSpace.id);
    }
    endSpaceSelector.value = meetSpaceId;
    onEndSpaceChange({ target: { value: meetSpaceId } });
    updateFavoriteButtonState();

    const isSos = params.get("sos") === "true";
    if (isSos) {
      emergencyPanel.setEmergencyMode(true);
      showToast(
        `🚨 SOS RESCUE ALERT: Victim located at ${meetSpace.name}! Select your current location (From) and tap Generate.`
      );
      setTimeout(hideToast, 6000);
    } else {
      showToast(
        `📍 Destination set to ${meetSpace.name} — pick "From" (where you are) and tap Generate`
      );
      setTimeout(hideToast, 5000);
    }
  })();

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

  updateFavoriteButtonState();
  buildFavoriteChips(mapData.getByType("space"));

  // ------------------ CAMPUSRESQ EMERGENCY INITIALIZATION ------------------
  emergencyPanel.init(mapData, mapView, {
    getCurrentStartSpace: () => {
      if (!startSpaceSelector.value) return undefined;
      return mapData.getById("space", startSpaceSelector.value);
    },
    setDestinationSpace: (spaceId: string) => {
      const space = mapData.getById("space", spaceId);
      const exit = exitRegistry.getBySpaceId(spaceId);
      const displayName = exit ? exit.name : (space ? space.name : spaceId);

      if (endTomSelect && typeof endTomSelect.addOption === "function") {
        endTomSelect.addOption({ value: spaceId, text: displayName });
        endTomSelect.setValue(spaceId);
      }
      endSpaceSelector.value = spaceId;
      onEndSpaceChange({ target: { value: spaceId } });
      updateFavoriteButtonState();
    },
    setStartSpace: (spaceId: string) => {
      const space = mapData.getById("space", spaceId);
      const exit = exitRegistry.getBySpaceId(spaceId);
      const displayName = exit ? exit.name : (space ? space.name : spaceId);

      if (startTomSelect && typeof startTomSelect.addOption === "function") {
        startTomSelect.addOption({ value: spaceId, text: displayName });
        startTomSelect.setValue(spaceId);
      }
      startSpaceSelector.value = spaceId;
      onStartSpaceChange({ target: { value: spaceId } });
    },
    onRouteGenerated: (directions: any, destinationSpace: Space) => {
      generateButton.click();
    },
    onClearNavigation: () => {
      mapView.Navigation.clear();
      positions = undefined;
      fakePositionUpdater.reset();
      mapView.BlueDot.disable();
      blueDotEnabled = false;
      hideInstructionBanner();
    },
  });

  let setSpaceMarker: Marker | undefined;

  const deleteSpaceMarker = () => {
    if (setSpaceMarker) {
      mapView.Markers.remove(setSpaceMarker);
      setSpaceMarker = undefined;
    }
  };
  (window as any).deleteSpaceMarker = deleteSpaceMarker;

  mapView.on("click", async (event) => {
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
  });

  mapView.on("floor-change", (event) => {
    const id = event?.floor.id;
    if (!id) return;

    console.log("CURRENT FLOOR ID:", id);
    setSelectedFloor(id);
  });

  // ------------------ RECENTER SUPPORT ------------------
  let isProgrammaticCameraMove = false;

  mapView.on("camera-change", () => {
    if (isProgrammaticCameraMove) return;
    if (followingBlueDot) {
      followingBlueDot = false;
      updateRecenterButtonState();
    }
  });

  let recenterButton = document.getElementById(
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
  let muteButton = document.getElementById(
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
  let viewModeButton = document.getElementById(
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
      toast.style.bottom = "20px";
      toast.style.left = "50%";
      toast.style.transform = "translateX(-50%)";
      toast.style.padding = "12px 20px";
      toast.style.background = "rgba(0,0,0,0.85)";
      toast.style.color = "#fff";
      toast.style.fontSize = "16px";
      toast.style.borderRadius = "8px";
      toast.style.zIndex = "9999";
      toast.style.textAlign = "center";
      document.body.appendChild(toast);
    }

    toast.innerHTML = "";

    const msgEl = document.createElement("div");
    msgEl.id = "nav-toast-msg";
    msgEl.textContent = msg;
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
      btn.onclick = onArrived;
      toast.appendChild(btn);
    }

    toast.style.display = "block";
  }

  function updateToast(msg: string) {
    const msgEl = document.getElementById("nav-toast-msg");
    if (msgEl) msgEl.textContent = msg;
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
    mapView.BlueDot.update(position);

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
            mapView.BlueDot.disable();
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

// Load initial venue
init(getMapDataOptionsWithFallbacks());

// Load a new venue
loadMapButton.onclick = () => {
  init(getMapDataOptionsWithFallbacks());
};
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.ts")
      .then((reg) => console.log("✅ SW registered:", reg))
      .catch((err) => console.warn("❌ SW registration failed:", err));
  });
}
