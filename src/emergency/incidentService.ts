import { Incident, IncidentStatus, IncidentType } from "./types";

const STORAGE_KEY = "campusresq_local_demo_incidents";

export class IncidentService {
  private incidents: Incident[] = [];
  private listeners: Set<(incidents: Incident[]) => void> = new Set();

  constructor() {
    this.loadFromStorage();
    if (this.incidents.length === 0) {
      this.populateInitialDemoIncidents();
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
