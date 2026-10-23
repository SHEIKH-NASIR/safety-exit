import { MapData, Space, Door, Directions } from "@mappedin/mappedin-js";
import { exitRegistry } from "./exitRegistry";
import { hazardStore } from "./hazardStore";
import { BuildingEntranceExit, NearestExitResult } from "./types";

/**
 * Robust Point-in-Polygon test using standard ray casting
 */
export function isPointInPolygon(
  lat: number,
  lon: number,
  ring: [number, number][]
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      ((yi > lat) !== (yj > lat)) &&
      (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function ccw(p1: [number, number], p2: [number, number], p3: [number, number]): number {
  return (p3[1] - p1[1]) * (p2[0] - p1[0]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
}

export function doSegmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  q1: [number, number],
  q2: [number, number]
): boolean {
  const d1 = ccw(p1, p2, q1);
  const d2 = ccw(p1, p2, q2);
  const d3 = ccw(q1, q2, p1);
  const d4 = ccw(q1, q2, p2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  const onSegment = (p: [number, number], a: [number, number], b: [number, number]) =>
    p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);

  if (Math.abs(d1) < 1e-10 && onSegment(q1, p1, p2)) return true;
  if (Math.abs(d2) < 1e-10 && onSegment(q2, p1, p2)) return true;
  if (Math.abs(d3) < 1e-10 && onSegment(p1, q1, q2)) return true;
  if (Math.abs(d4) < 1e-10 && onSegment(p2, q1, q2)) return true;

  return false;
}

/**
 * Validates whether any waypoint or line segment along a route intersects a hazard polygon
 */
export function doesRouteIntersectPolygon(
  coordinates: { latitude: number; longitude: number; floorId?: string }[],
  polygon: any,
  hazardFloorId?: string
): boolean {
  if (!coordinates || coordinates.length === 0 || !polygon) return false;
  const geom = polygon.geometry || polygon;
  const ring: [number, number][] = geom.coordinates?.[0];
  if (!ring || ring.length < 3) return false;

  const checkFloor = hazardFloorId && hazardFloorId !== "all";

  // 1. Waypoint containment check
  for (const c of coordinates) {
    if (checkFloor && c.floorId && c.floorId !== hazardFloorId) {
      continue;
    }
    if (isPointInPolygon(c.latitude, c.longitude, ring)) {
      return true;
    }
  }

  // 2. Line segment intersection check
  for (let i = 0; i < coordinates.length - 1; i++) {
    const c1 = coordinates[i];
    const c2 = coordinates[i + 1];
    if (checkFloor && (c1.floorId || c2.floorId)) {
      if (c1.floorId && c1.floorId !== hazardFloorId && c2.floorId && c2.floorId !== hazardFloorId) {
        continue;
      }
    }
    const s1: [number, number] = [c1.longitude, c1.latitude];
    const s2: [number, number] = [c2.longitude, c2.latitude];

    for (let j = 0; j < ring.length - 1; j++) {
      const e1 = ring[j];
      const e2 = ring[j + 1];
      if (doSegmentsIntersect(s1, s2, e1, e2)) {
        return true;
      }
    }
  }

  return false;
}

export class SafeRouteService {
  /**
   * Calculates safe directions between start and destination respecting all active hazard zones.
   */
  getSafeDirections(
    start: Space | Door | any,
    destination: Space | Door | any,
    mapData: MapData,
    buildingId?: string
  ): Directions | undefined {
    // 1. Check if starting location or destination is directly blocked
    const startId = start?.id;
    const destId = destination?.id;
    if (startId && hazardStore.isLocationBlocked(startId, buildingId)) {
      console.warn(`SafeRouteService: Start location ${startId} is blocked by active hazard.`);
      return undefined;
    }
    if (destId && hazardStore.isLocationBlocked(destId, buildingId)) {
      console.warn(`SafeRouteService: Destination ${destId} is blocked by active hazard.`);
      return undefined;
    }

    // 2. Check if either start or destination floor is completely blocked
    const startFloorId = typeof start?.floor === "string" ? start.floor : start?.floor?.id;
    const destFloorId = typeof destination?.floor === "string" ? destination.floor : destination?.floor?.id;
    if (startFloorId && hazardStore.isFloorBlocked(startFloorId, buildingId)) {
      console.warn(`SafeRouteService: Start floor ${startFloorId} is blocked.`);
      return undefined;
    }
    if (destFloorId && hazardStore.isFloorBlocked(destFloorId, buildingId)) {
      console.warn(`SafeRouteService: Destination floor ${destFloorId} is blocked.`);
      return undefined;
    }

    const zones = hazardStore.getMappedinZones(mapData, buildingId);
    try {
      const getDir = (s: any, d: any) =>
        zones.length > 0
          ? mapData.getDirections(s, d, { zones })
          : mapData.getDirections(s, d);

      let res = getDir(start, destination);
      if (!res && destination?.center) {
        res = getDir(start, destination.center);
      }
      if (res && res.coordinates && zones.length > 0) {
        const normB = buildingId ? hazardStore.normalizeBuildingId(buildingId) : null;
        const activeHazards = hazardStore.getActiveHazards().filter((h) => {
          if (!normB) return true;
          return hazardStore.normalizeBuildingId(h.buildingId) === normB;
        });
        const destFloor = destFloorId;
        for (const h of activeHazards) {
          if ((!destFloor || h.floorId === destFloor || h.floorId === "all") && h.polygon) {
            if (doesRouteIntersectPolygon(res.coordinates, h.polygon, h.floorId)) {
              console.warn(`SafeRouteService: Route intersects active hazard restriction "${h.name}". Refusing unsafe path.`);
              return undefined;
            }
          }
        }
      }
      return res;
    } catch (err) {
      console.error("SafeRouteService: getSafeDirections error:", err);
      return undefined;
    }
  }

  /**
   * Find the shortest safe and reachable registered emergency exit.
   */
  findNearestSafeExit(
    startSpace: Space,
    mapData: MapData,
    buildingId?: string
  ): NearestExitResult {
    let allExits = exitRegistry.getVerifiedEmergencyExits();
    if (buildingId) {
      const normB = hazardStore.normalizeBuildingId(buildingId);
      allExits = allExits.filter(
        (e) => hazardStore.normalizeBuildingId(e.buildingId) === normB
      );
    }

    if (allExits.length === 0) {
      return {
        startLocationName: startSpace.name || startSpace.id,
        startSpaceId: startSpace.id,
        chosenExit: null,
        error: "NO_ELIGIBLE_EXITS",
        errorMessage: "No verified emergency exits registered for this building.",
        alternativeExits: [],
      };
    }

    const startFloorId = typeof startSpace.floor === "string" ? startSpace.floor : startSpace.floor?.id;

    // Check if start space itself is inside a blocked hazard zone
    if (hazardStore.isLocationBlocked(startSpace.id, buildingId)) {
      return {
        startLocationName: startSpace.name || startSpace.id,
        startSpaceId: startSpace.id,
        chosenExit: null,
        error: "NO_SAFE_ROUTE",
        errorMessage: `CRITICAL ALERT: Your current starting location (${startSpace.name || startSpace.id}) is directly inside an active BLOCKED hazard zone! Evacuate immediately or shelter in place.`,
        alternativeExits: [],
      };
    }

    // Check if starting floor is blocked
    if (startFloorId && hazardStore.isFloorBlocked(startFloorId, buildingId)) {
      return {
        startLocationName: startSpace.name || startSpace.id,
        startSpaceId: startSpace.id,
        chosenExit: null,
        error: "NO_SAFE_ROUTE",
        errorMessage: `CRITICAL ALERT: The floor you are on is completely BLOCKED by an active restriction. Shelter in place immediately.`,
        alternativeExits: [],
      };
    }

    // Prioritize exits in the same building/floor stack
    let targetExits = allExits;
    if (startFloorId) {
      let matchedBuildingId: string | null = buildingId || null;
      if (!matchedBuildingId) {
        try {
          const floorStacks = mapData.getByType("floor-stack") as any[];
          for (const fs of floorStacks) {
            if (fs.floors && Array.isArray(fs.floors) && fs.floors.some((fl: any) => fl.id === startFloorId)) {
              matchedBuildingId = fs.id;
              break;
            }
          }
        } catch {
          // fallback ignored
        }
      }

      if (matchedBuildingId) {
        const normMatched = hazardStore.normalizeBuildingId(matchedBuildingId);
        const sameBuildingExits = allExits.filter((e) => {
          const normExit = hazardStore.normalizeBuildingId(e.buildingId || "");
          return normExit === normMatched || e.floorId === startFloorId;
        });
        if (sameBuildingExits.length > 0) {
          targetExits = sameBuildingExits;
        }
      }
    }

    const evaluatedExits: {
      exit: BuildingEntranceExit;
      distanceMeters: number;
      isSafe: boolean;
      routeBlockedReason?: string;
      directions?: Directions;
    }[] = [];

    const zones = hazardStore.getMappedinZones(mapData, buildingId);
    const normB = buildingId ? hazardStore.normalizeBuildingId(buildingId) : null;
    const activeHazards = hazardStore.getActiveHazards().filter((h) => {
      if (!normB) return true;
      return hazardStore.normalizeBuildingId(h.buildingId) === normB;
    });

    console.group(`[CampusResQ] Nearest Safe Exit Diagnostics`);
    console.log(`Current Start Space ID: ${startSpace.id} ("${startSpace.name || 'unnamed'}")`);
    console.log(`Building Context: ${buildingId || 'all'}, Start Floor: ${startFloorId || 'unknown'}`);
    console.log(`Active Hazard Count: ${activeHazards.length}, Candidate Verified Exterior Exits: ${targetExits.length}`);

    for (const exit of targetExits) {
      // 1. Check if exit door is directly targeted and marked as blocked by ID
      if (
        hazardStore.isLocationBlocked(exit.doorId, buildingId) ||
        hazardStore.isLocationBlocked(exit.id, buildingId)
      ) {
        console.log(`Candidate [${exit.id}] "${exit.name}": verificationStatus=${exit.verificationStatus}, REJECTED (Door directly marked as BLOCKED by hazard)`);
        evaluatedExits.push({
          exit,
          distanceMeters: Infinity,
          isSafe: false,
          routeBlockedReason: "Exit door is directly marked as BLOCKED by emergency hazard",
        });
        continue;
      }

      // 2. Check if exit floor is completely blocked
      if (exit.floorId && hazardStore.isFloorBlocked(exit.floorId, buildingId)) {
        console.log(`Candidate [${exit.id}] "${exit.name}": verificationStatus=${exit.verificationStatus}, REJECTED (Exit floor is completely BLOCKED)`);
        evaluatedExits.push({
          exit,
          distanceMeters: Infinity,
          isSafe: false,
          routeBlockedReason: "Exit floor is completely BLOCKED by emergency hazard",
        });
        continue;
      }

      const exitDoor = mapData.getById("door", exit.doorId);
      const exitSpace = exit.spaceId ? mapData.getById("space", exit.spaceId) : undefined;
      const exitTarget = exitDoor || exitSpace;
      if (!exitTarget) {
        console.log(`Candidate [${exit.id}] "${exit.name}": verificationStatus=${exit.verificationStatus}, REJECTED (Exit door not found in venue map)`);
        evaluatedExits.push({
          exit,
          distanceMeters: Infinity,
          isSafe: false,
          routeBlockedReason: "Exit door not found in venue map",
        });
        continue;
      }

      // 3. Direct Doorway Hazard Check: Verify if doorway coordinate lies directly inside any active restriction polygon
      const doorCoord = (exitDoor?.center || exit.coordinates);
      let isDoorInsideHazard = false;
      let coveringHazardName: string | null = null;
      if (doorCoord) {
        for (const h of activeHazards) {
          if ((h.floorId === exit.floorId || h.floorId === "all") && h.polygon) {
            const ring = h.polygon.geometry?.coordinates?.[0] || h.polygon.coordinates?.[0];
            if (ring && isPointInPolygon(doorCoord.latitude, doorCoord.longitude, ring)) {
              isDoorInsideHazard = true;
              coveringHazardName = h.name;
              break;
            }
          }
        }
      }

      if (isDoorInsideHazard) {
        console.log(`Candidate [${exit.id}] "${exit.name}": verificationStatus=${exit.verificationStatus}, REJECTED (Exit doorway coordinate lies inside active hazard: "${coveringHazardName}")`);
        evaluatedExits.push({
          exit,
          distanceMeters: Infinity,
          isSafe: false,
          routeBlockedReason: `Exit doorway is directly inside active restriction: ${coveringHazardName}`,
        });
        continue;
      }

      try {
        let directions = zones.length > 0
          ? mapData.getDirections(startSpace, exitTarget as any, { zones })
          : mapData.getDirections(startSpace, exitTarget as any);

        if (!directions && exitDoor?.center) {
          directions = zones.length > 0
            ? mapData.getDirections(startSpace, exitDoor.center, { zones })
            : mapData.getDirections(startSpace, exitDoor.center);
        }

        if (!directions || typeof directions.distance !== "number") {
          console.log(`Candidate [${exit.id}] "${exit.name}": verificationStatus=${exit.verificationStatus}, REJECTED (No valid route available avoiding hazards)`);
          evaluatedExits.push({
            exit,
            distanceMeters: Infinity,
            isSafe: false,
            routeBlockedReason: zones.length > 0
              ? "All paths to this exit are blocked by active hazards"
              : "No physical path connects starting location to this exit",
          });
          continue;
        }

        // 4. Robust Intersection Validation: Verify route coordinates do not cross any active hazard polygon on this floor
        let routeCrossesHazard = false;
        let intersectingHazardName: string | null = null;
        if (directions.coordinates && directions.coordinates.length > 0) {
          for (const h of activeHazards) {
            if ((h.floorId === exit.floorId || h.floorId === "all") && h.polygon) {
              if (doesRouteIntersectPolygon(directions.coordinates, h.polygon, h.floorId)) {
                routeCrossesHazard = true;
                intersectingHazardName = h.name;
                break;
              }
            }
          }
        }

        if (routeCrossesHazard) {
          console.log(`Candidate [${exit.id}] "${exit.name}": verificationStatus=${exit.verificationStatus}, REJECTED (Intersection validation confirms route crosses hazard: "${intersectingHazardName}")`);
          evaluatedExits.push({
            exit,
            distanceMeters: Infinity,
            isSafe: false,
            routeBlockedReason: `Route intersects active hazard restriction: ${intersectingHazardName}`,
          });
          continue;
        }

        // Safe candidate!
        const actualDist = directions.distance;
        console.log(`Candidate [${exit.id}] "${exit.name}": verificationStatus=${exit.verificationStatus}, REACHABLE, routeDistance=${actualDist.toFixed(1)}m`);
        evaluatedExits.push({
          exit,
          distanceMeters: actualDist,
          isSafe: true,
          directions,
        });
      } catch (err: any) {
        console.log(`Candidate [${exit.id}] "${exit.name}": REJECTED (Routing exception: ${err?.message || err})`);
        evaluatedExits.push({
          exit,
          distanceMeters: Infinity,
          isSafe: false,
          routeBlockedReason: `Routing calculation failed: ${err?.message || err}`,
        });
      }
    }

    // Sort evaluated exits: shortest valid route distance first (ascending)
    evaluatedExits.sort((a, b) => a.distanceMeters - b.distanceMeters);

    const safeCandidates = evaluatedExits.filter((e) => e.isSafe && e.directions);

    if (safeCandidates.length === 0) {
      console.warn(`[CampusResQ] Nearest Safe Exit: NO SAFE ROUTE AVAILABLE. All ${evaluatedExits.length} candidates were blocked or unreachable.`);
      console.groupEnd();
      return {
        startLocationName: startSpace.name || startSpace.id,
        startSpaceId: startSpace.id,
        chosenExit: null,
        error: "NO_SAFE_ROUTE",
        errorMessage:
          "NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.",
        alternativeExits: evaluatedExits.map((e) => ({
          exit: e.exit,
          distanceMeters: e.distanceMeters,
          isSafe: e.isSafe,
          routeBlockedReason: e.routeBlockedReason,
        })),
      };
    }

    const best = safeCandidates[0];
    const walkingSpeedMetersPerSec = 1.2; // average evacuation walking speed
    const estimatedTimeSeconds = Math.round(best.distanceMeters / walkingSpeedMetersPerSec);

    console.log(`[CampusResQ] Final Selected Safe Exit: [${best.exit.id}] "${best.exit.name}" (Shortest Route Distance: ${best.distanceMeters.toFixed(1)}m, ETA: ${estimatedTimeSeconds}s)`);
    console.groupEnd();

    return {
      startLocationName: startSpace.name || startSpace.id,
      startSpaceId: startSpace.id,
      chosenExit: best.exit,
      directions: best.directions,
      distanceMeters: Math.round(best.distanceMeters * 10) / 10,
      estimatedTimeSeconds,
      alternativeExits: evaluatedExits.map((e) => ({
        exit: e.exit,
        distanceMeters: e.distanceMeters,
        isSafe: e.isSafe,
        routeBlockedReason: e.routeBlockedReason,
      })),
    };
  }
}

export const safeRouteService = new SafeRouteService();
