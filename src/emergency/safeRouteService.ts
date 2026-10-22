import { MapData, Space, Directions } from "@mappedin/mappedin-js";
import { exitRegistry } from "./exitRegistry";
import { hazardStore } from "./hazardStore";
import { BuildingEntranceExit, NearestExitResult } from "./types";

export class SafeRouteService {
  /**
   * Calculates safe directions between start and destination respecting all active hazard zones.
   */
  getSafeDirections(
    start: Space,
    destination: Space,
    mapData: MapData
  ): Directions | undefined {
    const zones = hazardStore.getMappedinZones(mapData);
    try {
      if (zones.length > 0) {
        return mapData.getDirections(start, destination, { zones });
      } else {
        return mapData.getDirections(start, destination);
      }
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
    mapData: MapData
  ): NearestExitResult {
    const allExits = exitRegistry.getVerifiedEmergencyExits();

    if (allExits.length === 0) {
      return {
        startLocationName: startSpace.name || startSpace.id,
        startSpaceId: startSpace.id,
        chosenExit: null,
        error: "NO_ELIGIBLE_EXITS",
        errorMessage: "No verified emergency exits registered in system.",
        alternativeExits: [],
      };
    }

    const startFloorId = typeof startSpace.floor === "string" ? startSpace.floor : startSpace.floor?.id;

    // Prioritize exits in the same building/floor stack if possible
    const evaluatedExits: {
      exit: BuildingEntranceExit;
      distanceMeters: number;
      isSafe: boolean;
      routeBlockedReason?: string;
      directions?: Directions;
    }[] = [];

    const zones = hazardStore.getMappedinZones(mapData);

    for (const exit of allExits) {
      const exitSpace = mapData.getById("space", exit.spaceId);
      if (!exitSpace) {
        evaluatedExits.push({
          exit,
          distanceMeters: Infinity,
          isSafe: false,
          routeBlockedReason: "Exit space not found in venue map",
        });
        continue;
      }

      try {
        const directions = zones.length > 0
          ? mapData.getDirections(startSpace, exitSpace, { zones })
          : mapData.getDirections(startSpace, exitSpace);

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
          "CRITICAL WARNING: No safe evacuation route could be determined. All eligible exits are currently unreachable or blocked by reported hazards. Seek shelter in place or contact emergency services immediately.",
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
