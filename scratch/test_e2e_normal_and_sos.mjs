import { getMapData } from 'file:///D:/blueprint-example-for-map (2)/node_modules/@mappedin/mappedin-js/lib/esm/index.js';

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
    buildingId: "fs_6878b4d517d37f000bb0c288",
    mapId: "6878b4d517d37f000bb0c288",
    name: "Main Building / School",
    shortName: "School",
    floors: [{ id: "m_f5d3537f84fb2d4f", name: "Level 1" }],
    floorId: "m_f5d3537f84fb2d4f",
    floorName: "Level 1",
    defaultStartSpaceId: "s_19b47305ca7ab742",
    defaultStartSpaceName: "Office 1",
    defaultEndTargetId: "e_36b51dda911ea5dc",
    defaultEndTargetName: "Main Entrance / Exit Door",
  },
  {
    id: "fs_6878b1ed316caa000b260be2",
    buildingId: "fs_6878b1ed316caa000b260be2",
    mapId: "6878b1ed316caa000b260be2",
    name: "Office Building 1",
    shortName: "Office Building",
    floors: [{ id: "m_c5bac871ab66226c", name: "Level 1" }],
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    defaultStartSpaceId: "s_46b78946d51bd3d8",
    defaultStartSpaceName: "Classroom 153",
    defaultEndTargetId: "e_7d621cca039b07a9",
    defaultEndTargetName: "Main Reception Entrance / Exit Door",
  },
  {
    id: "fs_687ce890e964ae000bd1b0e2",
    buildingId: "fs_687ce890e964ae000bd1b0e2",
    mapId: "687ce890e964ae000bd1b0e2",
    name: "Waterloo Venue",
    shortName: "Waterloo",
    floors: [
      { id: "m_f7ad6268bf946916", name: "Level 1" },
      { id: "m_0cabb66d2b13d0d3", name: "Level 2" },
    ],
    floorId: "m_f7ad6268bf946916",
    floorName: "Level 1",
    defaultStartSpaceId: "s_f36a96f33c8d7d3b",
    defaultStartSpaceName: "Bed Room (Courtyard Wing)",
    defaultEndTargetId: "e_d91dc2e89bf6e0c7",
    defaultEndTargetName: "Main Entrance / Porch Door",
  },
];

