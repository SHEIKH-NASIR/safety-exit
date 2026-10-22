import {
  Directions,
  MapData,
  TBlueDotPositionUpdate,
} from "@mappedin/mappedin-js";
import LatLonSpherical from "geodesy/latlon-spherical.js";

export type PositionUpdatesOptions = {
  maxJitter: number;
  accuracy: number;
  updateDistance: number;
};

const defaultOptions: PositionUpdatesOptions = {
  maxJitter: 0,
  accuracy: 5,
  updateDistance: 5,
};

/**
 * Generate the user positions as they would move between spaces.
 * Add inaccuracy and randomness to the position updates if jitter is enabled.
 */
export const generateFakePositions = (
  mapData: MapData,
  directions: Directions,
  options: PositionUpdatesOptions
): TBlueDotPositionUpdate[] => {
  const positions: TBlueDotPositionUpdate[] = [];

  for (let i = 0; i < directions.coordinates.length; i++) {
    const currentCoord = directions.coordinates[i];
    const nextCoord = directions.coordinates[i + 1];

    // Main position
    let latLonPoint = new LatLonSpherical(
      currentCoord.latitude,
      currentCoord.longitude
    );

    // Calculate bearing to next point, default to 0 if NaN
    let bearing = 0;
    if (nextCoord) {
      const nextPoint = new LatLonSpherical(
        nextCoord.latitude,
        nextCoord.longitude
      );
      bearing = latLonPoint.initialBearingTo(nextPoint);
      if (isNaN(bearing)) bearing = 0;
    }

    // Add jitter if requested
    if (options.maxJitter > 0) {
      const randomOffset = Math.random() * options.maxJitter;
      const randomBearing = Math.random() * 360;
      latLonPoint = latLonPoint.destinationPoint(randomOffset, randomBearing);
    }

    // ✅ Add main position
    positions.push({
      accuracy: options.accuracy,
      floorOrFloorId: currentCoord.floorId,
      latitude: latLonPoint.latitude,
      longitude: latLonPoint.longitude,
      heading: isNaN(bearing) ? 0 : bearing,
    });

    // ✅ Add floor-change position if exists
    if ((currentCoord as any).floorChange) {
      const fc = currentCoord.floorChange;
      positions.push({
        accuracy: options.accuracy,
        floorOrFloorId: fc.targetFloor.id,
        latitude: latLonPoint.latitude,
        longitude: latLonPoint.longitude,
        heading: isNaN(bearing) ? 0 : bearing,
        isFloorChange: true,
        floorChangeText: `${
          fc.type === "stairs" ? "Take stairs" : "Take elevator"
        } to floor ${fc.targetFloor.name}`,
      });
    }

    // Add intermediate points between current and next
    if (nextCoord) {
      const distance = haversineDistance(
        currentCoord.latitude,
        currentCoord.longitude,
        nextCoord.latitude,
        nextCoord.longitude
      );

      if (distance > options.updateDistance) {
        const numIntermediatePoints =
          Math.ceil(distance / options.updateDistance) - 1;

        for (let j = 1; j <= numIntermediatePoints; j++) {
          const fraction = j / (numIntermediatePoints + 1);
          const interpolated = interpolatePoint(
            currentCoord,
            nextCoord,
            fraction
          );

          let interpolatedLatLon = new LatLonSpherical(
            interpolated.latitude,
            interpolated.longitude
          );

          if (options.maxJitter > 0) {
            const randomOffset = Math.random() * options.maxJitter;
            const randomBearing = Math.random() * 360;
            bearing = randomBearing;
            interpolatedLatLon = interpolatedLatLon.destinationPoint(
              randomOffset,
              randomBearing
            );
          }

          positions.push({
            accuracy: options.accuracy,
            floorOrFloorId: currentCoord.floorId,
            latitude: interpolatedLatLon.latitude,
            longitude: interpolatedLatLon.longitude,
            heading: isNaN(bearing) ? 0 : bearing,
          });
        }
      }
    }
  }

  return positions;
};

function interpolatePoint(
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
  fraction: number
): { latitude: number; longitude: number } {
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * fraction,
    longitude: start.longitude + (end.longitude - start.longitude) * fraction,
  };
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Generate an array of fake geolocation updates for a set of Directions
 */
export const generatePositionUpdates = (
  mapData: MapData,
  directions: Directions,
  options: Partial<PositionUpdatesOptions> = {}
): TBlueDotPositionUpdate[] | undefined => {
  if (mapData == null) return;

  const optionsWithDefaults: PositionUpdatesOptions = {
    ...defaultOptions,
    ...options,
  };

  return generateFakePositions(mapData, directions, optionsWithDefaults);
};
