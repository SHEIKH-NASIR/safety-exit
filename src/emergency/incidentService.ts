import {
  Incident,
  IncidentStatus,
  IncidentType,
  Hazard,
  EmergencyIncidentSnapshot,
} from "./types";

const STORAGE_KEY = "campusresq_local_demo_incidents";
const SNAPSHOTS_STORAGE_KEY = "campusresq_emergency_snapshots";

export class IncidentService {
  private incidents: Incident[] = [];
  private listeners: Set<(incidents: Incident[]) => void> = new Set();
  private snapshotListeners: Set<
    (snapshot: EmergencyIncidentSnapshot) => void
  > = new Set();
  private syncChannel: BroadcastChannel | null = null;
  private snapshots: Map<string, EmergencyIncidentSnapshot> = new Map();

  constructor() {
    this.loadFromStorage();
    if (this.incidents.length === 0) {
      this.populateInitialDemoIncidents();
    }
    this.loadSnapshotsFromStorage();
    this.initSyncChannel();
  }

  private initSyncChannel() {
    try {
      if (typeof BroadcastChannel !== "undefined") {
        this.syncChannel = new BroadcastChannel("campusresq_emergency_sync");
        this.syncChannel.onmessage = (event) => {
          if (event.data && event.data.type === "EMERGENCY_SNAPSHOT_UPDATE") {
            const snapshot = event.data.snapshot;
            if (snapshot && snapshot.incidentId) {
              this.snapshots.set(snapshot.incidentId, snapshot);
              this.saveSnapshotsToStorage();
              this.snapshotListeners.forEach((fn) => fn(snapshot));
            }
          }
        };
      }
    } catch {
      // BroadcastChannel not available in environment
    }
  }

  private loadSnapshotsFromStorage() {
    try {
      const raw = localStorage.getItem(SNAPSHOTS_STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        for (const [k, v] of Object.entries(obj)) {
          this.snapshots.set(k, v as EmergencyIncidentSnapshot);
        }
      }
    } catch {
      // ignore
    }
  }

  private saveSnapshotsToStorage() {
    try {
      const obj: Record<string, EmergencyIncidentSnapshot> = {};
      this.snapshots.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore
    }
  }

  createEmergencySnapshot(params: {
    incidentId?: string;
    victimSpaceId: string;
    victimLocationName: string;
    buildingId: string;
    buildingName?: string;
    floorId: string;
    floorName?: string;
    victimCoordinates?: { latitude: number; longitude: number };
    hazards: Hazard[];
  }): EmergencyIncidentSnapshot {
    const incidentId =
      params.incidentId ||
      `INC-${new Date().getFullYear()}-${String(
        Math.floor(100 + Math.random() * 900)
      )}`;

    const hazardsList = (params.hazards || []).map((h) => ({
      id: String(h.id),
      name: String(h.name || "Active Restriction"),
      reason: h.reason || "hazard",
      severity: h.severity || "blocked",
      locationType: h.locationType || "area",
      locationName: String(h.locationName || h.name || "Hazard Zone"),
      locationId: h.locationId,
      sectionId: h.sectionId,
      buildingId: h.buildingId,
      buildingName: h.buildingName,
      floorId: h.floorId,
      floorName: h.floorName,
      coordinates: {
        latitude: Number(h.coordinates?.latitude != null ? (Math.round(h.coordinates.latitude * 1e6) / 1e6) : 43.465085),
        longitude: Number(h.coordinates?.longitude != null ? (Math.round(h.coordinates.longitude * 1e6) / 1e6) : -80.5242),
      },
      radiusMeters: Number(h.radiusMeters) || 4.5,
      status: h.status || "Confirmed",
      polygon: h.polygon,
      isCleared: h.status === "Cleared",
      drawnPoints: Array.isArray(h.drawnPoints) ? h.drawnPoints : undefined,
    }));

    const snapshot: EmergencyIncidentSnapshot = {
      version: 1,
      incidentId,
      timestamp: Date.now(),
      timeReported: new Date().toLocaleTimeString(),
      victim: {
        spaceId: params.victimSpaceId,
        locationName: params.victimLocationName,
        buildingId: params.buildingId,
        buildingName: params.buildingName,
        floorId: params.floorId,
        floorName: params.floorName,
        coordinates: params.victimCoordinates,
      },
      hazards: hazardsList,
    };

    this.snapshots.set(incidentId, snapshot);
    this.saveSnapshotsToStorage();
    this.broadcastEmergencyUpdate(snapshot);
    return snapshot;
  }

