import { MapData, MapView, Space } from "@mappedin/mappedin-js";
import { exitRegistry } from "./exitRegistry";
import { hazardStore } from "./hazardStore";
import { safeRouteService } from "./safeRouteService";
import { incidentService } from "./incidentService";
import { BuildingEntranceExit, Hazard, Incident, NearestExitResult } from "./types";

export interface EmergencyPanelCallbacks {
  onRouteGenerated: (directions: any, destinationSpace: Space) => void;
  onClearNavigation: () => void;
  getCurrentStartSpace: () => Space | undefined;
  setDestinationSpace: (spaceId: string) => void;
  setStartSpace: (spaceId: string) => void;
}

export class EmergencyPanel {
  private isEmergencyMode = false;
  private mapData!: MapData;
  private mapView!: MapView;
  private callbacks!: EmergencyPanelCallbacks;

  private containerEl!: HTMLElement;
  private toggleButton!: HTMLButtonElement;
  private panelEl!: HTMLElement;
  private legendEl!: HTMLElement;
  private incidentModalEl!: HTMLElement;
  private hazardModalEl!: HTMLElement;

  private activeMarkers: any[] = [];
  private unsubscribeHazardStore?: () => void;

  init(mapData: MapData, mapView: MapView, callbacks: EmergencyPanelCallbacks) {
    this.mapData = mapData;
    this.mapView = mapView;
    this.callbacks = callbacks;

    this.createUI();
    this.renderMapMarkers();

    // Subscribe to hazard updates to re-render markers and recalculate route if active
    this.unsubscribeHazardStore = hazardStore.subscribe(() => {
      this.renderMapMarkers();
      this.updateActiveHazardsList();
      if (this.isEmergencyMode) {
        this.recalculateCurrentRoute();
      }
    });

    // Handle SOS link parameter if present in URL
    this.checkSosUrlParams();
  }

  private checkSosUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const isSos = params.get("sos") === "true";
    const victimSpaceId = params.get("victim") || params.get("meet");

