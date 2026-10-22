import { Hazard, HazardReason, HazardSeverity, HazardStatus } from "./types";
import { MapData, TDirectionZone } from "@mappedin/mappedin-js";

type HazardListener = (hazards: Hazard[]) => void;

function createCirclePolygon(
  centerLat: number,
  centerLon: number,
  radiusMeters: number,
  points = 16
): any {
  const coords: [number, number][] = [];
  const km = radiusMeters / 1000;
  // Earth radius in km
  const R = 6371;

  for (let i = 0; i <= points; i++) {
    const angle = (i * 360) / points;
    const rad = (angle * Math.PI) / 180;
    // Approximated delta
    const dLat = (km / R) * (180 / Math.PI);
    const dLon =
      ((km / R) * (180 / Math.PI)) /
      Math.cos((centerLat * Math.PI) / 180);

    const lat = centerLat + dLat * Math.sin(rad);
    const lon = centerLon + dLon * Math.cos(rad);
    coords.push([lon, lat]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [coords],
    },
  };
}

export class HazardStore {
  private hazards: Map<string, Hazard> = new Map();
  private listeners: Set<HazardListener> = new Set();

  getAll(): Hazard[] {
    return Array.from(this.hazards.values());
  }

  getActiveHazards(): Hazard[] {
    return Array.from(this.hazards.values()).filter(
      (h) => h.status !== "Cleared"
    );
  }

  getHazard(id: string): Hazard | undefined {
    return this.hazards.get(id);
  }

  addHazard(data: {
    id?: string;
    name: string;
    reason: HazardReason;
    severity?: HazardSeverity;
    locationName: string;
    floorId: string;
    coordinates: { latitude: number; longitude: number };
    radiusMeters?: number;
    status?: HazardStatus;
  }): Hazard {
    const id = data.id || `haz-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const radiusMeters = data.radiusMeters ?? 4.0;
    const polygon = createCirclePolygon(
      data.coordinates.latitude,
      data.coordinates.longitude,
      radiusMeters
    );

    const hazard: Hazard = {
      id,
      name: data.name,
      reason: data.reason,
      severity: data.severity ?? "blocked",
      locationName: data.locationName,
      floorId: data.floorId,
      coordinates: data.coordinates,
      radiusMeters,
      reportedAt: new Date().toLocaleTimeString(),
      status: data.status ?? "Confirmed",
      polygon,
    };

    this.hazards.set(id, hazard);
    this.notify();
    return hazard;
  }

  updateHazardStatus(id: string, status: HazardStatus): boolean {
    const h = this.hazards.get(id);
    if (!h) return false;
    h.status = status;
    this.notify();
    return true;
  }

  removeHazard(id: string): boolean {
    const deleted = this.hazards.delete(id);
    if (deleted) this.notify();
    return deleted;
  }

  clearAll(): void {
    this.hazards.clear();
    this.notify();
  }

  subscribe(listener: HazardListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const all = this.getAll();
    this.listeners.forEach((l) => l(all));
  }

  /**
   * Converts all active hazards into Mappedin SDK native TDirectionZone format
   * with cost: Infinity so getDirections avoids them.
   */
  getMappedinZones(mapData: MapData): TDirectionZone[] {
    const active = this.getActiveHazards();
    const zones: TDirectionZone[] = [];

    for (const h of active) {
      if (!h.polygon) continue;
      const floor = mapData.getById("floor", h.floorId);
      zones.push({
        geometry: h.polygon,
        cost: Infinity,
        floor: floor,
      });
    }

    return zones;
  }

  /**
   * Preset scenarios for hackathon judges
   */
  loadDemoScenario(scenarioId: "corridor-fire" | "lockdown-all-blocked" | "clear"): void {
    this.clearAll();

    if (scenarioId === "corridor-fire") {
      // Verified corridor loop point in office building 1: lat=43.465085, lon=-80.5241998
      // Blocks direct east hallway, forcing route around north loop!
      this.addHazard({
        id: "demo-fire-1",
        name: "East Corridor Structural Fire",
        reason: "fire",
        severity: "blocked",
        locationName: "East Corridor (near Reception)",
        floorId: "m_c5bac871ab66226c",
        coordinates: {
          latitude: 43.46508515630703,
          longitude: -80.52419984787747,
        },
        radiusMeters: 4.5,
        status: "Confirmed",
      });
    } else if (scenarioId === "lockdown-all-blocked") {
      // Blocks all corridors around Classroom 153 or exits
      this.addHazard({
        id: "demo-lock-1",
        name: "East Wing Fire & Heavy Smoke",
        reason: "fire",
        severity: "blocked",
        locationName: "East Corridor",
        floorId: "m_c5bac871ab66226c",
        coordinates: {
          latitude: 43.46508515630703,
          longitude: -80.52419984787747,
        },
        radiusMeters: 5.0,
        status: "Confirmed",
      });
      this.addHazard({
        id: "demo-lock-2",
        name: "North Corridor Debris Collapse",
        reason: "obstruction",
        severity: "blocked",
        locationName: "North Corridor junction",
        floorId: "m_c5bac871ab66226c",
        coordinates: {
          latitude: 43.465135,
          longitude: -80.52427,
        },
        radiusMeters: 6.0,
        status: "Confirmed",
      });
      this.addHazard({
        id: "demo-lock-3",
        name: "West Corridor Electrical Flash",
        reason: "structural",
        severity: "blocked",
        locationName: "Central Hallway",
        floorId: "m_c5bac871ab66226c",
        coordinates: {
          latitude: 43.46501,
          longitude: -80.52438,
        },
        radiusMeters: 6.0,
        status: "Confirmed",
      });
    }
  }
}

export const hazardStore = new HazardStore();
