import {
  Hazard,
  HazardReason,
  HazardSeverity,
  HazardStatus,
  DemoScenario,
  BuildingChoice,
} from "./types";
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

export const CONFIGURED_BUILDINGS: BuildingChoice[] = [
  {
    id: "fs_6878b4d517d37f000bb0c288",
    buildingId: "fs_6878b4d517d37f000bb0c288",
    mapId: "6878b4d517d37f000bb0c288",
    name: "Main Building / School",
    shortName: "School",
    floors: [{ id: "m_f5d3537f84fb2d4f", name: "Level 1" }],
    floorId: "m_f5d3537f84fb2d4f",
    floorName: "Level 1",
    defaultStartSpaceId: "s_19b47305ca7ab742", // Office 1
    defaultStartSpaceName: "Office 1",
    defaultEndTargetId: "e_36b51dda911ea5dc", // Main Entrance / Exit Door
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
    defaultStartSpaceId: "s_46b78946d51bd3d8", // Classroom 153
    defaultStartSpaceName: "Classroom 153",
    defaultEndTargetId: "e_7d621cca039b07a9", // Main Reception Entrance / Exit Door
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
    defaultStartSpaceId: "s_f36a96f33c8d7d3b", // Bed Room near Court Yard
    defaultStartSpaceName: "Bed Room (Courtyard Wing)",
    defaultEndTargetId: "e_d91dc2e89bf6e0c7", // Main Entrance / Porch Door
    defaultEndTargetName: "Main Entrance / Porch Door",
  },
];