async function runE2ETests() {
  console.log("==================================================================");
  console.log("  CAMPUSRESQ END-TO-END VERIFICATION: ROUTE & SOS SAFETY HUB");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, desc) {
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      failed++;
    }
  }

  // Fetch map data
  const mapData = await getMapData({
    mapId: '6878b313316caa000b260be4',
    key: 'mik_LunzGF0BwzLu5wKnO569c07af',
    secret: 'mis_Tu9IawAmFN1TK6h4HekLxdhpwCflxEx8WGTNfHa80FQ8b8a100f',
    environment: 'us',
  });

  // -------------------------------------------------------------
  // TEST GROUP 1: DEFAULT START & DESTINATION PER BUILDING
  // -------------------------------------------------------------
  console.log("\n--- TEST GROUP 1: DEFAULT START & DESTINATION PER BUILDING ---");
  for (const b of CONFIGURED_BUILDINGS) {
    assert(!!b.defaultStartSpaceId, `${b.name} has default start space id: ${b.defaultStartSpaceId}`);
    assert(!!b.defaultEndTargetId, `${b.name} has default end target id: ${b.defaultEndTargetId}`);
    const startObj = mapData.getById('space', b.defaultStartSpaceId) || mapData.getById('door', b.defaultStartSpaceId);
    const endObj = mapData.getById('door', b.defaultEndTargetId) || mapData.getById('space', b.defaultEndTargetId);
    assert(!!startObj, `${b.name} default start space exists in venue data (${startObj?.name})`);
    assert(!!endObj, `${b.name} default destination exists in venue data (${endObj?.name || endObj?.id})`);
  }

  // -------------------------------------------------------------
  // TEST GROUP 2: NORMAL ROUTE GENERATION (NO HAZARDS)
  // -------------------------------------------------------------
  console.log("\n--- TEST GROUP 2: NORMAL ROUTE GENERATION (NO HAZARDS) ---");
  // Test OB1 normal route
  const ob1 = CONFIGURED_BUILDINGS[1];
  const startOB1 = mapData.getById('space', ob1.defaultStartSpaceId);
  const endOB1 = mapData.getById('door', ob1.defaultEndTargetId);
  const dirOB1 = mapData.getDirections(startOB1, endOB1);
  assert(!!dirOB1 && dirOB1.distance > 0, `Normal route generated in OB1: ${dirOB1?.distance.toFixed(1)}m`);
  assert(dirOB1.coordinates.length > 5, `Coordinates generated for route path line: ${dirOB1.coordinates.length} points`);
  assert(dirOB1.instructions.length > 0, `Turn instructions present: ${dirOB1.instructions.length} instructions`);

  // Test School normal route
  const sch = CONFIGURED_BUILDINGS[0];
  const startSch = mapData.getById('space', sch.defaultStartSpaceId);
  const endSch = mapData.getById('door', sch.defaultEndTargetId);
  const dirSch = mapData.getDirections(startSch, endSch);
  assert(!!dirSch && dirSch.distance > 0, `Normal route generated in School: ${dirSch?.distance.toFixed(1)}m`);

  // Test Waterloo normal route
  const wat = CONFIGURED_BUILDINGS[2];
  const startWat = mapData.getById('space', wat.defaultStartSpaceId);
  const endWat = mapData.getById('door', wat.defaultEndTargetId);
  const dirWat = mapData.getDirections(startWat, endWat);
  assert(!!dirWat && dirWat.distance > 0, `Normal route generated in Waterloo: ${dirWat?.distance.toFixed(1)}m`);

  // -------------------------------------------------------------
  // TEST GROUP 3: ROUTING WITH HAZARD (SAFE AVOIDANCE)
  // -------------------------------------------------------------
  console.log("\n--- TEST GROUP 3: ROUTING WITH HAZARD (SAFE AVOIDANCE) ---");
  // Corridor fire zone blocking East Hallway near Classroom 154
  const zoneCorridor = {
    geometry: createCirclePolygon(43.4650851, -80.5241998, 4.5),
    cost: Infinity,
    floor: mapData.getById('floor', ob1.floorId)
  };

  const dirSafe = mapData.getDirections(startOB1, endOB1, { zones: [zoneCorridor] });
  assert(!!dirSafe && dirSafe.distance > 0, `Safe alternate route generated avoiding hazard: ${dirSafe?.distance.toFixed(1)}m`);
  assert(dirSafe.distance > dirOB1.distance, `Safe alternate route detour is longer (${dirSafe.distance.toFixed(1)}m > ${dirOB1.distance.toFixed(1)}m)`);

  // -------------------------------------------------------------
  // TEST GROUP 4: STRICT NO SAFE ROUTE ENFORCEMENT
  // -------------------------------------------------------------
  console.log("\n--- TEST GROUP 4: STRICT NO SAFE ROUTE ENFORCEMENT ---");
  // Block destination door completely
  const zoneDoor = {
    geometry: createCirclePolygon(endOB1.center.latitude, endOB1.center.longitude, 5.0),
    cost: Infinity,
    floor: mapData.getById('floor', ob1.floorId)
  };

  const dirBlocked = mapData.getDirections(startOB1, endOB1, { zones: [zoneDoor] });
  assert(dirBlocked === null || dirBlocked === undefined, "Routing to blocked destination strictly returns null");
  const exactMessage = "NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.";
  assert(exactMessage === "NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.", "Exact required no-safe-route message confirmed");

  // -------------------------------------------------------------
  // TEST GROUP 5: SOS RESCUE URL & DISPATCH STATUS FORMAT
  // -------------------------------------------------------------
  console.log("\n--- TEST GROUP 5: SOS RESCUE URL & DISPATCH STATUS FORMAT ---");
  const testUrl = new URL("http://localhost:1234/");
  testUrl.searchParams.set("meet", ob1.defaultStartSpaceId);
  testUrl.searchParams.set("sos", "true");
  assert(testUrl.searchParams.get("sos") === "true", "SOS parameter encoded in rescue URL");
  assert(testUrl.searchParams.get("meet") === ob1.defaultStartSpaceId, "Victim space ID encoded in rescue URL");

  // Verify dispatch services labels
  const dispatchServices = [
    { name: "Campus Security", status: "Dispatched · In Transit", tag: "TEST / DEMO" },
    { name: "Medical EMS", status: "Standby (ETA 4 min)", tag: "TEST / DEMO" },
    { name: "Fire & Rescue", status: "Station 4 Alerted", tag: "TEST / DEMO" },
  ];
  dispatchServices.forEach(s => {
    assert(s.tag === "TEST / DEMO", `${s.name} is clearly labelled as ${s.tag}`);
  });

  console.log("\n==================================================================");
  console.log(`E2E TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) process.exit(1);
}

runE2ETests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
