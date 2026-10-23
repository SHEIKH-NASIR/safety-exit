import { Space, Floor, Door } from "@mappedin/mappedin-js";

export type LocationType = "entrance" | "exit" | "both";

export type VerificationStatus = "verified" | "unverified" | "internal";

export type DoorClassification = "exterior" | "internal";

export interface BuildingEntranceExit {
  id: string;
  name: string;
  buildingId: string;
  buildingName: string;
  floorId: string;
  floorName: string;
  doorId: string;
  spaceId?: string;
  locationType: LocationType;
  doorType?: DoorClassification;
  isExterior?: boolean;
  isEmergencyExit: boolean;
  isEntrance: boolean;
  verificationStatus: VerificationStatus;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  notes?: string;
}

export type HazardReason =
  | "fire"
  | "smoke"
  | "obstruction"
  | "waterlogging"
  | "structural"
  | "other";

export type HazardSeverity = "blocked" | "unsafe";

export type HazardStatus = "Reported" | "Confirmed" | "Cleared";

export type LocationRestrictionType =
  | "room"
  | "exit"
  | "entrance"
  | "corridor"
  | "corridor-section"
  | "floor"
  | "area"
  | "drawn-polygon"
  | "drawn-corridor";

export interface CorridorSection {
  id: string;
  corridorName: string;
  sectionName: string;
  displayName: string;
  buildingId: string;
  floorId: string;
  spaceId?: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  radiusMeters: number;
  polygon?: any;
  notes?: string;
}

export interface Hazard {
  id: string;
  name: string;
  buildingId: string;
  buildingName?: string;
  floorId: string;
  floorName?: string;
  locationType: LocationRestrictionType;
  locationId?: string; // space ID, door ID, or floor ID
  sectionId?: string; // Stable corridor section ID
  locationName: string;
  reason: HazardReason | string;
  severity: HazardSeverity;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  radiusMeters: number;
  reportedAt: string;
  status: HazardStatus;
  polygon?: any; // GeoJSON Polygon Feature
  drawnPoints?: { latitude: number; longitude: number }[];
}

export type IncidentType = "fire" | "medical" | "hazard" | "evacuation" | "sos";

export type IncidentStatus = "New" | "Acknowledged" | "Responding" | "Resolved";

export interface Incident {
  id: string;
  reportedLocation: string;
  locationSpaceId?: string;
  incidentType: IncidentType;
  hazardId?: string;
  timeReported: string;
  status: IncidentStatus;
  severity: "low" | "medium" | "high" | "critical";
  notes?: string;
}

export interface EmergencyIncidentSnapshot {
  version: 1;
  incidentId: string;
  timestamp: number;
  timeReported: string;
  victim: {
    spaceId: string;
    locationName: string;
    buildingId: string;
    buildingName?: string;
    floorId: string;
    floorName?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  hazards: Array<{
    id: string;
    name: string;
    reason: HazardReason | string;
    severity: HazardSeverity;
    locationType: LocationRestrictionType;
    locationName: string;
    locationId?: string;
    sectionId?: string;
    buildingId: string;
    buildingName?: string;
    floorId: string;
    floorName?: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
    radiusMeters: number;
    status: HazardStatus;
    polygon?: any;
    isCleared?: boolean;
    drawnPoints?: { latitude: number; longitude: number }[];
  }>;
}

export interface IncidentReport {
  id: string;
  timestamp: string;
  type: IncidentType;
  locationName: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  status: IncidentStatus;
  description: string;
  reportedBy?: string;
}

export interface NearestExitResult {
  startLocationName: string;
  startSpaceId: string;
  chosenExit: BuildingEntranceExit | null;
  directions?: any;
  distanceMeters?: number;
  estimatedTimeSeconds?: number;
  error?: "NO_SAFE_ROUTE" | "NO_ELIGIBLE_EXITS";
  errorMessage?: string;
  alternativeExits: {
    exit: BuildingEntranceExit;
    distanceMeters: number;
    isSafe: boolean;
    routeBlockedReason?: string;
  }[];
}

export interface BuildingConfig {
  id: string;
  name: string;
  mapId: string;
  floorId: string;
  floorName: string;
  floors?: { id: string; name: string }[];
  defaultStartSpaceId: string;
  defaultStartSpaceName: string;
}

export interface DemoScenarioHazard {
  id: string;
  name: string;
  reason: HazardReason;
  severity: HazardSeverity;
  locationName: string;
  floorId: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  radiusMeters: number;
  spaceId?: string;
}

export interface DemoScenario {
  id: string;
  mapId: string;
  buildingId: string;
  buildingName: string;
  floorId: string;
  scenarioNumber: number;
  title: string;
  icon: string;
  description: string;
  expectedOutcome: string;
  defaultStartSpaceId: string;
  defaultStartSpaceName: string;
  hazards: DemoScenarioHazard[];
}