export const BUILDING_SCENARIOS: Record<string, DemoScenario[]> = {
  // Map 1 — Main Building / School (6878b4d517d37f000bb0c288)
  "fs_6878b4d517d37f000bb0c288": [
    {
      id: "sc-school-clear",
      mapId: "6878b4d517d37f000bb0c288",
      buildingId: "fs_6878b4d517d37f000bb0c288",
      buildingName: "Main Building / School",
      floorId: "m_f5d3537f84fb2d4f",
      scenarioNumber: 1,
      title: "All Clear — Normal Evacuation",
      icon: "🟢",
      description: "Normal safe conditions in School. All primary corridors and emergency exits are clear.",
      expectedOutcome: "Direct safe evacuation route to nearest exit (School South-East Exit Door, ~54.8m).",
      defaultStartSpaceId: "s_19b47305ca7ab742",
      defaultStartSpaceName: "Office 1",
      hazards: [],
    },
    {
      id: "sc-school-fire",
      mapId: "6878b4d517d37f000bb0c288",
      buildingId: "fs_6878b4d517d37f000bb0c288",
      buildingName: "Main Building / School",
      floorId: "m_f5d3537f84fb2d4f",
      scenarioNumber: 2,
      title: "Corridor Fire — Automatic Rerouting",
      icon: "🔥",
      description: "Structural fire reported in South-East Corridor near Break Room, completely blocking access to the South-East exit.",
      expectedOutcome: "CampusResQ detects the blocked corridor, refuses the dangerous path, and automatically reroutes to the School Main Entrance & Exit Door (~57.6m).",
      defaultStartSpaceId: "s_19b47305ca7ab742",
      defaultStartSpaceName: "Office 1",
      hazards: [
        {
          id: "sch-fire-se",
          name: "South-East Corridor Structural Fire",
          reason: "fire",
          severity: "blocked",
          locationName: "South-East Corridor (near Break Room)",
          floorId: "m_f5d3537f84fb2d4f",
          coordinates: { latitude: 43.4654888, longitude: -80.5239180 },
          radiusMeters: 5.0,
        },
      ],
    },
    {
      id: "sc-school-blocked",
      mapId: "6878b4d517d37f000bb0c288",
      buildingId: "fs_6878b4d517d37f000bb0c288",
      buildingName: "Main Building / School",
      floorId: "m_f5d3537f84fb2d4f",
      scenarioNumber: 3,
      title: "All Hallways Blocked — No Safe Route",
      icon: "⛔",
      description: "Simultaneous fire in South-East Corridor and structural debris collapse in Main Hallway, severing all routes to building exits.",
      expectedOutcome: "NO SAFE ROUTE FOUND critical alert triggered. Prevents unsafe navigation and instructs occupants to shelter in place.",
      defaultStartSpaceId: "s_19b47305ca7ab742",
      defaultStartSpaceName: "Office 1",
      hazards: [
        {
          id: "sch-block-1",
          name: "South-East Corridor Fire & Smoke",
          reason: "fire",
          severity: "blocked",
          locationName: "South-East Exit Corridor",
          floorId: "m_f5d3537f84fb2d4f",
          coordinates: { latitude: 43.4654888, longitude: -80.5239180 },
          radiusMeters: 5.5,
        },
        {
          id: "sch-block-2",
          name: "Main Hallway Ceiling Collapse",
          reason: "structural",
          severity: "blocked",
          locationName: "Main Entrance Hallway",
          floorId: "m_f5d3537f84fb2d4f",
          coordinates: { latitude: 43.4655906, longitude: -80.5240052 },
          radiusMeters: 5.5,
        },
      ],
    },
  ],

  // Map 2 — Office Building 1 (6878b1ed316caa000b260be2)
  "fs_6878b1ed316caa000b260be2": [
    {
      id: "sc-ob1-clear",
      mapId: "6878b1ed316caa000b260be2",
      buildingId: "fs_6878b1ed316caa000b260be2",
      buildingName: "Office Building 1",
      floorId: "m_c5bac871ab66226c",
      scenarioNumber: 4,
      title: "All Clear — Office Evacuation",
      icon: "🟢",
      description: "Standard office conditions. All exits, corridors, and pathways are completely unobstructed.",
      expectedOutcome: "Direct safe route to nearest emergency exit (North-East Exit Door, ~12.5m).",
      defaultStartSpaceId: "s_46b78946d51bd3d8",
      defaultStartSpaceName: "Classroom 153",
      hazards: [],
    },
    {
      id: "sc-ob1-fire",
      mapId: "6878b1ed316caa000b260be2",
      buildingId: "fs_6878b1ed316caa000b260be2",
      buildingName: "Office Building 1",
      floorId: "m_c5bac871ab66226c",
      scenarioNumber: 5,
      title: "Office Wing Fire — Alternate Exit",
      icon: "🔥",
      description: "Structural fire reported in East Corridor and heavy smoke at North-East exit door, blocking direct access to Reception foyer.",
      expectedOutcome: "CampusResQ automatically avoids the East fire corridor, rerouting out through the West Emergency Exit Door (~23.6m).",
      defaultStartSpaceId: "s_46b78946d51bd3d8",
      defaultStartSpaceName: "Classroom 153",
      hazards: [
        {
          id: "ob1-fire-east",
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
        },
        {
          id: "ob1-fire-ne",
          name: "North-East Exit Smoke Infiltration",
          reason: "smoke",
          severity: "blocked",
          locationName: "North-East Doorway",
          floorId: "m_c5bac871ab66226c",
          coordinates: {
            latitude: 43.4651722,
            longitude: -80.5241884,
          },
          radiusMeters: 4.5,
        },
      ],
    },
    {
      id: "sc-ob1-blocked",
      mapId: "6878b1ed316caa000b260be2",
      buildingId: "fs_6878b1ed316caa000b260be2",
      buildingName: "Office Building 1",
      floorId: "m_c5bac871ab66226c",
      scenarioNumber: 6,
      title: "Multiple Exits Blocked — No Safe Route",
      icon: "⛔",
      description: "Multiple fire outbreaks, debris collapse, and electrical flash hazards cutting off all connecting hallways and exits.",
      expectedOutcome: "NO SAFE ROUTE FOUND critical alert triggered. System refuses unsafe passage and instructs occupants to shelter in place.",
      defaultStartSpaceId: "s_46b78946d51bd3d8",
      defaultStartSpaceName: "Classroom 153",
      hazards: [
        {
          id: "ob1-lock-1",
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
        },
        {
          id: "ob1-lock-2",
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
        },
        {
          id: "ob1-lock-3",
          name: "West Corridor Electrical Flash",
          reason: "structural",
          severity: "blocked",
          locationName: "Central Hallway junction",
          floorId: "m_c5bac871ab66226c",
          coordinates: {
            latitude: 43.46501,
            longitude: -80.52438,
          },
          radiusMeters: 6.0,
        },
      ],
    },
  ],

  // Map 3 — Waterloo Venue (687ce890e964ae000bd1b0e2)
  "fs_687ce890e964ae000bd1b0e2": [
    {
      id: "sc-wat-clear",
      mapId: "687ce890e964ae000bd1b0e2",
      buildingId: "fs_687ce890e964ae000bd1b0e2",
      buildingName: "Waterloo Venue",
      floorId: "m_f7ad6268bf946916",
      scenarioNumber: 7,
      title: "All Clear — Venue Evacuation",
      icon: "🟢",
      description: "Standard venue layout. Porch entrance and Courtyard exit pathways are fully operational.",
      expectedOutcome: "Direct safe evacuation route to nearest exit (Courtyard Exit Door, ~5.9m from East Bed Room).",
      defaultStartSpaceId: "s_f36a96f33c8d7d3b",
      defaultStartSpaceName: "Bed Room (Courtyard Wing)",
      hazards: [],
    },
    {
      id: "sc-wat-fire",
      mapId: "687ce890e964ae000bd1b0e2",
      buildingId: "fs_687ce890e964ae000bd1b0e2",
      buildingName: "Waterloo Venue",
      floorId: "m_f7ad6268bf946916",
      scenarioNumber: 8,
      title: "Courtyard Fire — Automatic Rerouting",
      icon: "🔥",
      description: "Fire outbreak reported in Courtyard access passage, rendering the courtyard emergency exit impassable.",
      expectedOutcome: "CampusResQ automatically avoids the courtyard fire zone and navigates through the lobby to the safe Porch Exit Door (~22.7m).",
      defaultStartSpaceId: "s_f36a96f33c8d7d3b",
      defaultStartSpaceName: "Bed Room (Courtyard Wing)",
      hazards: [
        {
          id: "wat-fire-court",
          name: "Courtyard Access Passage Fire",
          reason: "fire",
          severity: "blocked",
          locationName: "Courtyard Corridor",
          floorId: "m_f7ad6268bf946916",
          coordinates: { latitude: 43.4653360, longitude: -80.5237863 },
          radiusMeters: 4.5,
        },
      ],
    },
    {
      id: "sc-wat-blocked",
      mapId: "687ce890e964ae000bd1b0e2",
      buildingId: "fs_687ce890e964ae000bd1b0e2",
      buildingName: "Waterloo Venue",
      floorId: "m_f7ad6268bf946916",
      scenarioNumber: 9,
      title: "Entrances and Hallways Blocked — No Safe Route",
      icon: "⛔",
      description: "Heavy smoke engulfs the Courtyard and structural collapse blocks the Porch entrance, leaving no safe way out.",
      expectedOutcome: "NO SAFE ROUTE FOUND critical alert triggered. System prevents evacuation into dangerous smoke and instructs shelter in place.",
      defaultStartSpaceId: "s_f36a96f33c8d7d3b",
      defaultStartSpaceName: "Bed Room (Courtyard Wing)",
      hazards: [
        {
          id: "wat-block-1",
          name: "Courtyard Fire & Dense Smoke",
          reason: "fire",
          severity: "blocked",
          locationName: "Courtyard Exit",
          floorId: "m_f7ad6268bf946916",
          coordinates: { latitude: 43.4653360, longitude: -80.5237863 },
          radiusMeters: 5.0,
        },
        {
          id: "wat-block-2",
          name: "Porch Entrance Structural Blockage",
          reason: "obstruction",
          severity: "blocked",
          locationName: "Porch Foyer",
          floorId: "m_f7ad6268bf946916",
          coordinates: { latitude: 43.4651933, longitude: -80.5240701 },
          radiusMeters: 5.0,
        },
        {
          id: "wat-block-3",
          name: "Rear Corridor Heavy Smoke",
          reason: "smoke",
          severity: "blocked",
          locationName: "Rear Corridor Door",
          floorId: "m_f7ad6268bf946916",
          coordinates: { latitude: 43.4651268, longitude: -80.5239308 },
          radiusMeters: 5.0,
        },
      ],
    },
  ],
};

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

  /**
   * Adds a fully-specified custom hazard or location restriction
   */
  addCustomHazard(data: {
    id?: string;
    name: string;
    buildingId: string;
    buildingName?: string;
    floorId: string;
    floorName?: string;
    locationType: LocationRestrictionType;
    locationId?: string;
    locationName: string;
    reason: HazardReason | string;
    severity?: HazardSeverity;
    coordinates: { latitude: number; longitude: number };
    radiusMeters?: number;
    status?: HazardStatus;
    polygon?: any;
  }): Hazard {
    const id = data.id || `haz-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const radiusMeters =
      data.radiusMeters ??
      (data.locationType === "room"
        ? 5.5
        : data.locationType === "corridor"
        ? 6.0
        : data.locationType === "exit" || data.locationType === "entrance"
        ? 4.5
        : data.locationType === "floor"
        ? 40.0
        : 5.0);

    const polygon =
      data.polygon ||
      createCirclePolygon(
        data.coordinates.latitude,
        data.coordinates.longitude,
        radiusMeters
      );

    const normBuildingId = this.normalizeBuildingId(data.buildingId);
    const building = CONFIGURED_BUILDINGS.find(
      (b) => this.normalizeBuildingId(b.id) === normBuildingId
    );

    const hazard: Hazard = {
      id,
      name: data.name,
      buildingId: normBuildingId,
      buildingName: data.buildingName || building?.name || "Campus Building",
      floorId: data.floorId,
      floorName: data.floorName || (data.floorId === "all" ? "All Floors" : "Level 1"),
      locationType: data.locationType,
      locationId: data.locationId,
      locationName: data.locationName,
      reason: data.reason,
      severity: data.severity ?? "blocked",
      coordinates: data.coordinates,
      radiusMeters,
      reportedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: data.status ?? "Confirmed",
      polygon,
    };

    this.hazards.set(id, hazard);
    this.notify();
    return hazard;
  }

  addHazard(data: {
    id?: string;
    name: string;
    reason: HazardReason | string;
    severity?: HazardSeverity;
    locationName: string;
    floorId: string;
    coordinates: { latitude: number; longitude: number };
    radiusMeters?: number;
    status?: HazardStatus;
    buildingId?: string;
    locationType?: LocationRestrictionType;
    locationId?: string;
  }): Hazard {
    let buildingId = data.buildingId;
    if (!buildingId) {
      if (data.floorId === "m_f5d3537f84fb2d4f") {
        buildingId = "fs_6878b4d517d37f000bb0c288"; // School
      } else if (data.floorId === "m_f7ad6268bf946916" || data.floorId === "m_0cabb66d2b13d0d3") {
        buildingId = "fs_687ce890e964ae000bd1b0e2"; // Waterloo
      } else {
        buildingId = "fs_6878b1ed316caa000b260be2"; // OB1
      }
    }

    return this.addCustomHazard({
      id: data.id,
      name: data.name,
      buildingId,
      floorId: data.floorId,
      locationType: data.locationType || "corridor",
      locationId: data.locationId,
      locationName: data.locationName,
      reason: data.reason,
      severity: data.severity,
      coordinates: data.coordinates,
      radiusMeters: data.radiusMeters,
      status: data.status,
    });
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

  getHazardsForBuilding(buildingId: string): Hazard[] {
    const norm = this.normalizeBuildingId(buildingId);
    return this.getActiveHazards().filter(
      (h) => this.normalizeBuildingId(h.buildingId) === norm
    );
  }

  clearHazardsForBuilding(buildingId: string): void {
    const norm = this.normalizeBuildingId(buildingId);
    let changed = false;
    for (const [id, h] of this.hazards.entries()) {
      if (this.normalizeBuildingId(h.buildingId) === norm) {
        this.hazards.delete(id);
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  isLocationBlocked(locationId: string, buildingId?: string): boolean {
    if (!locationId) return false;
    const active = this.getActiveHazards();
    const normB = buildingId ? this.normalizeBuildingId(buildingId) : null;
    return active.some((h) => {
      if (normB && this.normalizeBuildingId(h.buildingId) !== normB) return false;
      return h.locationId === locationId || h.id === locationId;
    });
  }

  isFloorBlocked(floorId: string, buildingId?: string): boolean {
    if (!floorId) return false;
    const active = this.getActiveHazards();
    const normB = buildingId ? this.normalizeBuildingId(buildingId) : null;
    return active.some((h) => {
      if (normB && this.normalizeBuildingId(h.buildingId) !== normB) return false;
      if (h.locationType === "floor") {
        return h.floorId === floorId || h.locationId === floorId || h.floorId === "all";
      }
      return false;
    });
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
  getMappedinZones(mapData: MapData, buildingId?: string): TDirectionZone[] {
    const normB = buildingId ? this.normalizeBuildingId(buildingId) : null;
    const active = this.getActiveHazards().filter((h) => {
      if (!normB) return true;
      return this.normalizeBuildingId(h.buildingId) === normB;
    });

    const zones: TDirectionZone[] = [];

    for (const h of active) {
      if (h.locationType === "floor") {
        // Floor-wide restriction: block all spaces and doors on that floor
        const targetFloorId = h.locationId || h.floorId;
        const floorObj = mapData.getById("floor", targetFloorId);
        if (floorObj) {
          const spacesOnFloor = mapData.getByType("space").filter((s) => s.floor?.id === targetFloorId);
          for (const sp of spacesOnFloor) {
            if (sp.center) {
              zones.push({
                geometry: createCirclePolygon(sp.center.latitude, sp.center.longitude, 8.0),
                cost: Infinity,
                floor: floorObj,
              });
            }
          }
          const doorsOnFloor = mapData.getByType("door").filter((d) => d.floor?.id === targetFloorId);
          for (const dr of doorsOnFloor) {
            if (dr.center) {
              zones.push({
                geometry: createCirclePolygon(dr.center.latitude, dr.center.longitude, 5.0),
                cost: Infinity,
                floor: floorObj,
              });
            }
          }
        }
        continue;
      }

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
   * Returns list of configured buildings
   */
  getBuildingList(): BuildingChoice[] {
    return CONFIGURED_BUILDINGS;
  }

  /**
   * Normalizes building ID with or without fs_ prefix
   */
  normalizeBuildingId(buildingId: string): string {
    if (!buildingId) return CONFIGURED_BUILDINGS[1].buildingId;
    if (buildingId.startsWith("fs_")) return buildingId;
    return `fs_${buildingId}`;
  }

  /**
   * Returns the 3 building-specific scenarios for the given building
   */
  getScenariosForBuilding(buildingId: string): DemoScenario[] {
    const norm = this.normalizeBuildingId(buildingId);
    return BUILDING_SCENARIOS[norm] || BUILDING_SCENARIOS["fs_6878b1ed316caa000b260be2"] || [];
  }

  /**
   * Finds a scenario by its unique identifier across all buildings
   */
  getScenarioById(scenarioId: string): DemoScenario | undefined {
    for (const list of Object.values(BUILDING_SCENARIOS)) {
      const found = list.find((s) => s.id === scenarioId);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Preset scenarios for hackathon judges
   */
  loadDemoScenario(scenarioId: string): DemoScenario | undefined {
    this.clearAll();

    // Backward compatibility mapping for old string IDs
    let targetScenarioId = scenarioId;
    if (scenarioId === "clear") {
      return undefined;
    } else if (scenarioId === "corridor-fire") {
      targetScenarioId = "sc-ob1-fire";
    } else if (scenarioId === "lockdown-all-blocked") {
      targetScenarioId = "sc-ob1-blocked";
    }

    const scenario = this.getScenarioById(targetScenarioId);
    if (!scenario) {
      console.warn(`Scenario not found: ${scenarioId}`);
      return undefined;
    }

    // Apply all configured hazards for this scenario
    for (const h of scenario.hazards) {
      this.addCustomHazard({
        id: h.id,
        name: h.name,
        buildingId: scenario.buildingId,
        buildingName: scenario.buildingName,
        floorId: h.floorId,
        locationType: "corridor",
        locationName: h.locationName,
        reason: h.reason,
        severity: h.severity,
        coordinates: h.coordinates,
        radiusMeters: h.radiusMeters,
        status: "Confirmed",
      });
    }

    return scenario;
  }
}

export const hazardStore = new HazardStore();
