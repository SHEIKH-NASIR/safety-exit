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

const CONFIGURED_BUILDINGS = [
  {
    id: "fs_6878b4d517d37f000bb0c288",
    name: "Main Building / School",
    floorId: "m_f5d3537f84fb2d4f",
    floorName: "Level 1",
    floors: [{ id: "m_f5d3537f84fb2d4f", name: "Level 1" }],
    defaultStartSpaceId: "s_19b47305ca7ab742",
    defaultStartSpaceName: "Office 1",
  },
  {
    id: "fs_6878b1ed316caa000b260be2",
    name: "Office Building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    floors: [{ id: "m_c5bac871ab66226c", name: "Level 1" }],
    defaultStartSpaceId: "s_46b78946d51bd3d8",
    defaultStartSpaceName: "Classroom 153",
  },
  {
    id: "fs_687ce890e964ae000bd1b0e2",
    name: "Waterloo Venue",
    floorId: "m_f7ad6268bf946916",
    floorName: "Level 1",
    floors: [
      { id: "m_f7ad6268bf946916", name: "Level 1" },
      { id: "m_0cabb66d2b13d0d3", name: "Level 2" },
    ],
    defaultStartSpaceId: "s_f36a96f33c8d7d3b",
    defaultStartSpaceName: "Bed Room",
  },
];

const VERIFIED_EXITS = [
  { id: "exit-sch-hall", doorId: "e_36b51dda911ea5dc", buildingId: "fs_6878b4d517d37f000bb0c288", floorId: "m_f5d3537f84fb2d4f", name: "School Main Entrance & Exit Door", isEmergencyExit: true, isEntrance: true },
  { id: "exit-sch-break", doorId: "e_928ca26bad0f64d0", buildingId: "fs_6878b4d517d37f000bb0c288", floorId: "m_f5d3537f84fb2d4f", name: "School South-East Emergency Exit Door", isEmergencyExit: true, isEntrance: false },
  { id: "exit-ob1-main", doorId: "e_7d621cca039b07a9", buildingId: "fs_6878b1ed316caa000b260be2", floorId: "m_c5bac871ab66226c", name: "Main Reception Entrance & Exit Door", isEmergencyExit: true, isEntrance: true },
  { id: "exit-ob1-ne", doorId: "e_efc8dc9fb2a2dedd", buildingId: "fs_6878b1ed316caa000b260be2", floorId: "m_c5bac871ab66226c", name: "North-East Emergency Exit Door", isEmergencyExit: true, isEntrance: false },
  { id: "exit-ob1-n", doorId: "e_c8121a9bdd86804e", buildingId: "fs_6878b1ed316caa000b260be2", floorId: "m_c5bac871ab66226c", name: "North Wing Exit Door", isEmergencyExit: true, isEntrance: false },
  { id: "exit-ob1-w", doorId: "e_97e5729191ddffcd", buildingId: "fs_6878b1ed316caa000b260be2", floorId: "m_c5bac871ab66226c", name: "West Emergency Exit Door", isEmergencyExit: true, isEntrance: false },
  { id: "exit-ob1-sw", doorId: "e_ac1d7851791e717f", buildingId: "fs_6878b1ed316caa000b260be2", floorId: "m_c5bac871ab66226c", name: "South-West Emergency Exit Door", isEmergencyExit: true, isEntrance: false },
  { id: "exit-wat-porch", doorId: "e_d91dc2e89bf6e0c7", buildingId: "fs_687ce890e964ae000bd1b0e2", floorId: "m_f7ad6268bf946916", name: "Porch Entrance & Exit Door", isEmergencyExit: true, isEntrance: true },
  { id: "exit-wat-court", doorId: "e_ae3282da063f5a53", buildingId: "fs_687ce890e964ae000bd1b0e2", floorId: "m_f7ad6268bf946916", name: "Courtyard Emergency Exit Door", isEmergencyExit: true, isEntrance: false },
];

function normalizeBuildingId(rawId) {
  if (!rawId) return "";
  return rawId.replace(/^fs_/, "");
}

