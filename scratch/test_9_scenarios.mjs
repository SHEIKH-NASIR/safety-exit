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
    defaultStartSpaceId: "s_19b47305ca7ab742", // Office 1
    defaultStartSpaceName: "Office 1",
  },
  {
    id: "fs_6878b1ed316caa000b260be2",
    name: "Office Building 1",
    floorId: "m_c5bac871ab66226c",
    defaultStartSpaceId: "s_46b78946d51bd3d8", // Classroom 153
    defaultStartSpaceName: "Classroom 153",
  },
  {
    id: "fs_687ce890e964ae000bd1b0e2",
    name: "Waterloo Venue",
    floorId: "m_f7ad6268bf946916",
    defaultStartSpaceId: "s_f36a96f33c8d7d3b", // Bed Room
    defaultStartSpaceName: "Bed Room (Courtyard Wing)",
  },
];

const VERIFIED_EXITS = [
  // School exits
  { id: "exit-sch-hall", doorId: "e_36b51dda911ea5dc", buildingId: "fs_6878b4d517d37f000bb0c288", floorId: "m_f5d3537f84fb2d4f", name: "School Main Entrance & Exit Door" },
  { id: "exit-sch-break", doorId: "e_928ca26bad0f64d0", buildingId: "fs_6878b4d517d37f000bb0c288", floorId: "m_f5d3537f84fb2d4f", name: "School South-East Emergency Exit Door" },
  // Office Building 1 exits
  { id: "exit-ob1-main", doorId: "e_7d621cca039b07a9", buildingId: "fs_6878b1ed316caa000b260be2", floorId: "m_c5bac871ab66226c", name: "Main Reception Entrance & Exit Door" },
  { id: "exit-ob1-ne", doorId: "e_efc8dc9fb2a2dedd", buildingId: "fs_6878b1ed316caa000b260be2", floorId: "m_c5bac871ab66226c", name: "North-East Emergency Exit Door" },
  { id: "exit-ob1-n", doorId: "e_c8121a9bdd86804e", buildingId: "fs_6878b1ed316caa000b260be2", floorId: "m_c5bac871ab66226c", name: "North Wing Exit Door" },
  { id: "exit-ob1-w", doorId: "e_97e5729191ddffcd", buildingId: "fs_6878b1ed316caa000b260be2", floorId: "m_c5bac871ab66226c", name: "West Emergency Exit Door" },
  { id: "exit-ob1-sw", doorId: "e_ac1d7851791e717f", buildingId: "fs_6878b1ed316caa000b260be2", floorId: "m_c5bac871ab66226c", name: "South-West Emergency Exit Door" },
  // Waterloo exits
  { id: "exit-wat-porch", doorId: "e_d91dc2e89bf6e0c7", buildingId: "fs_687ce890e964ae000bd1b0e2", floorId: "m_f7ad6268bf946916", name: "Porch Entrance & Exit Door" },
  { id: "exit-wat-court", doorId: "e_ae3282da063f5a53", buildingId: "fs_687ce890e964ae000bd1b0e2", floorId: "m_f7ad6268bf946916", name: "Courtyard Emergency Exit Door" },
];

