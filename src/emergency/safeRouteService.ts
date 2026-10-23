import { MapData, Space, Door, Directions } from "@mappedin/mappedin-js";
import { exitRegistry } from "./exitRegistry";
import { hazardStore } from "./hazardStore";
import { BuildingEntranceExit, NearestExitResult } from "./types";

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

    for (const exit of targetExits) {
      // Check if exit is directly blocked by a custom restriction
      if (
        hazardStore.isLocationBlocked(exit.doorId, buildingId) ||
        hazardStore.isLocationBlocked(exit.id, buildingId) ||
        (exit.spaceId && hazardStore.isLocationBlocked(exit.spaceId, buildingId))
      ) {
        evaluatedExits.push({
          exit,
          distanceMeters: Infinity,
          isSafe: false,
          routeBlockedReason: "Exit is directly marked as BLOCKED by emergency hazard",
        });
        continue;
      }

      // Check if exit floor is blocked
      if (exit.floorId && hazardStore.isFloorBlocked(exit.floorId, buildingId)) {
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
        evaluatedExits.push({
          exit,
          distanceMeters: Infinity,
          isSafe: false,
          routeBlockedReason: "Exit door not found in venue map",
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

        if (directions && typeof directions.distance === "number") {
          evaluatedExits.push({
            exit,
            distanceMeters: directions.distance,
            isSafe: true,
            directions,
          });
        } else {
          evaluatedExits.push({
            exit,
            distanceMeters: Infinity,
            isSafe: false,
            routeBlockedReason: zones.length > 0
              ? "All paths to this exit are blocked by active hazards"
              : "No physical path connects starting location to this exit",
          });
        }
      } catch (err: any) {
        evaluatedExits.push({
          exit,
          distanceMeters: Infinity,
          isSafe: false,
          routeBlockedReason: `Routing calculation failed: ${err?.message || err}`,
        });
      }
    }

    // Sort evaluated exits: reachable first (by distance ascending), then unreachable
    evaluatedExits.sort((a, b) => a.distanceMeters - b.distanceMeters);

    const safeCandidates = evaluatedExits.filter((e) => e.isSafe && e.directions);

    if (safeCandidates.length === 0) {
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