class TestHazardStore {
  constructor() {
    this.hazards = [];
  }
  clearAll() { this.hazards = []; }
  addCustomHazard(h) {
    const id = "haz-" + Math.random().toString(36).substring(2, 9);
    const item = { id, ...h };
    this.hazards.push(item);
    return item;
  }
  removeHazard(id) {
    this.hazards = this.hazards.filter(h => h.id !== id);
  }
  getHazardsForBuilding(bId) {
    const norm = normalizeBuildingId(bId);
    return this.hazards.filter(h => normalizeBuildingId(h.buildingId) === norm);
  }
  isLocationBlocked(locId, bId) {
    if (!locId) return false;
    const bHazards = this.getHazardsForBuilding(bId);
    return bHazards.some(h => (h.locationId === locId || h.id === locId) && h.severity === "blocked");
  }
  isFloorBlocked(floorId, bId) {
    if (!floorId) return false;
    const bHazards = this.getHazardsForBuilding(bId);
    return bHazards.some(h => h.locationType === "floor" && (h.floorId === floorId || h.floorId === "all") && h.severity === "blocked");
  }
  getMappedinZones(mapData, bId) {
    const bHazards = this.getHazardsForBuilding(bId);
    const zones = [];
    for (const h of bHazards) {
      if (h.severity !== "blocked") continue;
      const floor = mapData.getById("floor", h.floorId);
      if (!floor) continue;

      let geom = null;
      if (h.coordinates) {
        geom = createCirclePolygon(h.coordinates.latitude, h.coordinates.longitude, h.radiusMeters || 5.0);
      } else if (h.locationId) {
        const door = mapData.getById("door", h.locationId);
        const space = mapData.getById("space", h.locationId);
        const target = door || space;
        if (target && target.center) {
          geom = createCirclePolygon(target.center.latitude, target.center.longitude, h.radiusMeters || 5.0);
        }
      }
      if (geom) {
        zones.push({ geometry: geom, cost: Infinity, floor });
      }
    }
    return zones;
  }
}