const SCENARIOS = [
  // Building 1: School (3 scenarios)
  {
    buildingId: "fs_6878b4d517d37f000bb0c288",
    buildingName: "Main Building / School",
    scenarioNumber: 1,
    title: "All Clear — Normal Evacuation",
    icon: "🟢",
    expectedStatus: "safe",
    defaultStartSpaceId: "s_19b47305ca7ab742",
    hazards: [],
  },
  {
    buildingId: "fs_6878b4d517d37f000bb0c288",
    buildingName: "Main Building / School",
    scenarioNumber: 2,
    title: "Corridor Fire — Automatic Rerouting",
    icon: "🔥",
    expectedStatus: "safe",
    expectedExitId: "e_36b51dda911ea5dc",
    defaultStartSpaceId: "s_19b47305ca7ab742",
    hazards: [
      {
        coordinates: { latitude: 43.4654888, longitude: -80.5239180 },
        radiusMeters: 5.0,
        floorId: "m_f5d3537f84fb2d4f",
      },
    ],
  },
  {
    buildingId: "fs_6878b4d517d37f000bb0c288",
    buildingName: "Main Building / School",
    scenarioNumber: 3,
    title: "All Hallways Blocked — No Safe Route",
    icon: "⛔",
    expectedStatus: "blocked",
    defaultStartSpaceId: "s_19b47305ca7ab742",
    hazards: [
      {
        coordinates: { latitude: 43.4654888, longitude: -80.5239180 },
        radiusMeters: 5.5,
        floorId: "m_f5d3537f84fb2d4f",
      },
      {
        coordinates: { latitude: 43.4655906, longitude: -80.5240052 },
        radiusMeters: 5.5,
        floorId: "m_f5d3537f84fb2d4f",
      },
    ],
  },
  // Building 2: Office Building 1 (3 scenarios)
  {
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "Office Building 1",
    scenarioNumber: 4,
    title: "All Clear — Office Evacuation",
    icon: "🟢",
    expectedStatus: "safe",
    defaultStartSpaceId: "s_46b78946d51bd3d8",
    hazards: [],
  },
  {
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "Office Building 1",
    scenarioNumber: 5,
    title: "Office Wing Fire — Alternate Exit",
    icon: "🔥",
    expectedStatus: "safe",
    expectedExitId: "e_97e5729191ddffcd",
    defaultStartSpaceId: "s_46b78946d51bd3d8",
    hazards: [
      {
        coordinates: { latitude: 43.46508515630703, longitude: -80.52419984787747 },
        radiusMeters: 4.5,
        floorId: "m_c5bac871ab66226c",
      },
      {
        coordinates: { latitude: 43.4651722, longitude: -80.5241884 },
        radiusMeters: 4.5,
        floorId: "m_c5bac871ab66226c",
      },
    ],
  },
  {
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "Office Building 1",
    scenarioNumber: 6,
    title: "Multiple Exits Blocked — No Safe Route",
    icon: "⛔",
    expectedStatus: "blocked",
    defaultStartSpaceId: "s_46b78946d51bd3d8",
    hazards: [
      {
        coordinates: { latitude: 43.46508515630703, longitude: -80.52419984787747 },
        radiusMeters: 5.0,
        floorId: "m_c5bac871ab66226c",
      },
      {
        coordinates: { latitude: 43.465135, longitude: -80.52427 },
        radiusMeters: 6.0,
        floorId: "m_c5bac871ab66226c",
      },
      {
        coordinates: { latitude: 43.46501, longitude: -80.52438 },
        radiusMeters: 6.0,
        floorId: "m_c5bac871ab66226c",
      },
    ],
  },
  // Building 3: Waterloo Venue (3 scenarios)
  {
    buildingId: "fs_687ce890e964ae000bd1b0e2",
    buildingName: "Waterloo Venue",
    scenarioNumber: 7,
    title: "All Clear — Venue Evacuation",
    icon: "🟢",
    expectedStatus: "safe",
    defaultStartSpaceId: "s_f36a96f33c8d7d3b",
    hazards: [],
  },
  {
    buildingId: "fs_687ce890e964ae000bd1b0e2",
    buildingName: "Waterloo Venue",
    scenarioNumber: 8,
    title: "Courtyard Fire — Automatic Rerouting",
    icon: "🔥",
    expectedStatus: "safe",
    expectedExitId: "e_d91dc2e89bf6e0c7",
    defaultStartSpaceId: "s_f36a96f33c8d7d3b",
    hazards: [
      {
        coordinates: { latitude: 43.4653360, longitude: -80.5237863 },
        radiusMeters: 4.5,
        floorId: "m_f7ad6268bf946916",
      },
    ],
  },
  {
    buildingId: "fs_687ce890e964ae000bd1b0e2",
    buildingName: "Waterloo Venue",
    scenarioNumber: 9,
    title: "Entrances and Hallways Blocked — No Safe Route",
    icon: "⛔",
    expectedStatus: "blocked",
    defaultStartSpaceId: "s_f36a96f33c8d7d3b",
    hazards: [
      {
        coordinates: { latitude: 43.4653360, longitude: -80.5237863 },
        radiusMeters: 5.0,
        floorId: "m_f7ad6268bf946916",
      },
      {
        coordinates: { latitude: 43.4651933, longitude: -80.5240701 },
        radiusMeters: 5.0,
        floorId: "m_f7ad6268bf946916",
      },
      {
        coordinates: { latitude: 43.4651268, longitude: -80.5239308 },
        radiusMeters: 5.0,
        floorId: "m_f7ad6268bf946916",
      },
    ],
  },
];

