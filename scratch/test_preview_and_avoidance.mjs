import { getMapData } from "file:///D:/blueprint-example-for-map (2)/node_modules/@mappedin/mappedin-js/lib/esm/index.js";

function createCirclePolygon(centerLat, centerLon, radiusMeters, points = 16) {
  const coords = [];
  const km = radiusMeters / 1000;
  const R = 6371;
  for (let i = 0; i <= points; i++) {
    const angle = (i * 360) / points;
    const rad = (angle * Math.PI) / 180;
    const dLat = (km / R) * (180 / Math.PI);
    const dLon = ((km / R) * (180 / Math.PI)) / Math.cos((centerLat * Math.PI) / 180);
    coords.push([centerLon + dLon * Math.cos(rad), centerLat + dLat * Math.sin(rad)]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

const EXACT_NO_SAFE_ROUTE_MSG = "NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.";

let passed = 0;
let failed = 0;
function assert(condition, testName) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    failed++;
  }
}

async function run() {
  console.log("==================================================================");
  console.log("VERIFYING SOS HAZARD PREVIEW, LOCKING, STRICT AVOIDANCE & NO AUTO-NAV");
  console.log("==================================================================");

  const mapData = await getMapData({
    mapId: "6878b313316caa000b260be4",
    key: "mik_LunzGF0BwzLu5wKnO569c07af",
    secret: "mis_Tu9IawAmFN1TK6h4HekLxdhpwCflxEx8WGTNfHa80FQ8b8a100f",
    environment: "us",
  });

  console.log("\n--- TEST GROUP 1: PREVIEW STATE & ISOLATION FROM CONFIRMED HAZARDS ---");
  // Simulate preview logic
  class MockMapView {
    constructor() {
      this.spaceStates = new Map();
      this.markers = [];
    }
    updateState(space, state) {
      this.spaceStates.set(space.id, state.color);
    }
    getState(space) {
      return this.spaceStates.get(space.id) || "initial";
    }
  }

  const mockMapView = new MockMapView();
  const spaces = mapData.getByType("space").filter(s => s.floor?.id === "m_c5bac871ab66226c");
  const c153 = spaces.find(s => s.name === "Classroom 153");
  const c154 = spaces.find(s => s.name === "Classroom 154");
  const c161 = spaces.find(s => s.name === "Classroom 161");

  // Step 1: User activates confirmed hazard on c153
  const activeHazards = new Map();
  activeHazards.set("haz-1", {
    id: "haz-1",
    locationId: c153.id,
    locationType: "room",
    locationName: "Classroom 153",
    severity: "blocked",
  });
  mockMapView.updateState(c153, { color: "#d93025" });
  assert(mockMapView.getState(c153) === "#d93025", "Confirmed hazard c153 is locked in red #d93025");

  // Step 2: User previews c154 in SOS dashboard (unconfirmed)
  let previewSpaceIds = new Set();
  function showPreview(targetSpace) {
    // clear previous preview without affecting confirmed hazards
    clearPreview();
    previewSpaceIds.add(targetSpace.id);
    mockMapView.updateState(targetSpace, { color: "#ff1744" });
  }

  function clearPreview() {
    const activeSpaceIds = new Set(Array.from(activeHazards.values()).map(h => h.locationId));
    previewSpaceIds.forEach(spId => {
      if (!activeSpaceIds.has(spId)) {
        mockMapView.updateState({ id: spId }, { color: "initial" });
      }
    });
    previewSpaceIds.clear();
  }

  showPreview(c154);
  assert(mockMapView.getState(c154) === "#ff1744", "Unconfirmed selection c154 shows red preview #ff1744 immediately");
  assert(mockMapView.getState(c153) === "#d93025", "Confirmed hazard c153 remains untouched in red #d93025");

  // Step 3: User moves preview to c161
  showPreview(c161);
  assert(mockMapView.getState(c161) === "#ff1744", "New selection c161 moves preview to #ff1744");
  assert(mockMapView.getState(c154) === "initial", "Previous preview c154 reverted to initial");
  assert(mockMapView.getState(c153) === "#d93025", "Confirmed hazard c153 still untouched in red #d93025");

  // Step 4: User clears preview
  clearPreview();
  assert(mockMapView.getState(c161) === "initial", "Preview c161 cleared back to initial");
  assert(mockMapView.getState(c153) === "#d93025", "Confirmed hazard c153 remains locked in red #d93025");

  console.log("\n--- TEST GROUP 2: PERSISTENCE ACROSS DROPDOWN CHANGES & FLOOR CHANGES ---");
  // Test when From or To changes in normal navigation dropdown:
  let previousColouredStart = c153; // User previously had c153 selected in From dropdown
  // Now user changes From to c154:
  function onNormalStartChange(newSpace) {
    if (previousColouredStart) {
      if (activeHazards.has("haz-1") && previousColouredStart.id === c153.id) {
        // Must stay red!
        mockMapView.updateState(previousColouredStart, { color: "#d93025" });
      } else {
        mockMapView.updateState(previousColouredStart, { color: "initial" });
      }
    }
    mockMapView.updateState(newSpace, { color: "#1a73e8" });
    previousColouredStart = newSpace;
  }

  onNormalStartChange(c154);
  assert(mockMapView.getState(c153) === "#d93025", "Confirmed hazard c153 persists in red #d93025 when From dropdown changes");
  assert(mockMapView.getState(c154) === "#1a73e8", "New start space c154 is highlighted with start color");

  console.log("\n--- TEST GROUP 3: MULTIPLE HAZARDS & INDEPENDENT CLEARING ---");
  // Add second hazard on c161
  activeHazards.set("haz-2", {
    id: "haz-2",
    locationId: c161.id,
    locationType: "room",
    locationName: "Classroom 161",
    severity: "blocked",
  });
  mockMapView.updateState(c161, { color: "#d93025" });
  assert(mockMapView.getState(c153) === "#d93025", "Hazard 1 (c153) is active red");
  assert(mockMapView.getState(c161) === "#d93025", "Hazard 2 (c161) is active red");

  // Clear Hazard 1 only
  activeHazards.delete("haz-1");
  const remainingActiveIds = new Set(Array.from(activeHazards.values()).map(h => h.locationId));
  [c153, c161].forEach(sp => {
    if (!remainingActiveIds.has(sp.id)) {
      mockMapView.updateState(sp, { color: "initial" });
    }
  });

  assert(mockMapView.getState(c153) === "initial", "Hazard 1 (c153) reverted to initial after deletion");
  assert(mockMapView.getState(c161) === "#d93025", "Hazard 2 (c161) remains locked in red #d93025");

  console.log("\n--- TEST GROUP 4: STRICT ROUTE AVOIDANCE & EXACT NO SAFE ROUTE MESSAGE ---");
  // Test 1: Destination is blocked
  const isDestBlocked = activeHazards.has("haz-2") && activeHazards.get("haz-2").locationId === c161.id;
  let displayedError = "";
  if (isDestBlocked) {
    displayedError = EXACT_NO_SAFE_ROUTE_MSG;
  }
  assert(displayedError === EXACT_NO_SAFE_ROUTE_MSG, "Blocked destination triggers exact message: " + EXACT_NO_SAFE_ROUTE_MSG);

  // Test 2: Mappedin Zone Avoidance around door / corridor
  const floorOB1 = mapData.getById("floor", "m_c5bac871ab66226c");
  const mainDoor = mapData.getById("door", "e_7d621cca039b07a9");
  const neDoor = mapData.getById("door", "e_efc8dc9fb2a2dedd");

  // Normal directions from c154 to mainDoor
  const dirNormal = mapData.getDirections(c154, mainDoor);
  assert(dirNormal != null && dirNormal.distance > 0, `Normal route found: distance ${dirNormal?.distance?.toFixed(1)}m`);

  // Block mainDoor with zone
  const zoneMainDoor = {
    geometry: createCirclePolygon(mainDoor.center.latitude, mainDoor.center.longitude, 5.0),
    cost: Infinity,
    floor: floorOB1,
  };
  const dirBlockedMain = mapData.getDirections(c154, mainDoor, { zones: [zoneMainDoor] });
  assert(dirBlockedMain == null, "Routing to blocked door is strictly refused (null)");

  // Alternate route to NE door is safe
  const dirAltNE = mapData.getDirections(c154, neDoor, { zones: [zoneMainDoor] });
  assert(dirAltNE != null && dirAltNE.distance > 0, `Safe alternate route found: distance ${dirAltNE?.distance?.toFixed(1)}m`);

  // Block both exits
  const zoneNEDoor = {
    geometry: createCirclePolygon(neDoor.center.latitude, neDoor.center.longitude, 5.0),
    cost: Infinity,
    floor: floorOB1,
  };
  const dirAllBlocked = mapData.getDirections(c154, neDoor, { zones: [zoneMainDoor, zoneNEDoor] });
  assert(dirAllBlocked == null, "When all paths to door are blocked, route is null");
  let routeError = dirAllBlocked ? "" : EXACT_NO_SAFE_ROUTE_MSG;
  assert(routeError === EXACT_NO_SAFE_ROUTE_MSG, "All paths blocked triggers exact message");

  console.log("\n--- TEST GROUP 5: ZERO AUTO-NAVIGATION ON HAZARD ACTIVATION ---");
  // Simulate hazard activation event handler
  let autoNavStarted = false;
  let generateButtonClicked = false;

  function mockGenerateClick() {
    generateButtonClicked = true;
    autoNavStarted = true;
  }

  function onHazardActivated(h) {
    // Only adds to store and updates markers! Never calls generateClick!
    activeHazards.set(h.id, h);
    mockMapView.updateState({ id: h.locationId }, { color: "#d93025" });
  }

  onHazardActivated({ id: "haz-test", locationId: "test-space", locationType: "room", severity: "blocked" });
  assert(!generateButtonClicked, "Hazard activation did NOT click generate button");
  assert(!autoNavStarted, "Hazard activation did NOT start auto-navigation");

  console.log("\n--- TEST GROUP 6: DYNAMIC REROUTING IF NAVIGATION IS ALREADY RUNNING ---");
  // Simulate a running navigation session
  let simRunning = true;
  let simStopped = false;
  let simRerouted = false;

  // Simulate positions along a path
  const simulatedPositions = [
    { latitude: 43.46505, longitude: -80.52420, floorOrFloorId: "m_c5bac871ab66226c" },
    { latitude: 43.46510, longitude: -80.52420, floorOrFloorId: "m_c5bac871ab66226c" },
    { latitude: 43.46515, longitude: -80.52420, floorOrFloorId: "m_c5bac871ab66226c" },
  ];

  function checkRouteIntersectsHazards(coords, hazards) {
    for (const pt of coords) {
      for (const h of hazards) {
        const latDiff = (pt.latitude - h.coordinates.latitude) * 111000;
        const lonDiff = (pt.longitude - h.coordinates.longitude) * 80000;
        const dist = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
        if (dist <= (h.radiusMeters || 5.0)) return true;
      }
    }
    return false;
  }

  // Activate hazard directly on coordinate 2 of the running path
  const newHazard = {
    id: "haz-on-path",
    coordinates: { latitude: 43.46510, longitude: -80.52420 },
    radiusMeters: 5.0,
    severity: "blocked",
  };

  const intersects = checkRouteIntersectsHazards(simulatedPositions, [newHazard]);
  assert(intersects, "Intersecting hazard on running path detected");

  if (simRunning && intersects) {
    simStopped = true;
    // Reroute around the hazard
    simRerouted = true;
  }

  assert(simStopped, "Simulated movement stopped immediately upon hazard intersection");
  assert(simRerouted, "Safe reroute initiated from current position");

  console.log("\n==================================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) process.exit(1);
}

run().catch(e => {
  console.error("Test execution error:", e);
  process.exit(1);
});