    if (isSos && victimSpaceId) {
      setTimeout(() => {
        this.setEmergencyMode(true);
        const victimSpace = this.mapData.getById("space", victimSpaceId);
        const locName = victimSpace?.name || victimSpaceId;
        incidentService.createIncident({
          reportedLocation: `${locName} (SOS Broadcast)`,
          locationSpaceId: victimSpaceId,
          incidentType: "sos",
          severity: "critical",
          notes: "SOS rescue signal received via shared emergency link.",
        });
        this.showToast(`🚨 SOS RESCUE ACTIVATED: Destination locked to victim at ${locName}!`);
      }, 500);
    }
  }

  private createUI() {
    // 1. Emergency Mode Toggle Button in the top right header
    this.toggleButton = document.createElement("button");
    this.toggleButton.id = "emergencyModeToggle";
    this.toggleButton.className = "emergency-mode-toggle";
    this.toggleButton.innerHTML = `<span class="pulse-icon">🚨</span> Emergency Mode`;
    this.toggleButton.title = "Toggle CampusResQ Emergency Exit & Safe Route Finder";
    this.toggleButton.onclick = () => this.toggleEmergencyMode();

    Object.assign(this.toggleButton.style, {
      position: "fixed",
      top: "12px",
      right: "120px",
      zIndex: "35",
      background: "#d93025",
      color: "#ffffff",
      border: "none",
      borderRadius: "999px",
      padding: "10px 16px",
      fontSize: "14px",
      fontWeight: "700",
      boxShadow: "0 4px 14px rgba(217, 48, 37, 0.45)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      transition: "all 0.2s ease",
    });

    document.body.appendChild(this.toggleButton);

    // 2. Emergency Floating Panel Container
    this.panelEl = document.createElement("div");
    this.panelEl.id = "emergencyControlPanel";
    this.panelEl.className = "emergency-panel";
    Object.assign(this.panelEl.style, {
      position: "fixed",
      top: "64px",
      right: "12px",
      width: "350px",
      maxHeight: "calc(100vh - 80px)",
      overflowY: "auto",
      background: "rgba(255, 255, 255, 0.98)",
      backdropFilter: "blur(10px)",
      borderRadius: "16px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.28)",
      zIndex: "34",
      padding: "16px",
      display: "none",
      flexDirection: "column",
      gap: "12px",
      border: "2px solid #d93025",
      fontFamily: "inherit",
    });

    this.renderPanelContent();
    document.body.appendChild(this.panelEl);

    // 3. Map Legend Widget
    this.legendEl = document.createElement("div");
    this.legendEl.id = "campusresqLegend";
    Object.assign(this.legendEl.style, {
      position: "fixed",
      bottom: "16px",
      left: "360px",
      background: "rgba(255, 255, 255, 0.92)",
      backdropFilter: "blur(6px)",
      padding: "8px 12px",
      borderRadius: "10px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
      zIndex: "25",
      fontSize: "12px",
      display: "flex",
      gap: "14px",
      alignItems: "center",
      border: "1px solid #e0e0e0",
      pointerEvents: "auto",
    });

    this.legendEl.innerHTML = `
      <span style="font-weight:700; color:#333;">CampusResQ:</span>
      <span style="display:flex; align-items:center; gap:4px;"><span style="color:#1a73e8; font-size:14px;">🚪</span> Entrance</span>
      <span style="display:flex; align-items:center; gap:4px;"><span style="color:#188038; font-size:14px;">🏃</span> Emergency Exit</span>
      <span style="display:flex; align-items:center; gap:4px;"><span style="color:#d93025; font-size:14px;">🔥</span> Blocked Hazard</span>
    `;
    document.body.appendChild(this.legendEl);

    // Responsive styling for mobile
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      @media (max-width: 899.98px) {
        #emergencyModeToggle {
          top: 10px !important;
          right: 90px !important;
          font-size: 12px !important;
          padding: 8px 12px !important;
        }
        #emergencyControlPanel {
          left: 10px !important;
          right: 10px !important;
          width: auto !important;
          max-width: none !important;
          top: 54px !important;
          max-height: 55vh !important;
        }
        #campusresqLegend {
          left: 10px !important;
          bottom: 140px !important;
          font-size: 11px !important;
          padding: 6px 10px !important;
        }
      }
      @keyframes pulse {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(217, 48, 37, 0.7); }
        70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(217, 48, 37, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(217, 48, 37, 0); }
      }
    `;
    document.head.appendChild(styleEl);
  }

  toggleEmergencyMode() {
    this.setEmergencyMode(!this.isEmergencyMode);
  }

  setEmergencyMode(active: boolean) {
    this.isEmergencyMode = active;

    if (active) {
      this.toggleButton.style.background = "#b71c1c";
      this.toggleButton.innerHTML = `<span class="pulse-icon">🚨</span> Exit Emergency`;
      this.panelEl.style.display = "flex";
      this.showToast("🚨 CampusResQ Emergency Mode Activated");
      this.renderMapMarkers();
      this.updateActiveHazardsList();
    } else {
      this.toggleButton.style.background = "#d93025";
      this.toggleButton.innerHTML = `<span class="pulse-icon">🚨</span> Emergency Mode`;
      this.panelEl.style.display = "none";
      this.hideWarning();
      this.renderMapMarkers();
      this.showToast("Normal Navigation Restored");
    }
  }

  private renderPanelContent() {
    this.panelEl.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #ffcdd2; padding-bottom:8px;">
        <div style="font-weight:800; font-size:16px; color:#b71c1c; display:flex; align-items:center; gap:6px;">
          <span>🚨</span> CampusResQ Emergency Mode
        </div>
        <span style="font-size:11px; background:#ffebee; color:#c62828; padding:3px 8px; border-radius:12px; font-weight:700;">EVACUATION</span>
      </div>

      <!-- Warning Container for No Safe Route -->
      <div id="emergencyWarningBox" style="display:none; background:#ffebee; border:2px solid #d32f2f; color:#b71c1c; padding:12px; border-radius:10px; font-size:13px; font-weight:600; line-height:1.4;">
      </div>

      <!-- Prominent Find Nearest Safe Exit CTA -->
      <button id="btnFindNearestExit" style="background:#188038; color:#fff; border:none; padding:12px 16px; border-radius:10px; font-size:15px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 12px rgba(24, 128, 56, 0.35);">
        <span style="font-size:18px;">🏃</span> Find Nearest Safe Exit
      </button>

      <!-- Results of Exit Route -->
      <div id="nearestExitResult" style="display:none; background:#f1f8e9; border:1px solid #c8e6c9; border-radius:10px; padding:10px; font-size:13px;">
      </div>

      <!-- Emergency Action Buttons -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
        <button id="btnReportHazard" style="background:#fff3e0; color:#e65100; border:1px solid #ffe0b2; padding:8px 10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
          <span>⚠️</span> Report Hazard
        </button>
        <button id="btnRecalculateRoute" style="background:#e3f2fd; color:#0d47a1; border:1px solid #bbdefb; padding:8px 10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
          <span>🔄</span> Recalculate Safe Route
        </button>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
        <button id="btnIncidentDashboard" style="background:#f3e5f5; color:#6a1b9a; border:1px solid #e1bee7; padding:8px 10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
          <span>📋</span> Incident Dashboard
        </button>
        <button id="btnResetDemo" style="background:#f5f5f5; color:#333; border:1px solid #e0e0e0; padding:8px 10px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
          <span>🔄</span> Reset Demo State
        </button>
      </div>

      <!-- Demo Scenarios Section -->
      <div style="background:#fafafa; border:1px solid #eee; border-radius:10px; padding:10px;">
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#666; margin-bottom:6px;">
          🧪 Hackathon Judge Demo Scenarios
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <button id="btnDemoClear" style="text-align:left; background:#fff; border:1px solid #ddd; padding:6px 8px; border-radius:6px; font-size:12px; cursor:pointer;">
            🟢 <b>Scenario 1:</b> All Clear (Normal Evacuation)
          </button>
          <button id="btnDemoFire" style="text-align:left; background:#fff; border:1px solid #ffccbc; padding:6px 8px; border-radius:6px; font-size:12px; cursor:pointer;">
            🔥 <b>Scenario 2:</b> East Corridor Fire (Auto Reroutes)
          </button>
          <button id="btnDemoLockdown" style="text-align:left; background:#fff; border:1px solid #ffcdd2; padding:6px 8px; border-radius:6px; font-size:12px; cursor:pointer;">
            ⛔ <b>Scenario 3:</b> All Hallways Blocked (No Safe Route)
          </button>
        </div>
      </div>

      <!-- Active Hazards Section -->
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span style="font-size:12px; font-weight:700; color:#444;">ACTIVE HAZARDS & RESTRICTIONS:</span>
          <span id="activeHazardsCount" style="font-size:11px; background:#d93025; color:#fff; padding:1px 6px; border-radius:10px; font-weight:700;">0</span>
        </div>
        <div id="activeHazardsList" style="max-height:140px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
          <div style="font-size:12px; color:#888; font-style:italic;">No active hazards reported.</div>
        </div>
      </div>

      <!-- Alternative Exits Drawer -->
      <details id="alternativeExitsDetails" style="border:1px solid #e0e0e0; border-radius:8px; padding:6px 8px;">
        <summary style="font-size:12px; font-weight:700; cursor:pointer; color:#444;">Reachable & Evaluated Exits</summary>
        <div id="alternativeExitsList" style="margin-top:8px; display:flex; flex-direction:column; gap:6px; font-size:12px;">
          <div style="color:#888;">Run "Find Nearest Safe Exit" to view status of all exits.</div>
        </div>
      </details>
    `;

    // Wire up buttons
    this.panelEl.querySelector("#btnFindNearestExit")!.addEventListener("click", () => this.handleFindNearestExit());
    this.panelEl.querySelector("#btnReportHazard")!.addEventListener("click", () => this.showReportHazardModal());
    this.panelEl.querySelector("#btnRecalculateRoute")!.addEventListener("click", () => this.recalculateCurrentRoute());
    this.panelEl.querySelector("#btnIncidentDashboard")!.addEventListener("click", () => this.showIncidentDashboard());
    this.panelEl.querySelector("#btnResetDemo")!.addEventListener("click", () => this.resetDemo());

    this.panelEl.querySelector("#btnDemoClear")!.addEventListener("click", () => {
      hazardStore.loadDemoScenario("clear");
      this.showToast("Demo Scenario: All hazards cleared.");
      this.handleFindNearestExit();
    });

    this.panelEl.querySelector("#btnDemoFire")!.addEventListener("click", () => {
      hazardStore.loadDemoScenario("corridor-fire");
      this.showToast("Demo Scenario: Fire reported in East Corridor! Recalculating safe route...");
      this.handleFindNearestExit();
    });

    this.panelEl.querySelector("#btnDemoLockdown")!.addEventListener("click", () => {
      hazardStore.loadDemoScenario("lockdown-all-blocked");
      this.showToast("Demo Scenario: Multiple corridors blocked! Evaluating route safety...");
      this.handleFindNearestExit();
    });
  }

  private handleFindNearestExit() {
    const startSpace = this.callbacks.getCurrentStartSpace();
    if (!startSpace) {
      alert("Please select your current location (From) in the route picker first!");
      return;
    }

    this.hideWarning();
    const result: NearestExitResult = safeRouteService.findNearestSafeExit(startSpace, this.mapData);

    const resultBox = document.getElementById("nearestExitResult")!;
    const altExitsList = document.getElementById("alternativeExitsList")!;

    if (result.error === "NO_SAFE_ROUTE" || !result.chosenExit || !result.directions) {
      resultBox.style.display = "none";
      this.callbacks.onClearNavigation();
      this.showWarning(
        `🚨 CRITICAL SAFETY ALERT: No safe evacuation route could be determined from ${result.startLocationName}!<br/><br/>` +
        `All eligible emergency exits are currently unreachable due to reported hazard zones. Do not traverse active hazard areas. Shelter in place and wait for responder instructions.`
      );

      // Populate alternative exits list with blocked reasons
      this.renderAlternativeExits(result.alternativeExits);
      return;
    }

    // Success: Safe route found
    resultBox.style.display = "block";
    resultBox.innerHTML = `
      <div style="font-weight:700; color:#2e7d32; font-size:14px; margin-bottom:4px;">
        ✅ Safe Evacuation Route Found
      </div>
      <div><b>Target Exit:</b> ${result.chosenExit.name}</div>
      <div><b>Building:</b> ${result.chosenExit.buildingName} (${result.chosenExit.floorName})</div>
      <div><b>Distance:</b> ${result.distanceMeters} meters (~${result.estimatedTimeSeconds} sec walk)</div>
      <div style="font-size:11px; color:#555; margin-top:4px;">Follow the highlighted safe path on map avoiding all reported hazards.</div>
    `;

    // Populate alternative exits
    this.renderAlternativeExits(result.alternativeExits);

    // Apply route to the map
    const destSpace = this.mapData.getById("space", result.chosenExit.spaceId);
    if (destSpace) {
      this.callbacks.setDestinationSpace(destSpace.id);
      this.callbacks.onRouteGenerated(result.directions, destSpace);
    }
  }

  private recalculateCurrentRoute() {
    const startSpace = this.callbacks.getCurrentStartSpace();
    if (!startSpace) return;

    // Check if an endSpace is currently chosen
    const endSpaceSelect = document.getElementById("endSpace") as HTMLSelectElement;
    const destSpaceId = endSpaceSelect ? endSpaceSelect.value : "";
    if (!destSpaceId) return;

    const destSpace = this.mapData.getById("space", destSpaceId);
    if (!destSpace) return;

    this.hideWarning();
    const safeDirections = safeRouteService.getSafeDirections(startSpace, destSpace, this.mapData);

    if (safeDirections) {
      this.showToast("Safe route updated with active hazard restrictions.");
      this.callbacks.onRouteGenerated(safeDirections, destSpace);
    } else {
      this.callbacks.onClearNavigation();
      this.showWarning(
        `⚠️ ACTIVE ROUTE BLOCKED: The current route to ${destSpace.name || destSpace.id} is blocked by reported hazards. No safe bypass found.`
      );
    }
  }

  private renderAlternativeExits(alternativeExits: NearestExitResult["alternativeExits"]) {
    const altExitsList = document.getElementById("alternativeExitsList");
    if (!altExitsList) return;

    if (!alternativeExits || alternativeExits.length === 0) {
      altExitsList.innerHTML = `<div style="color:#888;">No exits evaluated.</div>`;
      return;
    }

    altExitsList.innerHTML = alternativeExits
      .map((item) => {
        const statusBadge = item.isSafe
          ? `<span style="background:#e8f5e9; color:#2e7d32; padding:2px 6px; border-radius:4px; font-weight:700;">Reachable (${Math.round(item.distanceMeters)}m)</span>`
          : `<span style="background:#ffebee; color:#c62828; padding:2px 6px; border-radius:4px; font-weight:700;">Blocked / Unreachable</span>`;

        const actionBtn = item.isSafe
          ? `<button class="btn-route-exit" data-space="${item.exit.spaceId}" style="background:#1a73e8; color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">Route Here</button>`
          : "";

        return `
          <div style="background:#fff; border:1px solid ${item.isSafe ? "#c8e6c9" : "#ffcdd2"}; border-radius:6px; padding:6px 8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:600;">${item.exit.name}</span>
              ${statusBadge}
            </div>
            <div style="font-size:11px; color:#666; margin-top:2px;">
              ${item.exit.buildingName} · ${item.exit.floorName}
              ${item.routeBlockedReason ? `<div style="color:#d32f2f; margin-top:2px;">⚠️ ${item.routeBlockedReason}</div>` : ""}
            </div>
            ${actionBtn ? `<div style="margin-top:4px; text-align:right;">${actionBtn}</div>` : ""}
          </div>
        `;
      })
      .join("");

    // Wire up route buttons for alternative exits
    altExitsList.querySelectorAll(".btn-route-exit").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const spaceId = (e.currentTarget as HTMLElement).getAttribute("data-space");
        if (spaceId) {
          const startSpace = this.callbacks.getCurrentStartSpace();
          const targetSpace = this.mapData.getById("space", spaceId);
          if (startSpace && targetSpace) {
            this.callbacks.setDestinationSpace(spaceId);
            const safeDir = safeRouteService.getSafeDirections(startSpace, targetSpace, this.mapData);
            if (safeDir) {
              this.callbacks.onRouteGenerated(safeDir, targetSpace);
              this.showToast(`Routing to alternative exit: ${targetSpace.name || targetSpace.id}`);
            }
          }
        }
      });
    });
  }

  private updateActiveHazardsList() {
    const listEl = document.getElementById("activeHazardsList");
    const countEl = document.getElementById("activeHazardsCount");
    if (!listEl || !countEl) return;

    const active = hazardStore.getActiveHazards();
    countEl.textContent = String(active.length);

    if (active.length === 0) {
      listEl.innerHTML = `<div style="font-size:12px; color:#888; font-style:italic;">No active hazards reported.</div>`;
      return;
    }

    listEl.innerHTML = active
      .map((h) => `
        <div style="background:#fff; border:1px solid #ffab91; border-radius:6px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:700; color:#d84315; font-size:12px;">
              ${h.reason === "fire" ? "🔥" : h.reason === "smoke" ? "💨" : "⛔"} ${h.name}
            </div>
            <div style="font-size:11px; color:#666;">
              ${h.locationName} · ${h.severity.toUpperCase()} · ${h.reportedAt}
            </div>
          </div>
          <button class="btn-clear-hazard" data-id="${h.id}" style="background:#efebe9; color:#4e342e; border:1px solid #d7ccc8; padding:3px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">
            Clear
          </button>
        </div>
      `)
      .join("");

    listEl.querySelectorAll(".btn-clear-hazard").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute("data-id");
        if (id) {
          hazardStore.removeHazard(id);
          this.showToast(`Hazard ${id} cleared. Restoring route availability.`);
        }
      });
    });
  }

  renderMapMarkers() {
    // Clear previously added markers
    this.activeMarkers.forEach((m) => {
      try {
        this.mapView.Markers.remove(m);
      } catch (e) {
        // ignore
      }
    });
    this.activeMarkers = [];

    // 1. Add markers for verified entrances and emergency exits
    const allExits = exitRegistry.getAll();
    allExits.forEach((entry) => {
      const space = this.mapData.getById("space", entry.spaceId);
      const coord = space?.center || {
        latitude: entry.coordinates.latitude,
        longitude: entry.coordinates.longitude,
        floorId: entry.floorId,
      };

      const floor = this.mapData.getById("floor", entry.floorId);
      if (!floor) return;

      const markerNode = document.createElement("div");
      markerNode.className = "campusresq-map-marker";
      const isExit = entry.isEmergencyExit;
      const icon = isExit ? "🏃" : "🚪";
      const bg = isExit ? "#188038" : "#1a73e8";

      markerNode.innerHTML = `
        <div style="background:${bg}; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:15px; box-shadow:0 2px 6px rgba(0,0,0,0.35); border:2px solid #fff; cursor:pointer;" title="${entry.name} (${entry.verificationStatus})">
          ${icon}
        </div>
      `;

      markerNode.addEventListener("click", () => {
        alert(
          `📍 ${entry.name}\n` +
          `Building: ${entry.buildingName}\n` +
          `Floor: ${entry.floorName}\n` +
          `Classification: ${entry.locationType.toUpperCase()}\n` +
          `Emergency Exit: ${entry.isEmergencyExit ? "Eligible" : "Not Eligible"}\n` +
          `Verification Status: ${entry.verificationStatus.toUpperCase()}\n` +
          `Notes: ${entry.notes || "None"}`
        );
      });

      try {
        const marker = this.mapView.Markers.add(coord as any, markerNode.innerHTML, {
          anchor: "center",
        });
        if (marker) this.activeMarkers.push(marker);
      } catch (err) {
        // Fallback or ignore if coordinate is outside current view
      }
    });

    // 2. Add visual markers for active hazards
    const hazards = hazardStore.getActiveHazards();
    hazards.forEach((hazard) => {
      const coord = {
        latitude: hazard.coordinates.latitude,
        longitude: hazard.coordinates.longitude,
        floorId: hazard.floorId,
      };

      const markerNode = document.createElement("div");
      markerNode.innerHTML = `
        <div style="background:#d93025; color:#fff; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 0 12px #d93025; border:2px solid #fff; animation:pulse 1.5s infinite; cursor:pointer;" title="${hazard.name} (BLOCKED)">
          ${hazard.reason === "fire" ? "🔥" : hazard.reason === "smoke" ? "💨" : "⛔"}
        </div>
      `;

      markerNode.addEventListener("click", () => {
        alert(
          `⚠️ ACTIVE HAZARD: ${hazard.name}\n` +
          `Reason: ${hazard.reason.toUpperCase()}\n` +
          `Severity: ${hazard.severity.toUpperCase()}\n` +
          `Reported: ${hazard.reportedAt}\n` +
          `Status: ${hazard.status}\n` +
          `Location: ${hazard.locationName}`
        );
      });

      try {
        const marker = this.mapView.Markers.add(coord as any, markerNode.innerHTML, {
          anchor: "center",
        });
        if (marker) this.activeMarkers.push(marker);
      } catch (err) {
        // ignore
      }
    });
  }

  showReportHazardModal() {
    if (this.hazardModalEl) {
      this.hazardModalEl.style.display = "flex";
      return;
    }

    const modal = document.createElement("div");
    this.hazardModalEl = modal;
    modal.id = "hazardReportModal";
    Object.assign(modal.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10002",
      fontFamily: "inherit",
    });

    // Populate space options for hazard location picker
    const spaces = this.mapData.getByType("space").filter((s) => s.name);
    const spaceOptions = spaces
      .map((s) => `<option value="${s.id}">${s.name} (${s.floor?.name || "Level 1"})</option>`)
      .join("");

    modal.innerHTML = `
      <div style="background:#fff; border-radius:14px; padding:20px 24px; width:min(90%, 420px); box-shadow:0 8px 30px rgba(0,0,0,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h3 style="margin:0; font-size:17px; color:#d32f2f;">⚠️ Report Hazard / Blockage</h3>
          <button id="btnCloseHazardModal" style="background:none; border:none; font-size:18px; cursor:pointer;">✕</button>
        </div>

        <form id="hazardReportForm" style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#555; margin-bottom:4px;">Hazard Name / Description</label>
            <input id="hazName" type="text" value="Corridor Obstruction" style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:14px;" required />
          </div>

          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#555; margin-bottom:4px;">Hazard Reason</label>
            <select id="hazReason" style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:14px;">
              <option value="fire">🔥 Fire</option>
              <option value="smoke">💨 Smoke / Fumes</option>
              <option value="obstruction" selected>⛔ Physical Obstruction</option>
              <option value="waterlogging">💧 Waterlogging / Leak</option>
              <option value="structural">🏚️ Structural Damage</option>
            </select>
          </div>

          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#555; margin-bottom:4px;">Severity</label>
            <select id="hazSeverity" style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:14px;">
              <option value="blocked" selected>Blocked (Impassable — Cost Infinity)</option>
              <option value="unsafe">Unsafe (High Risk)</option>
            </select>
          </div>

          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#555; margin-bottom:4px;">Affected Mapped Space / Corridor</label>
            <select id="hazLocation" style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:14px;">
              ${spaceOptions}
            </select>
          </div>

          <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:8px;">
            <button type="button" id="btnCancelHazard" style="padding:8px 16px; border:1px solid #ccc; background:#fff; border-radius:6px; font-weight:600; cursor:pointer;">Cancel</button>
            <button type="submit" style="padding:8px 18px; border:none; background:#d32f2f; color:#fff; border-radius:6px; font-weight:700; cursor:pointer;">Submit Report</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector("#btnCloseHazardModal")!.addEventListener("click", () => (modal.style.display = "none"));
    modal.querySelector("#btnCancelHazard")!.addEventListener("click", () => (modal.style.display = "none"));

    modal.querySelector("#hazardReportForm")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = (modal.querySelector("#hazName") as HTMLInputElement).value;
      const reason = (modal.querySelector("#hazReason") as HTMLSelectElement).value as any;
      const severity = (modal.querySelector("#hazSeverity") as HTMLSelectElement).value as any;
      const spaceId = (modal.querySelector("#hazLocation") as HTMLSelectElement).value;

      const space = this.mapData.getById("space", spaceId);
      if (space && space.center) {
        const floorId = typeof space.floor === "string" ? space.floor : space.floor?.id || "m_c5bac871ab66226c";
        const newHazard = hazardStore.addHazard({
          name,
          reason,
          severity,
          locationName: space.name || spaceId,
          floorId,
          coordinates: {
            latitude: space.center.latitude,
            longitude: space.center.longitude,
          },
          status: "Confirmed",
        });

        // Also log incident in dashboard
        incidentService.createIncident({
          reportedLocation: `${space.name || spaceId} (${floorId})`,
          locationSpaceId: spaceId,
          incidentType: reason === "fire" ? "fire" : "hazard",
          hazardId: newHazard.id,
          severity: severity === "blocked" ? "critical" : "high",
          notes: `Hazard reported via user panel: ${name}`,
        });

        modal.style.display = "none";
        this.showToast(`Hazard reported at ${space.name}. Re-evaluating routes.`);
      }
    });
  }

  showIncidentDashboard() {
    if (this.incidentModalEl) {
      this.incidentModalEl.style.display = "flex";
      this.renderIncidentTable();
      return;
    }

    const modal = document.createElement("div");
    this.incidentModalEl = modal;
    modal.id = "incidentDashboardModal";
    Object.assign(modal.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10003",
      fontFamily: "inherit",
    });

    modal.innerHTML = `
      <div style="background:#fff; border-radius:14px; padding:22px; width:min(95%, 720px); max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 30px rgba(0,0,0,0.35);">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:12px;">
          <div>
            <h3 style="margin:0; font-size:18px; color:#1a1a1a;">📋 CampusResQ Incident & SOS Responder Dashboard</h3>
            <div style="font-size:11px; color:#666; margin-top:2px;">Local demonstration incident repository for hackathon responders</div>
          </div>
          <button id="btnCloseIncidentModal" style="background:none; border:none; font-size:20px; cursor:pointer;">✕</button>
        </div>

        <div style="flex:1; overflow-y:auto; margin:16px 0;">
          <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
            <thead>
              <tr style="background:#f5f5f5; border-bottom:2px solid #ddd;">
                <th style="padding:8px 10px;">ID</th>
                <th style="padding:8px 10px;">Type</th>
                <th style="padding:8px 10px;">Reported Location</th>
                <th style="padding:8px 10px;">Time</th>
                <th style="padding:8px 10px;">Status</th>
                <th style="padding:8px 10px; text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody id="incidentTableBody">
            </tbody>
          </table>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #eee; padding-top:12px;">
          <span style="font-size:11px; color:#888;">Workflow: New → Acknowledged → Responding → Resolved</span>
          <button id="btnResetIncidents" style="background:#f5f5f5; border:1px solid #ccc; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer;">Reset Demo Incidents</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector("#btnCloseIncidentModal")!.addEventListener("click", () => (modal.style.display = "none"));
    modal.querySelector("#btnResetIncidents")!.addEventListener("click", () => {
      incidentService.resetDemoStore();
      this.renderIncidentTable();
      this.showToast("Demo incident store reset to initial scenario.");
    });

    this.renderIncidentTable();
  }

  private renderIncidentTable() {
    const tbody = document.getElementById("incidentTableBody");
    if (!tbody) return;

    const incidents = incidentService.getAll();
    if (incidents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:14px; text-align:center; color:#888;">No incidents logged.</td></tr>`;
      return;
    }

    tbody.innerHTML = incidents
      .map((inc) => {
        let statusColor = "#e65100";
        if (inc.status === "Acknowledged") statusColor = "#1565c0";
        if (inc.status === "Responding") statusColor = "#6a1b9a";
        if (inc.status === "Resolved") statusColor = "#2e7d32";

        const nextStatus =
          inc.status === "New"
            ? "Acknowledged"
            : inc.status === "Acknowledged"
            ? "Responding"
            : inc.status === "Responding"
            ? "Resolved"
            : null;

        return `
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:8px 10px; font-weight:700;">${inc.id}</td>
            <td style="padding:8px 10px;">
              <span style="padding:2px 6px; border-radius:4px; font-size:11px; font-weight:700; ${inc.incidentType === "sos" ? "background:#ffebee; color:#c62828;" : "background:#e3f2fd; color:#0d47a1;"}">
                ${inc.incidentType.toUpperCase()}
              </span>
            </td>
            <td style="padding:8px 10px;">
              <b>${inc.reportedLocation}</b>
              ${inc.notes ? `<div style="font-size:11px; color:#666;">${inc.notes}</div>` : ""}
            </td>
            <td style="padding:8px 10px; color:#555;">${inc.timeReported}</td>
            <td style="padding:8px 10px;">
              <span style="color:${statusColor}; font-weight:700;">${inc.status}</span>
            </td>
            <td style="padding:8px 10px; text-align:right;">
              <div style="display:flex; gap:4px; justify-content:flex-end;">
                ${
                  inc.locationSpaceId
                    ? `<button class="btn-navigate-incident" data-space="${inc.locationSpaceId}" style="background:#1a73e8; color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">Navigate</button>`
                    : ""
                }
                ${
                  nextStatus
                    ? `<button class="btn-advance-status" data-id="${inc.id}" data-next="${nextStatus}" style="background:#f5f5f5; border:1px solid #ccc; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">→ ${nextStatus}</button>`
                    : ""
                }
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    // Wire up buttons
    tbody.querySelectorAll(".btn-navigate-incident").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const spaceId = (e.currentTarget as HTMLElement).getAttribute("data-space");
        if (spaceId) {
          this.incidentModalEl.style.display = "none";
          this.callbacks.setDestinationSpace(spaceId);
          this.showToast(`Selected incident location as destination. Choose your starting point and click Generate.`);
        }
      });
    });

    tbody.querySelectorAll(".btn-advance-status").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute("data-id")!;
        const next = (e.currentTarget as HTMLElement).getAttribute("data-next")! as any;
        incidentService.updateStatus(id, next);
        this.renderIncidentTable();
      });
    });
  }

  resetDemo() {
    hazardStore.clearAll();
    exitRegistry.reset();
    incidentService.resetDemoStore();
    this.hideWarning();
    const resultBox = document.getElementById("nearestExitResult");
    if (resultBox) resultBox.style.display = "none";
    this.callbacks.onClearNavigation();
    this.renderMapMarkers();
    this.updateActiveHazardsList();
    this.showToast("CampusResQ demo scenario reset to initial state.");
  }

  private showWarning(htmlText: string) {
    const box = document.getElementById("emergencyWarningBox");
    if (box) {
      box.innerHTML = htmlText;
      box.style.display = "block";
    }
  }

  private hideWarning() {
    const box = document.getElementById("emergencyWarningBox");
    if (box) box.style.display = "none";
  }

  private showToast(msg: string) {
    let toast = document.getElementById("campusresq-toast") as HTMLDivElement;
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "campusresq-toast";
      Object.assign(toast.style, {
        position: "fixed",
        bottom: "60px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(20, 20, 20, 0.92)",
        color: "#fff",
        padding: "10px 20px",
        borderRadius: "8px",
        fontSize: "13px",
        fontWeight: "600",
        zIndex: "10004",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        transition: "opacity 0.2s",
        pointerEvents: "none",
      });
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = "block";
    toast.style.opacity = "1";
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => (toast.style.display = "none"), 200);
    }, 2800);
  }
}

export const emergencyPanel = new EmergencyPanel();
