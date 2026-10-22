import { Space, Floor } from "@mappedin/mappedin-js";

export type LocationType = "entrance" | "exit" | "both";

export type VerificationStatus = "verified" | "unverified";

export interface BuildingEntranceExit {
  id: string;
  name: string;
  buildingId: string;
  buildingName: string;
  floorId: string;
  floorName: string;
  spaceId: string;
  locationType: LocationType;
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

export interface Hazard {
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
  reportedAt: string;
  status: HazardStatus;
  polygon?: any; // GeoJSON Polygon Feature
}

export type IncidentType = "fire" | "medical" | "hazard" | "evacuation" | "sos";

export type IncidentStatus = "New" | "Acknowledged" | "Responding" | "Resolved";

export interface Incident {
  id: string;
  reportedLocation: string;
  locationSpaceId?: string;
  incidentType: IncidentType;
  timeReported: string;
  hazardId?: string;
  status: IncidentStatus;
  notes?: string;
  severity?: "low" | "medium" | "high" | "critical";
}

export interface NearestExitResult {
  startLocationName: string;
  startSpaceId: string;
  chosenExit: BuildingEntranceExit | null;
  directions?: any; // Directions
  distanceMeters?: number;
  estimatedTimeSeconds?: number;
  error?: "NO_SAFE_ROUTE" | "NO_START_LOCATION" | "NO_ELIGIBLE_EXITS" | "ROUTING_FAILED";
  errorMessage?: string;
  alternativeExits: {
    exit: BuildingEntranceExit;
    distanceMeters: number;
    isSafe: boolean;
    routeBlockedReason?: string;
  }[];
}