  encodeSnapshot(snapshot: EmergencyIncidentSnapshot): string {
    try {
      const jsonStr = JSON.stringify(snapshot);
      // Safe base64 encoding handling unicode
      const utf8Bytes = new TextEncoder().encode(jsonStr);
      let binaryStr = "";
      for (let i = 0; i < utf8Bytes.length; i++) {
        binaryStr += String.fromCharCode(utf8Bytes[i]);
      }
      return btoa(binaryStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    } catch (e) {
      console.error("Failed to encode emergency snapshot:", e);
      return "";
    }
  }

  decodeSnapshot(encoded: string): EmergencyIncidentSnapshot | null {
    if (!encoded || typeof encoded !== "string") return null;
    try {
      // Normalize base64url to base64
      let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) {
        base64 += "=";
      }
      const binaryStr = atob(base64);
      const utf8Bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        utf8Bytes[i] = binaryStr.charCodeAt(i);
      }
      const jsonStr = new TextDecoder().decode(utf8Bytes);
      const data = JSON.parse(jsonStr);

      // Validate required structure and sanitize untrusted input
      if (!data || data.version !== 1 || !data.incidentId || !data.victim) {
        console.warn("Invalid snapshot payload structure");
        return null;
      }

      const victim = data.victim;
      if (!victim.spaceId || typeof victim.spaceId !== "string") {
        console.warn("Snapshot missing victim spaceId");
        return null;
      }

      // Sanitize victim fields
      const sanitizedVictim = {
        spaceId: String(victim.spaceId).slice(0, 80),
        locationName: String(victim.locationName || victim.spaceId).slice(0, 100),
        buildingId: String(victim.buildingId || "").slice(0, 60),
        buildingName: victim.buildingName ? String(victim.buildingName).slice(0, 60) : undefined,
        floorId: String(victim.floorId || "").slice(0, 60),
        floorName: victim.floorName ? String(victim.floorName).slice(0, 60) : undefined,
        coordinates:
          victim.coordinates &&
          !isNaN(Number(victim.coordinates.latitude)) &&
          !isNaN(Number(victim.coordinates.longitude))
            ? {
                latitude: Number(victim.coordinates.latitude),
                longitude: Number(victim.coordinates.longitude),
              }
            : undefined,
      };

      // Sanitize hazards list
      const sanitizedHazards: EmergencyIncidentSnapshot["hazards"] = [];
      if (Array.isArray(data.hazards)) {
        for (const h of data.hazards) {
          if (!h || !h.id) continue;
          const lat = Number(h.coordinates?.latitude);
          const lon = Number(h.coordinates?.longitude);
          sanitizedHazards.push({
            id: String(h.id).slice(0, 60),
            name: String(h.name || "Active Hazard").slice(0, 100),
            reason: String(h.reason || "hazard").slice(0, 40),
            severity: h.severity === "unsafe" ? "unsafe" : "blocked",
            locationType: h.locationType || "area",
            locationName: String(h.locationName || h.name || "").slice(0, 100),
            locationId: h.locationId ? String(h.locationId).slice(0, 60) : undefined,
            sectionId: h.sectionId ? String(h.sectionId).slice(0, 60) : undefined,
            buildingId: String(h.buildingId || sanitizedVictim.buildingId).slice(0, 60),
            buildingName: h.buildingName ? String(h.buildingName).slice(0, 60) : undefined,
            floorId: String(h.floorId || sanitizedVictim.floorId).slice(0, 60),
            floorName: h.floorName ? String(h.floorName).slice(0, 60) : undefined,
            coordinates: {
              latitude: isNaN(lat) ? 43.465085 : lat,
              longitude: isNaN(lon) ? -80.5242 : lon,
            },
            radiusMeters: Number(h.radiusMeters) || 4.5,
            status: h.status === "Cleared" || h.isCleared ? "Cleared" : "Confirmed",
            polygon: h.polygon,
            isCleared: Boolean(h.isCleared || h.status === "Cleared"),
            drawnPoints: Array.isArray(h.drawnPoints) ? h.drawnPoints : undefined,
          });
        }
      }

      const validated: EmergencyIncidentSnapshot = {
        version: 1,
        incidentId: String(data.incidentId).slice(0, 50),
        timestamp: Number(data.timestamp) || Date.now(),
        timeReported: String(data.timeReported || new Date().toLocaleTimeString()).slice(0, 30),
        victim: sanitizedVictim,
        hazards: sanitizedHazards,
      };

      this.snapshots.set(validated.incidentId, validated);
      this.saveSnapshotsToStorage();
      return validated;
    } catch (e) {
      console.error("Failed to decode emergency snapshot:", e);
      return null;
    }
  }

  broadcastEmergencyUpdate(snapshot: EmergencyIncidentSnapshot): void {
    try {
      if (this.syncChannel) {
        this.syncChannel.postMessage({
          type: "EMERGENCY_SNAPSHOT_UPDATE",
          snapshot,
        });
      }
    } catch {
      // BroadcastChannel post error
    }
    this.snapshotListeners.forEach((fn) => fn(snapshot));
  }

  listenForEmergencyUpdates(
    callback: (snapshot: EmergencyIncidentSnapshot) => void
  ): () => void {
    this.snapshotListeners.add(callback);
    return () => this.snapshotListeners.delete(callback);
  }

  getSnapshot(incidentId: string): EmergencyIncidentSnapshot | undefined {
    return this.snapshots.get(incidentId);
  }

  async syncWithBackend(
    incidentId: string,
    outgoingSnapshot?: EmergencyIncidentSnapshot
  ): Promise<{
    success: boolean;
    snapshot?: EmergencyIncidentSnapshot;
    error?: string;
  }> {
    try {
      const url = `/api/incidents/${encodeURIComponent(incidentId)}`;
      if (outgoingSnapshot) {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(outgoingSnapshot),
        });
        if (res.ok) {
          const remoteData = await res.json();
          return { success: true, snapshot: remoteData };
        }
      } else {
        const res = await fetch(url);
        if (res.ok) {
          const remoteData = await res.json();
          return { success: true, snapshot: remoteData };
        }
      }
      return {
        success: false,
        error: "Backend server endpoint not running. Using verified snapshot mode.",
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Network sync unavailable (${err?.message || "offline"}). Using verified snapshot mode.`,
      };
    }
  }

  private loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        this.incidents = JSON.parse(data);
      }
    } catch (e) {
      this.incidents = [];
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.incidents));
    } catch (e) {
      // ignore
    }
  }

  private populateInitialDemoIncidents() {
    this.incidents = [
      {
        id: "INC-2026-001",
        reportedLocation: "Classroom 153 (office building 1, Level 1)",
        locationSpaceId: "s_46b78946d51bd3d8",
        incidentType: "sos",
        timeReported: "10:14:22 AM",
        status: "New",
        severity: "critical",
        notes: "Student trapped due to smoke in hallway. SOS beacon activated.",
      },
      {
        id: "INC-2026-002",
        reportedLocation: "East Corridor junction (office building 1)",
        locationSpaceId: "s_968d23a365f36349",
        incidentType: "hazard",
        hazardId: "demo-fire-1",
        timeReported: "10:12:05 AM",
        status: "Responding",
        severity: "high",
        notes: "Fire alarm triggered. Structural heat detected.",
      },
      {
        id: "INC-2026-003",
        reportedLocation: "Computer Lab 173",
        locationSpaceId: "s_898581fc146b9623",
        incidentType: "evacuation",
        timeReported: "09:55:18 AM",
        status: "Resolved",
        severity: "medium",
        notes: "Evacuation completed via North-East Emergency Exit.",
      },
    ];
    this.saveToStorage();
  }

  getAll(): Incident[] {
    return [...this.incidents];
  }

  getById(id: string): Incident | undefined {
    return this.incidents.find((i) => i.id === id);
  }

  createIncident(data: {
    reportedLocation: string;
    locationSpaceId?: string;
    incidentType: IncidentType;
    hazardId?: string;
    severity?: "low" | "medium" | "high" | "critical";
    notes?: string;
  }): Incident {
    const id = `INC-2026-${String(this.incidents.length + 1).padStart(3, "0")}`;
    const incident: Incident = {
      id,
      reportedLocation: data.reportedLocation,
      locationSpaceId: data.locationSpaceId,
      incidentType: data.incidentType,
      timeReported: new Date().toLocaleTimeString(),
      hazardId: data.hazardId,
      status: "New",
      severity: data.severity || "medium",
      notes: data.notes,
    };
    this.incidents.unshift(incident);
    this.saveToStorage();
    this.notify();
    return incident;
  }

  updateStatus(id: string, status: IncidentStatus): boolean {
    const inc = this.incidents.find((i) => i.id === id);
    if (!inc) return false;
    inc.status = status;
    this.saveToStorage();
    this.notify();
    return true;
  }

  subscribe(listener: (incidents: Incident[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const all = this.getAll();
    this.listeners.forEach((l) => l(all));
  }

  resetDemoStore() {
    this.populateInitialDemoIncidents();
    this.notify();
  }
}

export const incidentService = new IncidentService();