async function run() {
  console.log("==================================================================");
  console.log("  CAMPUSRESQ BUILDING NAVIGATION & DYNAMIC HAZARD TEST SUITE");
  console.log("==================================================================");

  const mapData = await getMapData({
    mapId: "6878b313316caa000b260be4",
    key: "mik_LunzGF0BwzLu5wKnO569c07af",
    secret: "mis_Tu9IawAmFN1TK6h4HekLxdhpwCflxEx8WGTNfHa80FQ8b8a100f",
    environment: "us",
  });

  const hazardStore = new TestHazardStore();
  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = "") {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}: ${details}`);
      failed++;
    }
  }

  // Helper to filter all spaces for building (including unlabelled)
  function getAllSpacesForBuilding(buildingId, floorId) {
    const norm = normalizeBuildingId(buildingId);
    const b = CONFIGURED_BUILDINGS.find(x => normalizeBuildingId(x.id) === norm);
    const targetFloors = floorId && floorId !== "all" 
      ? [floorId] 
      : b.floors.map(f => f.id);
    return mapData.getByType("space").filter(s => {
      const sFloorId = typeof s.floor === "string" ? s.floor : s.floor?.id;
      return sFloorId && targetFloors.includes(sFloorId);
    });
  }

  // Helper to filter exits for building
  function getExitsForBuilding(buildingId, floorId) {
    const norm = normalizeBuildingId(buildingId);
    return VERIFIED_EXITS.filter(e => {
      const matchB = normalizeBuildingId(e.buildingId) === norm;
      const matchF = !floorId || floorId === "all" || e.floorId === floorId;
      return matchB && matchF;
    });
  }

  console.log("\n--- TEST GROUP 1: BUILDING ISOLATION ---");
  const schoolSpaces = getAllSpacesForBuilding("fs_6878b4d517d37f000bb0c288");
  const ob1Spaces = getAllSpacesForBuilding("fs_6878b1ed316caa000b260be2");
  const watSpaces = getAllSpacesForBuilding("fs_687ce890e964ae000bd1b0e2");

  assert(schoolSpaces.length === 12, "School has 12 total spaces", `Found ${schoolSpaces.length}`);
  assert(ob1Spaces.length === 79, "Office Building 1 has 79 total spaces", `Found ${ob1Spaces.length}`);
  assert(watSpaces.length === 36, "Waterloo Venue has 36 spaces across 2 levels", `Found ${watSpaces.length}`);

  const schoolSet = new Set(schoolSpaces.map(s => s.id));
  const ob1Set = new Set(ob1Spaces.map(s => s.id));
  const watSet = new Set(watSpaces.map(s => s.id));

  assert(![...schoolSet].some(id => ob1Set.has(id)), "Zero space overlap: School vs Office Building 1");
  assert(![...schoolSet].some(id => watSet.has(id)), "Zero space overlap: School vs Waterloo Venue");
  assert(![...ob1Set].some(id => watSet.has(id)), "Zero space overlap: Office Building 1 vs Waterloo Venue");

  const schoolExits = getExitsForBuilding("fs_6878b4d517d37f000bb0c288");
  const ob1Exits = getExitsForBuilding("fs_6878b1ed316caa000b260be2");
  const watExits = getExitsForBuilding("fs_687ce890e964ae000bd1b0e2");

  assert(schoolExits.length === 2, "School has exactly 2 verified exterior exits");
  assert(ob1Exits.length === 5, "Office Building 1 has exactly 5 verified exterior exits");
  assert(watExits.length === 2, "Waterloo Venue has exactly 2 verified exterior exits");

  console.log("\n--- TEST GROUP 2: WATERLOO MULTI-FLOOR NAVIGATION ---");
  const watL1 = getAllSpacesForBuilding("fs_687ce890e964ae000bd1b0e2", "m_f7ad6268bf946916");
  const watL2 = getAllSpacesForBuilding("fs_687ce890e964ae000bd1b0e2", "m_0cabb66d2b13d0d3");
  assert(watL1.length === 18, "Waterloo Level 1 has 18 spaces", `Found ${watL1.length}`);
  assert(watL2.length === 18, "Waterloo Level 2 has 18 spaces", `Found ${watL2.length}`);

  console.log("\n--- TEST GROUP 3: CUSTOM DYNAMIC HAZARD MANAGEMENT ---");
  hazardStore.clearAll();
  const testRoom = ob1Spaces.find(s => s.name === "Classroom 153");
  const hFire = hazardStore.addCustomHazard({
    name: "Classroom 153 — Fire",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "Office Building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    locationType: "room",
    locationId: testRoom.id,
    locationName: "Classroom 153",
    reason: "Fire breakout with heavy toxic smoke",
    severity: "blocked",
    coordinates: { latitude: testRoom.center.latitude, longitude: testRoom.center.longitude },
    radiusMeters: 4.0,
  });

  assert(hazardStore.isLocationBlocked(testRoom.id, "fs_6878b1ed316caa000b260be2"), "Classroom 153 is marked blocked in OB1");
  assert(!hazardStore.isLocationBlocked(testRoom.id, "fs_6878b4d517d37f000bb0c288"), "Hazard in OB1 does not block School");

  // Routing with zone:
  const zones = hazardStore.getMappedinZones(mapData, "fs_6878b1ed316caa000b260be2");
  assert(zones.length === 1, "Mappedin zone created for Classroom 153 fire");
  assert(zones[0].cost === Infinity, "Zone cost is Infinity (Strict Avoidance)");

  console.log("\n--- TEST GROUP 4: CUSTOM EXIT BLOCKING & NEAREST EXIT EXCLUSION ---");
  hazardStore.clearAll();
  const mainReceptionDoorId = "e_7d621cca039b07a9";
  hazardStore.addCustomHazard({
    name: "Main Reception Exit — Blocked",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "Office Building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    locationType: "exit",
    locationId: mainReceptionDoorId,
    reason: "Collapsed entrance awning",
    severity: "blocked",
    coordinates: { latitude: 43.4649542, longitude: -80.5241229 },
    radiusMeters: 4.5,
  });

  assert(hazardStore.isLocationBlocked(mainReceptionDoorId, "fs_6878b1ed316caa000b260be2"), "Main Reception Exit is marked blocked");

  // Evacuate from Classroom 161 (in east wing) to nearest safe exit
  const startSpace = ob1Spaces.find(s => s.name === "Classroom 161");
  const allOB1Exits = getExitsForBuilding("fs_6878b1ed316caa000b260be2");
  const availableExits = allOB1Exits.filter(e => !hazardStore.isLocationBlocked(e.doorId, "fs_6878b1ed316caa000b260be2"));
  assert(availableExits.length === 4, "Blocked Main Reception Exit excluded from emergency candidate pool (4 remaining)");

  const ob1Zones = hazardStore.getMappedinZones(mapData, "fs_6878b1ed316caa000b260be2");
  let bestExit = null;
  let bestDist = Infinity;
  for (const ex of availableExits) {
    const door = mapData.getById("door", ex.doorId);
    let dir = mapData.getDirections(startSpace, door, { zones: ob1Zones });
    if (!dir && door.center) {
      dir = mapData.getDirections(startSpace, door.center, { zones: ob1Zones });
    }
    if (dir && dir.distance < bestDist) {
      bestDist = dir.distance;
      bestExit = ex;
    }
  }

  assert(bestExit !== null, "Found alternative safe emergency exit");
  assert(bestExit && bestExit.doorId !== mainReceptionDoorId, `Safely routed to ${bestExit ? bestExit.name : 'none'} (${bestDist.toFixed(1)}m), avoiding blocked exit`);

  console.log("\n--- TEST GROUP 5: WHOLE-FLOOR RESTRICTION ---");
  hazardStore.clearAll();
  hazardStore.addCustomHazard({
    name: "Waterloo Level 2 — Power Substation Fire",
    buildingId: "fs_687ce890e964ae000bd1b0e2",
    buildingName: "Waterloo Venue",
    floorId: "m_0cabb66d2b13d0d3",
    locationType: "floor",
    locationId: "m_0cabb66d2b13d0d3",
    reason: "Power substation explosion",
    severity: "blocked",
  });

  assert(hazardStore.isFloorBlocked("m_0cabb66d2b13d0d3", "fs_687ce890e964ae000bd1b0e2"), "Level 2 is marked blocked");
  assert(!hazardStore.isFloorBlocked("m_f7ad6268bf946916", "fs_687ce890e964ae000bd1b0e2"), "Level 1 is NOT blocked");

  console.log("\n--- TEST GROUP 6: CLEARING SINGLE HAZARD PRESERVES OTHERS ---");
  hazardStore.clearAll();
  const h1 = hazardStore.addCustomHazard({
    name: "Hazard 1",
    buildingId: "fs_6878b1ed316caa000b260be2",
    floorId: "m_c5bac871ab66226c",
    locationType: "room",
    locationId: "loc_1",
    severity: "blocked",
  });
  const h2 = hazardStore.addCustomHazard({
    name: "Hazard 2",
    buildingId: "fs_6878b1ed316caa000b260be2",
    floorId: "m_c5bac871ab66226c",
    locationType: "room",
    locationId: "loc_2",
    severity: "blocked",
  });

  assert(hazardStore.getHazardsForBuilding("fs_6878b1ed316caa000b260be2").length === 2, "2 hazards added");
  hazardStore.removeHazard(h1.id);
  assert(hazardStore.getHazardsForBuilding("fs_6878b1ed316caa000b260be2").length === 1, "1 hazard remains after removing Hazard 1");
  assert(!hazardStore.isLocationBlocked("loc_1", "fs_6878b1ed316caa000b260be2"), "loc_1 is cleared");
  assert(hazardStore.isLocationBlocked("loc_2", "fs_6878b1ed316caa000b260be2"), "loc_2 is still blocked");

  console.log("\n--- TEST GROUP 7: NO SAFE ROUTE ENFORCEMENT ---");
  hazardStore.clearAll();
  const schExits = getExitsForBuilding("fs_6878b4d517d37f000bb0c288");
  schExits.forEach(ex => {
    const door = mapData.getById("door", ex.doorId);
    hazardStore.addCustomHazard({
      name: `Exit Blocked: ${ex.name}`,
      buildingId: "fs_6878b4d517d37f000bb0c288",
      floorId: ex.floorId,
      locationType: "exit",
      locationId: ex.doorId,
      severity: "blocked",
      coordinates: { latitude: door.center.latitude, longitude: door.center.longitude },
      radiusMeters: 6.0,
    });
  });

  const schStart = schoolSpaces.find(s => s.name === "Office 1");
  const schZones = hazardStore.getMappedinZones(mapData, "fs_6878b4d517d37f000bb0c288");
  let anyRoute = false;
  for (const ex of schExits) {
    const door = mapData.getById("door", ex.doorId);
    let dir = mapData.getDirections(schStart, door, { zones: schZones });
    if (!dir && door.center) {
      dir = mapData.getDirections(schStart, door.center, { zones: schZones });
    }
    if (dir) anyRoute = true;
  }
  assert(!anyRoute, "Strict No Safe Route Enforcement: System refuses unsafe routes when all exits blocked");

  console.log("\n==================================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

run().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