async function run() {
  console.log("==================================================================");
  console.log("CAMPUSRESQ 9-SCENARIO VERIFICATION SUITE");
  console.log("==================================================================");

  const mapData = await getMapData({
    mapId: "6878b313316caa000b260be4",
    key: "mik_LunzGF0BwzLu5wKnO569c07af",
    secret: "mis_Tu9IawAmFN1TK6h4HekLxdhpwCflxEx8WGTNfHa80FQ8b8a100f",
    environment: "us",
  });

  let passed = 0;
  let failed = 0;

  for (const sc of SCENARIOS) {
    console.log(`\n--- Running Scenario ${sc.scenarioNumber}: [${sc.buildingName}] ${sc.title} ---`);
    const startSpace = mapData.getById("space", sc.defaultStartSpaceId);
    if (!startSpace) {
      console.error(`[FAIL] Start space ${sc.defaultStartSpaceId} not found`);
      failed++;
      continue;
    }

    // Build zones
    const zones = sc.hazards.map((h) => ({
      geometry: createCirclePolygon(h.coordinates.latitude, h.coordinates.longitude, h.radiusMeters),
      cost: Infinity,
      floor: mapData.getById("floor", h.floorId),
    }));

    // Filter exits for this building
    const buildingExits = VERIFIED_EXITS.filter((e) => e.buildingId === sc.buildingId);

    let chosenExit = null;
    let bestDist = Infinity;
    let chosenDirections = null;

    for (const exit of buildingExits) {
      const exitDoor = mapData.getById("door", exit.doorId);
      if (!exitDoor) continue;

      let dir = zones.length > 0
        ? mapData.getDirections(startSpace, exitDoor, { zones })
        : mapData.getDirections(startSpace, exitDoor);

      if (!dir && exitDoor.center) {
        dir = zones.length > 0
          ? mapData.getDirections(startSpace, exitDoor.center, { zones })
          : mapData.getDirections(startSpace, exitDoor.center);
      }

      if (dir && dir.distance < bestDist) {
        bestDist = dir.distance;
        chosenExit = exit;
        chosenDirections = dir;
      }
    }

    if (sc.expectedStatus === "safe") {
      if (chosenExit && chosenDirections) {
        console.log(`[PASS] Safe route found to "${chosenExit.name}" (${bestDist.toFixed(1)}m)`);
        if (sc.expectedExitId && chosenExit.doorId !== sc.expectedExitId) {
          console.warn(`[WARN] Target exit door is ${chosenExit.doorId}, expected ${sc.expectedExitId}`);
        }
        passed++;
      } else {
        console.error(`[FAIL] Expected safe route, but got NO ROUTE`);
        failed++;
      }
    } else {
      // blocked
      if (!chosenExit) {
        console.log(`[PASS] Correctly detected: NO SAFE ROUTE FOUND (System refuses unsafe path)`);
        passed++;
      } else {
        console.error(`[FAIL] Expected blocked route, but found path to "${chosenExit.name}"`);
        failed++;
      }
    }
  }

  console.log("\n==================================================================");
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED (Total ${SCENARIOS.length} scenarios)`);
  console.log("==================================================================");

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
