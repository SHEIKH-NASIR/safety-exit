import { MapData, MapView, Space, Door } from "@mappedin/mappedin-js";
import { exitRegistry } from "./exitRegistry";
import { hazardStore, CONFIGURED_BUILDINGS } from "./hazardStore";
import { safeRouteService } from "./safeRouteService";
import { incidentService } from "./incidentService";
import {
  BuildingChoice,
  BuildingEntranceExit,
  DemoScenario,
  Hazard,
  LocationRestrictionType,
  NearestExitResult,
} from "./types";

export interface EmergencyPanelCallbacks {
  onRouteGenerated: (directions: any, destinationSpace: Space | Door) => void;
  onClearNavigation: () => void;
  getCurrentStartSpace: () => Space | Door | undefined;
  setDestinationSpace: (spaceId: string) => void;
  setStartSpace: (spaceId: string) => void;
  onBuildingChanged?: (buildingId: string) => void;
  getCurrentBuildingId?: () => string;
}

export class EmergencyPanel {
  private isEmergencyMode = false;
  private isCollapsed = false;
  private currentBuildingId: string = "fs_6878b1ed316caa000b260be2"; // Default: Office Building 1

  private mapData!: MapData;
  private mapView!: MapView;
  private callbacks!: EmergencyPanelCallbacks;

  private toggleButton!: HTMLButtonElement;
  private panelEl!: HTMLElement;
  private reopenButton!: HTMLButtonElement;
  private legendEl!: HTMLElement;
  private incidentModalEl!: HTMLElement;

  private activeMarkers: any[] = [];
  private coloredHazardSpaces: Set<Space> = new Set();
  private previewSpaceIds: Set<string> = new Set();
  private previewMarker: any = null;
  private unsubscribeHazardStore?: () => void;

  init(mapData: MapData, mapView: MapView, callbacks: EmergencyPanelCallbacks) {
    this.mapData = mapData;
    this.mapView = mapView;
    this.callbacks = callbacks;
    if (callbacks.getCurrentBuildingId) {
      this.currentBuildingId = callbacks.getCurrentBuildingId();
    }

    this.createUI();
    this.renderMapMarkers();

    // Subscribe to hazard updates to re-render markers, color spaces, and update active hazard lists
    this.unsubscribeHazardStore = hazardStore.subscribe(() => {
      this.renderMapMarkers();
      this.updateActiveHazardsList();
    });

    // Handle SOS link parameter if present in URL
    this.checkSosUrlParams();
  }

  isEmergencyModeActive(): boolean {
    return this.isEmergencyMode;
  }

  getIsCollapsed(): boolean {
    return this.isCollapsed;
  }

  getCurrentBuildingId(): string {
    return this.currentBuildingId;
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

    // 2. Floating Reopen Button for collapsed emergency panel
    this.reopenButton = document.createElement("button");
    this.reopenButton.id = "emergencyPanelReopenBtn";
    this.reopenButton.innerHTML = `🚨 Open Emergency Panel`;
    this.reopenButton.title = "Restore CampusResQ Emergency Evacuation Panel";
    this.reopenButton.onclick = () => this.expand();
    Object.assign(this.reopenButton.style, {
      position: "fixed",
      top: "64px",
      right: "12px",
      zIndex: "34",
      background: "linear-gradient(135deg, #d93025, #b71c1c)",
      color: "#ffffff",
      border: "none",
      borderRadius: "999px",
      padding: "8px 14px",
      fontSize: "13px",
      fontWeight: "700",
      boxShadow: "0 4px 16px rgba(217, 48, 37, 0.5)",
      cursor: "pointer",
      display: "none",
      alignItems: "center",
      gap: "6px",
      transition: "all 0.25s ease",
    });
    document.body.appendChild(this.reopenButton);

    // 3. Emergency Floating Panel Container
    this.panelEl = document.createElement("div");
    this.panelEl.id = "emergencyControlPanel";
    this.panelEl.className = "emergency-panel";
    Object.assign(this.panelEl.style, {
      position: "fixed",
      top: "64px",
      right: "12px",
      width: "380px",
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
      transition: "transform 0.28s ease, opacity 0.28s ease",
    });

    this.renderPanelContent();
    document.body.appendChild(this.panelEl);

    // 4. Map Legend Widget
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
      <span style="display:flex; align-items:center; gap:4px;"><span style="color:#188038; font-size:14px;">🏃</span> Safe Exit</span>
      <span style="display:flex; align-items:center; gap:4px;"><span style="color:#d93025; font-size:14px;">⛔</span> Blocked Hazard</span>
    `;
    document.body.appendChild(this.legendEl);

    // CSS Styles
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      .emergency-panel.collapsed {
        transform: translateX(calc(100% + 24px)) !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      @media (max-width: 899.98px) {
        #emergencyModeToggle {
          top: 10px !important;
          right: 90px !important;
          font-size: 12px !important;
          padding: 8px 12px !important;
        }
        #emergencyPanelReopenBtn {
          top: 54px !important;
          right: 10px !important;
          font-size: 11px !important;
          padding: 6px 10px !important;
        }
        #emergencyControlPanel {
          left: 10px !important;
          right: 10px !important;
          width: auto !important;
          max-width: none !important;
          top: 54px !important;
          max-height: 65vh !important;
        }
        .emergency-panel.collapsed {
          transform: translateY(-120%) !important;
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
      .quick-reason-btn {
        background: #f1f5f9;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        padding: 3px 6px;
        font-size: 11px;
        cursor: pointer;
        color: #334155;
      }
      .quick-reason-btn:hover {
        background: #e2e8f0;
      }
    `;
    document.head.appendChild(styleEl);
  }

  collapse() {
    if (!this.isEmergencyMode) return;
    this.isCollapsed = true;
    this.panelEl.classList.add("collapsed");
    this.reopenButton.style.display = "flex";
  }

  expand() {
    if (!this.isEmergencyMode) {
      this.setEmergencyMode(true);
    }
    this.isCollapsed = false;
    this.panelEl.classList.remove("collapsed");
    this.reopenButton.style.display = "none";
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
      this.expand();
      this.showToast("🚨 CampusResQ Emergency Mode Activated");
      this.renderMapMarkers();
      this.updateActiveHazardsList();
      this.renderScenarios();
      this.populateCustomHazardFormOptions();
    } else {
      this.toggleButton.style.background = "#d93025";
      this.toggleButton.innerHTML = `<span class="pulse-icon">🚨</span> Emergency Mode`;
      this.panelEl.style.display = "none";
      this.reopenButton.style.display = "none";
      this.hideWarning();
      this.clearPreviewHighlight();
      this.renderMapMarkers();
      this.showToast("Normal Navigation Restored");
    }
  }

  private renderPanelContent() {
    this.panelEl.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #ffcdd2; padding-bottom:8px;">
        <div style="font-weight:800; font-size:15px; color:#b71c1c; display:flex; align-items:center; gap:6px;">
          <span>🚨</span> CampusResQ Emergency & SOS
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:10px; background:#ffebee; color:#c62828; padding:3px 6px; border-radius:10px; font-weight:700;">EVACUATION</span>
          <button id="btnMinimizePanel" title="Minimize Panel" style="background:#f5f5f5; border:1px solid #ddd; border-radius:50%; width:24px; height:24px; cursor:pointer; font-weight:bold; font-size:12px; display:flex; align-items:center; justify-content:center; color:#555;">—</button>
        </div>
      </div>

      <!-- Simulated Demo Notice Badge -->
      <div style="background:#fff3e0; border:1px solid #ffe0b2; border-radius:8px; padding:6px 10px; font-size:11px; display:flex; align-items:center; gap:6px; color:#e65100; font-weight:600;">
        <span>🧪</span>
        <span><b>SIMULATED DEMO MODE</b> — SI-03 Hackathon Showcase</span>
      </div>

      <!-- Active Building Selector -->
      <div style="background:#f8f9fa; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <label for="buildingSelector" style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase;">
            🏛️ Selected Building / Map
          </label>
          <span id="activeHazardsCountBadge" style="font-size:10px; background:#d93025; color:#fff; padding:1px 6px; border-radius:10px; font-weight:700;">0 Hazards</span>
        </div>
        <select id="buildingSelector" style="width:100%; padding:8px 10px; font-size:13px; font-weight:600; border:1px solid #cbd5e1; border-radius:6px; background:#ffffff; color:#1e293b; cursor:pointer;">
          ${CONFIGURED_BUILDINGS.map(
            (b) => `<option value="${b.id}" ${b.id === this.currentBuildingId ? "selected" : ""}>${b.name}</option>`
          ).join("")}
        </select>
        <div id="buildingActiveIndicator" style="font-size:11px; color:#0369a1; font-weight:600; margin-top:6px; display:flex; align-items:center; gap:4px;">
          <span>📍</span> <span>Selected: Main Building / School (Level 1)</span>
        </div>
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

      <!-- Quick Emergency Actions -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
        <button id="btnRecalculateRoute" style="background:#e3f2fd; color:#0d47a1; border:1px solid #bbdefb; padding:8px 10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
          <span>🔄</span> Recalculate Route
        </button>
        <button id="btnIncidentDashboard" style="background:#f3e5f5; color:#6a1b9a; border:1px solid #e1bee7; padding:8px 10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
          <span>📋</span> Incident Dashboard
        </button>
      </div>

      <!-- MANAGE HAZARDS & RESTRICTIONS (CUSTOM DYNAMIC HAZARD SECTION) -->
      <div style="background:#fff5f5; border:1.5px solid #fecaca; border-radius:10px; padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="font-size:12px; font-weight:800; color:#991b1b; display:flex; align-items:center; gap:4px;">
            <span>⚠️</span> Manage Hazards & Restrictions
          </div>
          <span style="font-size:10px; background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:6px; font-weight:700;">CUSTOM</span>
        </div>

        <form id="customHazardForm" style="display:flex; flex-direction:column; gap:8px;">
          <!-- 1. Building Selector -->
          <div>
            <label style="display:block; font-size:11px; font-weight:700; color:#475569; margin-bottom:2px;">1. Target Building</label>
            <select id="hazBuildingSelect" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff;">
              ${CONFIGURED_BUILDINGS.map(
                (b) => `<option value="${b.id}" ${b.id === this.currentBuildingId ? "selected" : ""}>${b.name}</option>`
              ).join("")}
            </select>
          </div>

          <!-- 2. Floor Selector -->
          <div>
            <label style="display:block; font-size:11px; font-weight:700; color:#475569; margin-bottom:2px;">2. Target Floor</label>
            <select id="hazFloorSelect" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff;">
            </select>
          </div>

          <!-- 3. Location Type Selector -->
          <div>
            <label style="display:block; font-size:11px; font-weight:700; color:#475569; margin-bottom:2px;">3. Location Type to Restrict</label>
            <select id="hazTypeSelect" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff;">
              <option value="room" selected>🚪 Room (Classroom, Office, Lab, Washroom)</option>
              <option value="corridor">🚶 Corridor / Hallway</option>
              <option value="exit">🏃 Emergency Exit / Entrance</option>
              <option value="floor">🏢 Entire Floor</option>
              <option value="area">📍 Other Mapped Area</option>
            </select>
          </div>

          <!-- 4. Location Selector (Dynamically Populated) -->
          <div>
            <label style="display:block; font-size:11px; font-weight:700; color:#475569; margin-bottom:2px;">4. Specific Location</label>
            <select id="hazLocationSelect" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff;">
            </select>
          </div>

          <!-- 5. Reason -->
          <div>
            <label style="display:block; font-size:11px; font-weight:700; color:#475569; margin-bottom:2px;">5. Reason for Restriction</label>
            <input id="hazReasonInput" type="text" placeholder="e.g. Fire and heavy smoke" value="Fire and heavy smoke" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;" required />
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
              <button type="button" class="quick-reason-btn" data-reason="Fire and heavy smoke">🔥 Fire</button>
              <button type="button" class="quick-reason-btn" data-reason="Toxic smoke / Gas fumes">💨 Gas Leak</button>
              <button type="button" class="quick-reason-btn" data-reason="Debris and ceiling collapse">⛔ Debris</button>
              <button type="button" class="quick-reason-btn" data-reason="Severe waterlogging / pipe burst">💧 Water</button>
              <button type="button" class="quick-reason-btn" data-reason="Unsafe structural damage">🏚️ Structural</button>
            </div>
          </div>

          <!-- 6. Severity -->
          <div>
            <label style="display:block; font-size:11px; font-weight:700; color:#475569; margin-bottom:2px;">6. Restriction Severity</label>
            <select id="hazSeveritySelect" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff;">
              <option value="blocked" selected>Blocked (Impassable — Cost Infinity)</option>
              <option value="unsafe">Unsafe (High Risk Warning)</option>
            </select>
          </div>

          <!-- 7. Action Button -->
          <button type="submit" id="btnActivateHazard" style="margin-top:4px; background:#dc2626; color:#ffffff; border:none; padding:10px 12px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 2px 6px rgba(220, 38, 38, 0.4);">
            <span>🚫</span> Block Location / Activate Hazard
          </button>
        </form>
      </div>

      <!-- Active Hazards Section -->
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:12px; font-weight:800; color:#475569;">ACTIVE HAZARDS & RESTRICTIONS:</span>
          <button id="btnClearAllBuildingHazards" style="background:#f1f5f9; color:#b91c1c; border:1px solid #fecaca; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;">
            Clear All in Building
          </button>
        </div>
        <div id="activeHazardsList" style="max-height:160px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
          <div style="font-size:12px; color:#888; font-style:italic;">No active hazards reported for this building.</div>
        </div>
      </div>

      <!-- Building Demo Scenarios Preset Section -->
      <div style="background:#fafafa; border:1px solid #eee; border-radius:10px; padding:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#666;">
            🧪 Demo Scenarios (Presets)
          </div>
          <span id="scenarioCountBadge" style="font-size:10px; background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:8px; font-weight:700;">3 Presets</span>
        </div>
        <div id="buildingScenariosList" style="display:flex; flex-direction:column; gap:8px;">
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
    this.panelEl.querySelector("#btnMinimizePanel")!.addEventListener("click", () => this.collapse());
    this.panelEl.querySelector("#btnFindNearestExit")!.addEventListener("click", () => this.handleFindNearestExit());
    this.panelEl.querySelector("#btnRecalculateRoute")!.addEventListener("click", () => this.recalculateCurrentRoute());
    this.panelEl.querySelector("#btnIncidentDashboard")!.addEventListener("click", () => this.showIncidentDashboard());

    this.panelEl.querySelector("#btnClearAllBuildingHazards")!.addEventListener("click", () => {
      hazardStore.clearHazardsForBuilding(this.currentBuildingId);
      this.clearPreviewHighlight();
      this.renderMapMarkers();
      this.updateActiveHazardsList();
      this.showToast("All active hazards cleared for this building.");
    });

    const buildingSelect = this.panelEl.querySelector("#buildingSelector") as HTMLSelectElement;
    buildingSelect.addEventListener("change", (e) => {
      const selectedId = (e.target as HTMLSelectElement).value;
      this.selectBuilding(selectedId, false);
      if (this.callbacks.onBuildingChanged) {
        this.callbacks.onBuildingChanged(selectedId);
      }
    });

    // Wire up Custom Hazard Form
    this.setupCustomHazardForm();

    this.updateBuildingUI();
    this.renderScenarios();
  }

  private setupCustomHazardForm() {
    const hazBuilding = this.panelEl.querySelector("#hazBuildingSelect") as HTMLSelectElement;
    const hazFloor = this.panelEl.querySelector("#hazFloorSelect") as HTMLSelectElement;
    const hazType = this.panelEl.querySelector("#hazTypeSelect") as HTMLSelectElement;
    const hazLocation = this.panelEl.querySelector("#hazLocationSelect") as HTMLSelectElement;
    const hazReasonInput = this.panelEl.querySelector("#hazReasonInput") as HTMLInputElement;
    const hazForm = this.panelEl.querySelector("#customHazardForm") as HTMLFormElement;

    if (!hazBuilding || !hazFloor || !hazType || !hazLocation || !hazForm) return;

    // Quick reason suggestion buttons
    this.panelEl.querySelectorAll(".quick-reason-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const reason = (e.currentTarget as HTMLElement).getAttribute("data-reason");
        if (reason && hazReasonInput) {
          hazReasonInput.value = reason;
        }
      });
    });

    hazBuilding.addEventListener("change", () => {
      this.populateCustomHazardFloors();
      this.populateCustomHazardLocations();
      this.updatePreviewHighlight();
    });

    hazFloor.addEventListener("change", () => {
      const floorId = hazFloor.value;
      if (floorId && floorId !== "all" && this.mapView.currentFloor?.id !== floorId) {
        try {
          this.mapView.setFloor(floorId);
        } catch {}
      }
      this.populateCustomHazardLocations();
      this.updatePreviewHighlight();
    });

    hazType.addEventListener("change", () => {
      this.populateCustomHazardLocations();
      this.updatePreviewHighlight();
    });

    hazLocation.addEventListener("change", () => {
      this.updatePreviewHighlight();
    });

    hazForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleActivateCustomHazard();
    });

    this.populateCustomHazardFormOptions();
  }

  private populateCustomHazardFormOptions() {
    const hazBuilding = this.panelEl.querySelector("#hazBuildingSelect") as HTMLSelectElement;
    if (hazBuilding) {
      hazBuilding.value = this.currentBuildingId;
    }
    this.populateCustomHazardFloors();
    this.populateCustomHazardLocations();
    this.updatePreviewHighlight();
  }

  private populateCustomHazardFloors() {
    const hazBuilding = this.panelEl.querySelector("#hazBuildingSelect") as HTMLSelectElement;
    const hazFloor = this.panelEl.querySelector("#hazFloorSelect") as HTMLSelectElement;
    if (!hazBuilding || !hazFloor) return;

    const bId = hazardStore.normalizeBuildingId(hazBuilding.value);
    const building = CONFIGURED_BUILDINGS.find((b) => hazardStore.normalizeBuildingId(b.id) === bId) || CONFIGURED_BUILDINGS[0];

    hazFloor.innerHTML = "";
    (building.floors || [{ id: building.floorId, name: building.floorName }]).forEach((fl) => {
      const opt = document.createElement("option");
      opt.value = fl.id;
      opt.textContent = fl.name;
      hazFloor.appendChild(opt);
    });

    // Allow selecting "Entire Floor" or "All Floors"
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "Entire Building (All Floors)";
    hazFloor.appendChild(allOpt);
  }

  private populateCustomHazardLocations() {
    const hazBuilding = this.panelEl.querySelector("#hazBuildingSelect") as HTMLSelectElement;
    const hazFloor = this.panelEl.querySelector("#hazFloorSelect") as HTMLSelectElement;
    const hazType = this.panelEl.querySelector("#hazTypeSelect") as HTMLSelectElement;
    const hazLocation = this.panelEl.querySelector("#hazLocationSelect") as HTMLSelectElement;
    if (!hazBuilding || !hazFloor || !hazType || !hazLocation) return;

    const bId = hazardStore.normalizeBuildingId(hazBuilding.value);
    const floorId = hazFloor.value;
    const locType = hazType.value as LocationRestrictionType;

    hazLocation.innerHTML = "";

    if (locType === "floor") {
      const opt = document.createElement("option");
      opt.value = floorId === "all" ? "all" : floorId;
      opt.textContent = floorId === "all" ? "Entire Building (All Floors)" : `Current Floor (${floorId})`;
      hazLocation.appendChild(opt);
      return;
    }

    if (locType === "exit" || locType === "entrance") {
      const exits = exitRegistry.getAll().filter((e) => {
        const matchB = hazardStore.normalizeBuildingId(e.buildingId) === bId;
        const matchF = floorId === "all" || e.floorId === floorId;
        return matchB && matchF;
      });

      if (exits.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No exterior doors registered on this floor";
        hazLocation.appendChild(opt);
      } else {
        exits.forEach((ex) => {
          const opt = document.createElement("option");
          opt.value = ex.doorId;
          opt.textContent = `${ex.isEmergencyExit ? "🏃 [Exit]" : "🚪 [Entrance]"} ${ex.name}`;
          hazLocation.appendChild(opt);
        });
      }
      return;
    }

    // Otherwise: rooms, corridors, or areas from mapData
    const allSpaces = this.mapData.getByType("space").filter((s) => {
      const sFloorId = typeof s.floor === "string" ? s.floor : s.floor?.id;
      if (floorId !== "all" && sFloorId !== floorId) return false;
      return true;
    });

    let filtered = allSpaces;
    if (locType === "corridor") {
      filtered = allSpaces.filter((s) => {
        const name = (s.name || "").toLowerCase();
        return (
          name.includes("corridor") ||
          name.includes("hall") ||
          name.includes("passage") ||
          name.includes("lobby") ||
          name.includes("court") ||
          name.includes("break")
        );
      });
      // Fallback: if no corridor has specific name, include all spaces
      if (filtered.length === 0) filtered = allSpaces;
    } else if (locType === "room") {
      filtered = allSpaces.filter((s) => {
        const name = (s.name || "").toLowerCase();
        return (
          name.startsWith("classroom") ||
          name.startsWith("office") ||
          name.includes("lab") ||
          name.includes("bed") ||
          name.includes("washroom") ||
          name.includes("kitchen") ||
          name.includes("room")
        );
      });
      if (filtered.length === 0) filtered = allSpaces;
    }

    if (filtered.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No spaces found on this floor";
      hazLocation.appendChild(opt);
    } else {
      filtered.forEach((sp) => {
        const opt = document.createElement("option");
        opt.value = sp.id;
        opt.textContent = sp.name ? `${sp.name} (${sp.id.slice(-6)})` : `Space (${sp.id})`;
        hazLocation.appendChild(opt);
      });
    }
  }

  private getActiveBlockedSpaceIds(): Set<string> {
    const active = hazardStore.getActiveHazards();
    const set = new Set<string>();
    for (const h of active) {
      if (
        h.locationId &&
        (h.locationType === "room" ||
          h.locationType === "corridor" ||
          h.locationType === "area")
      ) {
        set.add(h.locationId);
      } else if (h.locationType === "floor") {
        const targetFl = h.locationId || h.floorId;
        const flSpaces = this.mapData
          .getByType("space")
          .filter((s) => s.floor?.id === targetFl);
        for (const sp of flSpaces) set.add(sp.id);
      }
    }
    return set;
  }

  clearPreviewHighlight() {
    const activeIds = this.getActiveBlockedSpaceIds();
    this.previewSpaceIds.forEach((spId) => {
      if (!activeIds.has(spId)) {
        const sp = this.mapData.getById("space", spId);
        if (sp) {
          try {
            this.mapView.updateState(sp, { color: "initial" });
          } catch {}
          this.coloredHazardSpaces.delete(sp);
        }
      }
    });
    this.previewSpaceIds.clear();

    if (this.previewMarker) {
      try {
        this.mapView.Markers.remove(this.previewMarker);
      } catch {}
      this.previewMarker = null;
    }
  }

  updatePreviewHighlight() {
    this.clearPreviewHighlight();

    if (!this.panelEl) return;
    const hazFloor = this.panelEl.querySelector("#hazFloorSelect") as HTMLSelectElement;
    const hazType = this.panelEl.querySelector("#hazTypeSelect") as HTMLSelectElement;
    const hazLocation = this.panelEl.querySelector("#hazLocationSelect") as HTMLSelectElement;

    if (!hazFloor || !hazType || !hazLocation || !hazLocation.value) return;

    const floorId = hazFloor.value;
    const locType = hazType.value as LocationRestrictionType;
    const locId = hazLocation.value;

    if (locType === "floor") {
      const targetFloor = floorId === "all" ? this.mapView.currentFloor?.id : floorId;
      const flSpaces = this.mapData
        .getByType("space")
        .filter((s) => s.floor?.id === targetFloor);

      flSpaces.forEach((sp) => {
        try {
          this.mapView.updateState(sp, { color: "#ff1744" });
          this.previewSpaceIds.add(sp.id);
          this.coloredHazardSpaces.add(sp);
        } catch {}
      });

      const firstSpace = flSpaces.find((s) => s.center);
      if (firstSpace && firstSpace.center) {
        const markerNode = document.createElement("div");
        markerNode.innerHTML = `
          <div style="background:#ff1744; color:#fff; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700; border:2px dashed #fff; box-shadow:0 0 12px rgba(255,23,68,0.85); animation:pulse 1.2s infinite;">
            🏢 PREVIEW: Block Entire Floor (${firstSpace.floor?.name || targetFloor})
          </div>
        `;
        try {
          this.previewMarker = this.mapView.Markers.add(
            {
              latitude: firstSpace.center.latitude,
              longitude: firstSpace.center.longitude,
              floorId: targetFloor,
            } as any,
            markerNode.innerHTML,
            { anchor: "center" }
          );
        } catch {}
      }
      return;
    }

    if (locType === "exit" || locType === "entrance") {
      const door = this.mapData.getById("door", locId);
      const exitEntry = exitRegistry.getByDoorId(locId);
      const doorName = exitEntry?.name || door?.name || locId;

      if (door && door.center) {
        const markerNode = document.createElement("div");
        markerNode.innerHTML = `
          <div style="background:#ff1744; color:#fff; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700; border:2px dashed #fff; box-shadow:0 0 12px rgba(255,23,68,0.85); animation:pulse 1.2s infinite; cursor:pointer;" title="Preview: ${doorName}">
            🚫 PREVIEW: Block Exit/Door (${doorName})
          </div>
        `;
        try {
          this.previewMarker = this.mapView.Markers.add(
            {
              latitude: door.center.latitude,
              longitude: door.center.longitude,
              floorId: door.floor?.id,
            } as any,
            markerNode.innerHTML,
            { anchor: "center" }
          );
        } catch {}
      }
      return;
    }

    // Room / Corridor / Other Mapped Space
    const space = this.mapData.getById("space", locId);
    if (space) {
      try {
        this.mapView.updateState(space, { color: "#ff1744" });
        this.previewSpaceIds.add(space.id);
        this.coloredHazardSpaces.add(space);
      } catch {}

      if (space.center) {
        const markerNode = document.createElement("div");
        const label = space.name || locId;
        markerNode.innerHTML = `
          <div style="background:#ff1744; color:#fff; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700; border:2px dashed #fff; box-shadow:0 0 12px rgba(255,23,68,0.85); animation:pulse 1.2s infinite; cursor:pointer;" title="Preview: ${label}">
            ⚠️ PREVIEW: ${label}
          </div>
        `;
        try {
          this.previewMarker = this.mapView.Markers.add(
            {
              latitude: space.center.latitude,
              longitude: space.center.longitude,
              floorId: space.floor?.id,
            } as any,
            markerNode.innerHTML,
            { anchor: "center" }
          );
        } catch {}
      }
    }
  }

  private handleActivateCustomHazard() {
    const hazBuilding = this.panelEl.querySelector("#hazBuildingSelect") as HTMLSelectElement;
    const hazFloor = this.panelEl.querySelector("#hazFloorSelect") as HTMLSelectElement;
    const hazType = this.panelEl.querySelector("#hazTypeSelect") as HTMLSelectElement;
    const hazLocation = this.panelEl.querySelector("#hazLocationSelect") as HTMLSelectElement;
    const hazReasonInput = this.panelEl.querySelector("#hazReasonInput") as HTMLInputElement;
    const hazSeveritySelect = this.panelEl.querySelector("#hazSeveritySelect") as HTMLSelectElement;

    if (!hazLocation.value) {
      alert("Please select a valid location to restrict!");
      return;
    }

    const buildingId = hazBuilding.value;
    const floorId = hazFloor.value;
    const locationType = hazType.value as LocationRestrictionType;
    const locationId = hazLocation.value;
    const reason = hazReasonInput.value.trim() || "Emergency Hazard";
    const severity = (hazSeveritySelect.value as any) || "blocked";

    const building = CONFIGURED_BUILDINGS.find((b) => hazardStore.normalizeBuildingId(b.id) === hazardStore.normalizeBuildingId(buildingId)) || CONFIGURED_BUILDINGS[0];

    let coordinates = { latitude: 0, longitude: 0 };
    let locationName = hazLocation.options[hazLocation.selectedIndex]?.text || locationId;
    let radiusMeters = 5.0;
    let polygon = undefined;

    if (locationType === "floor") {
      locationName = floorId === "all" ? `${building.name} (All Floors)` : `Floor ${floorId}`;
      const firstSpace = this.mapData.getByType("space").find((s) => s.floor?.id === floorId && s.center);
      if (firstSpace && firstSpace.center) {
        coordinates = { latitude: firstSpace.center.latitude, longitude: firstSpace.center.longitude };
      }
      radiusMeters = 50.0;
    } else if (locationType === "exit" || locationType === "entrance") {
      const door = this.mapData.getById("door", locationId);
      const exitEntry = exitRegistry.getByDoorId(locationId);
      if (exitEntry) locationName = exitEntry.name;
      if (door && door.center) {
        coordinates = { latitude: door.center.latitude, longitude: door.center.longitude };
      }
      radiusMeters = 4.5;
    } else {
      const space = this.mapData.getById("space", locationId);
      if (space) {
        if (space.center) {
          coordinates = { latitude: space.center.latitude, longitude: space.center.longitude };
        }
        locationName = space.name || locationId;
        if (space.geoJSON) {
          polygon = space.geoJSON;
        }
      }
      radiusMeters = locationType === "corridor" ? 6.0 : 5.5;
    }

    const hazardName = `${locationName} — ${reason}`;

    // Clear unconfirmed preview highlight before locking into confirmed active hazard
    this.clearPreviewHighlight();

    // Add to hazardStore
    hazardStore.addCustomHazard({
      name: hazardName,
      buildingId,
      buildingName: building.name,
      floorId: floorId === "all" ? building.floorId : floorId,
      floorName: floorId === "all" ? "All Floors" : building.floorName,
      locationType,
      locationId,
      locationName,
      reason,
      severity,
      coordinates,
      radiusMeters,
      polygon,
      status: "Confirmed",
    });

    // Log incident in dashboard
    incidentService.createIncident({
      reportedLocation: `${locationName} (${building.name})`,
      locationSpaceId: locationId,
      incidentType: reason.toLowerCase().includes("fire") ? "fire" : "hazard",
      severity: "critical",
      notes: `Custom restriction: ${reason}`,
    });

    // Lock location in permanent red and render map markers
    this.renderMapMarkers();
    this.updateActiveHazardsList();

    this.showToast(`🚫 Restriction Activated: ${locationName} is now BLOCKED (${reason})!`);
  }

  selectBuilding(buildingId: string, runFirstScenario: boolean = false) {
    const normId = hazardStore.normalizeBuildingId(buildingId);
    const building =
      CONFIGURED_BUILDINGS.find((b) => hazardStore.normalizeBuildingId(b.id) === normId) ||
      CONFIGURED_BUILDINGS[0];

    this.currentBuildingId = building.id;

    // 1. Switch floor in MapView
    if (this.mapView && building.floorId) {
      if (this.mapView.currentFloor?.id !== building.floorId) {
        this.mapView.setFloor(building.floorId);
      }
      try {
        const coord = this.mapView.createCoordinate(
          building.center ? (building as any).center.latitude : 43.4651,
          building.center ? (building as any).center.longitude : -80.5242
        );
        this.mapView.Camera.animateTo({ center: coord, zoomLevel: 25 }, { duration: 600 });
      } catch {
        // ignore
      }
    }

    // 2. Clear old hazards & navigation state
    this.callbacks.onClearNavigation();
    this.hideWarning();
    const resultBox = document.getElementById("nearestExitResult");
    if (resultBox) resultBox.style.display = "none";

    // 3. Set start location in route picker to building default
    this.callbacks.setStartSpace(building.defaultStartSpaceId);

    // 4. Update UI indicator, custom hazard options, and refresh scenario list
    this.updateBuildingUI();
    this.populateCustomHazardFormOptions();
    this.renderScenarios();
    this.renderMapMarkers();
    this.updateActiveHazardsList();

    this.showToast(`Switched to ${building.name}. Start set to ${building.defaultStartSpaceName}.`);

    if (runFirstScenario) {
      const scenarios = hazardStore.getScenariosForBuilding(this.currentBuildingId);
      if (scenarios.length > 0) {
        this.runScenario(scenarios[0]);
      }
    }
  }

  private updateBuildingUI() {
    const buildingSelect = this.panelEl.querySelector("#buildingSelector") as HTMLSelectElement;
    if (buildingSelect && buildingSelect.value !== this.currentBuildingId) {
      buildingSelect.value = this.currentBuildingId;
    }

    const hazBuilding = this.panelEl.querySelector("#hazBuildingSelect") as HTMLSelectElement;
    if (hazBuilding && hazBuilding.value !== this.currentBuildingId) {
      hazBuilding.value = this.currentBuildingId;
      this.populateCustomHazardFloors();
      this.populateCustomHazardLocations();
    }

    const building =
      CONFIGURED_BUILDINGS.find(
        (b) => hazardStore.normalizeBuildingId(b.id) === hazardStore.normalizeBuildingId(this.currentBuildingId)
      ) || CONFIGURED_BUILDINGS[0];

    const indicator = this.panelEl.querySelector("#buildingActiveIndicator");
    if (indicator) {
      indicator.innerHTML = `<span>📍</span> <span>Selected: <b>${building.name}</b> (${building.floorName})</span>`;
    }

    const countBadge = this.panelEl.querySelector("#activeHazardsCountBadge");
    if (countBadge) {
      const activeCount = hazardStore.getHazardsForBuilding(this.currentBuildingId).length;
      countBadge.textContent = `${activeCount} Hazard${activeCount === 1 ? "" : "s"}`;
    }
  }

  private renderScenarios() {
    const scenariosList = this.panelEl.querySelector("#buildingScenariosList");
    if (!scenariosList) return;

    const scenarios = hazardStore.getScenariosForBuilding(this.currentBuildingId);

    scenariosList.innerHTML = scenarios
      .map((sc) => {
        const isBlocked = sc.expectedStatus === "blocked";
        const borderColor = isBlocked ? "#fecaca" : "#bbf7d0";
        const badgeBg = isBlocked ? "#fee2e2" : "#dcfce7";
        const badgeColor = isBlocked ? "#991b1b" : "#166534";

        return `
          <div style="background:#ffffff; border:1px solid ${borderColor}; border-radius:8px; padding:10px; display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-weight:700; font-size:13px; color:#1e293b; display:flex; align-items:center; gap:6px;">
                <span>${sc.icon}</span> <span>Scenario ${sc.scenarioNumber}: ${sc.title}</span>
              </div>
              <span style="font-size:10px; font-weight:700; background:${badgeBg}; color:${badgeColor}; padding:2px 6px; border-radius:6px;">
                ${isBlocked ? "BLOCKED ROUTE" : "SAFE EVACUATION"}
              </span>
            </div>
            <div style="font-size:11px; color:#475569; line-height:1.4;">
              ${sc.description}
            </div>
            <div style="font-size:11px; color:#0369a1; background:#f0f9ff; padding:4px 8px; border-radius:6px; font-weight:600;">
              🎯 <b>Expected:</b> ${sc.expectedOutcome}
            </div>
            <div style="display:flex; justify-content:flex-end; margin-top:2px;">
              <button class="btn-run-scenario" data-id="${sc.id}" style="background:#1a73e8; color:#ffffff; border:none; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(26,115,232,0.3);">
                <span>▶</span> Run Scenario
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    scenariosList.querySelectorAll(".btn-run-scenario").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const scenarioId = (e.currentTarget as HTMLElement).getAttribute("data-id");
        if (scenarioId) {
          const sc = hazardStore.getScenarioById(scenarioId);
          if (sc) {
            this.runScenario(sc);
          }
        }
      });
    });
  }

  runScenario(sc: DemoScenario) {
    // 1. Ensure building matches
    if (hazardStore.normalizeBuildingId(this.currentBuildingId) !== hazardStore.normalizeBuildingId(sc.buildingId)) {
      this.selectBuilding(sc.buildingId, false);
      if (this.callbacks.onBuildingChanged) {
        this.callbacks.onBuildingChanged(sc.buildingId);
      }
    }

    // 2. Set start space
    this.callbacks.setStartSpace(sc.defaultStartSpaceId);

    // 3. Load hazards for this scenario
    hazardStore.loadDemoScenario(sc.id);

    // 4. Toast notification
    this.showToast(`Running Scenario ${sc.scenarioNumber}: ${sc.title}`);

    // 5. Evaluate and route
    this.handleFindNearestExit();
  }

  private handleFindNearestExit() {
    const startSpace = this.callbacks.getCurrentStartSpace();
    if (!startSpace) {
      alert("Please select your current location (From) in the route picker first!");
      return;
    }

    this.hideWarning();
    const result: NearestExitResult = safeRouteService.findNearestSafeExit(startSpace as any, this.mapData);

    const resultBox = document.getElementById("nearestExitResult")!;

    if (result.error === "NO_SAFE_ROUTE" || !result.chosenExit || !result.directions) {
      resultBox.style.display = "none";
      this.callbacks.onClearNavigation();
      this.showWarning(
        `🚨 NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.<br/><br/>` +
        `All eligible emergency exits from <b>${result.startLocationName}</b> are currently unreachable or blocked by active hazards.<br/><br/>` +
        `⚠️ <b>System refuses unsafe passage.</b> Do not traverse active hazard zones. Shelter in place and await emergency responder assistance.`
      );

      // Populate alternative exits list with blocked reasons
      this.renderAlternativeExits(result.alternativeExits);
      return;
    }

    // Success: Safe route found
    resultBox.style.display = "block";
    resultBox.innerHTML = `
      <div style="font-weight:700; color:#2e7d32; font-size:14px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
        <span>✅</span> <span>Safe Evacuation Route Found</span>
      </div>
      <div><b>Target Exit:</b> ${result.chosenExit.name}</div>
      <div><b>Building:</b> ${result.chosenExit.buildingName} (${result.chosenExit.floorName})</div>
      <div><b>Distance:</b> ${result.distanceMeters} meters (~${result.estimatedTimeSeconds} sec walk)</div>
      <div style="font-size:11px; color:#15803d; font-weight:600; margin-top:4px;">
        🛡️ Follow the safe green route on map avoiding all reported hazards.
      </div>
    `;

    // Populate alternative exits
    this.renderAlternativeExits(result.alternativeExits);

    // Apply route to the map
    const destDoor = this.mapData.getById("door", result.chosenExit.doorId);
    const destSpace = result.chosenExit.spaceId ? this.mapData.getById("space", result.chosenExit.spaceId) : undefined;
    const destTarget = destDoor || destSpace;
    if (destTarget) {
      this.callbacks.setDestinationSpace(result.chosenExit.doorId);
      this.callbacks.onRouteGenerated(result.directions, destTarget as any);
    }
  }

  private recalculateCurrentRoute() {
    const startSpace = this.callbacks.getCurrentStartSpace();
    if (!startSpace) return;

    // Check if an endSpace is currently chosen
    const endSpaceSelect = document.getElementById("endSpace") as HTMLSelectElement;
    const destSpaceId = endSpaceSelect ? endSpaceSelect.value : "";
    if (!destSpaceId) return;

    const destNav = this.mapData.getById("door", destSpaceId) || this.mapData.getById("space", destSpaceId);
    if (!destNav) return;

    this.hideWarning();
    const safeDirections = safeRouteService.getSafeDirections(startSpace, destNav, this.mapData);

    if (safeDirections) {
      this.showToast("Safe route updated with active hazard restrictions.");
      this.callbacks.onRouteGenerated(safeDirections, destNav as any);
    } else {
      this.callbacks.onClearNavigation();
      this.showWarning(
        `🚨 NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA.`
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
          ? `<button class="btn-route-exit" data-door="${item.exit.doorId}" data-space="${item.exit.doorId}" style="background:#1a73e8; color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">Route Here</button>`
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
        const targetId =
          (e.currentTarget as HTMLElement).getAttribute("data-door") ||
          (e.currentTarget as HTMLElement).getAttribute("data-space");
        if (targetId) {
          const startSpace = this.callbacks.getCurrentStartSpace();
          const targetNav =
            this.mapData.getById("door", targetId) ||
            this.mapData.getById("space", targetId);
          if (startSpace && targetNav) {
            this.callbacks.setDestinationSpace(targetId);
            const safeDir = safeRouteService.getSafeDirections(
              startSpace,
              targetNav,
              this.mapData
            );
            if (safeDir) {
              this.callbacks.onRouteGenerated(safeDir, targetNav as any);
              const exit =
                exitRegistry.getByDoorId(targetId) ||
                exitRegistry.getBySpaceId(targetId);
              this.showToast(
                `Routing to alternative exit: ${
                  exit ? exit.name : (targetNav as any).name || targetId
                }`
              );
            }
          }
        }
      });
    });
  }

  private updateActiveHazardsList() {
    const listEl = document.getElementById("activeHazardsList");
    const countBadge = this.panelEl.querySelector("#activeHazardsCountBadge");
    if (!listEl) return;

    const buildingHazards = hazardStore.getHazardsForBuilding(this.currentBuildingId);
    if (countBadge) {
      countBadge.textContent = `${buildingHazards.length} Hazard${buildingHazards.length === 1 ? "" : "s"}`;
    }

    if (buildingHazards.length === 0) {
      listEl.innerHTML = `<div style="font-size:12px; color:#888; font-style:italic;">No active hazards reported for this building.</div>`;
      return;
    }

    listEl.innerHTML = buildingHazards
      .map((h) => `
        <div style="background:#fff; border:1px solid #ffab91; border-radius:6px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:700; color:#d84315; font-size:12px;">
              ${h.reason.toString().toLowerCase().includes("fire") ? "🔥" : h.reason.toString().toLowerCase().includes("smoke") ? "💨" : "⛔"} ${h.name}
            </div>
            <div style="font-size:11px; color:#666;">
              ${h.buildingName} · ${h.floorName} · <span style="font-weight:600; color:#c2410c;">${h.locationType.toUpperCase()}</span> · ${h.reportedAt}
            </div>
            <div style="font-size:11px; color:#b91c1c; font-weight:600; margin-top:2px;">
              Status: ACTIVE · BLOCKED
            </div>
          </div>
          <button class="btn-clear-hazard" data-id="${h.id}" style="background:#efebe9; color:#4e342e; border:1px solid #d7ccc8; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">
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
          this.renderMapMarkers();
          this.updateActiveHazardsList();
          this.showToast(`Hazard ${id} cleared.`);
        }
      });
    });
  }

  renderMapMarkers() {
    // 1. Reset any spaces previously colored red that are no longer in an active hazard and not in preview
    const active = hazardStore.getActiveHazards();
    const activeBlockedSpaceIds = this.getActiveBlockedSpaceIds();

    this.coloredHazardSpaces.forEach((sp) => {
      if (!activeBlockedSpaceIds.has(sp.id) && !this.previewSpaceIds.has(sp.id)) {
        try {
          this.mapView.updateState(sp, { color: "initial" });
        } catch {
          // ignore
        }
        this.coloredHazardSpaces.delete(sp);
      }
    });

    // 2. Clear previously added markers
    this.activeMarkers.forEach((m) => {
      try {
        this.mapView.Markers.remove(m);
      } catch {
        // ignore
      }
    });
    this.activeMarkers = [];

    // 3. Highlight currently blocked spaces in red and add hazard markers
    const normB = hazardStore.normalizeBuildingId(this.currentBuildingId);
    const buildingHazards = active.filter(
      (h) => hazardStore.normalizeBuildingId(h.buildingId) === normB
    );

    buildingHazards.forEach((h) => {
      // If room, corridor, or area, color the space red!
      if (h.locationId && (h.locationType === "room" || h.locationType === "corridor" || h.locationType === "area")) {
        const sp = this.mapData.getById("space", h.locationId);
        if (sp) {
          try {
            this.mapView.updateState(sp, { color: "#d93025" });
            this.coloredHazardSpaces.add(sp);
          } catch {
            // ignore
          }
        }
      } else if (h.locationType === "floor") {
        // Color all spaces on the floor red
        const targetFl = h.locationId || h.floorId;
        const flSpaces = this.mapData.getByType("space").filter((s) => s.floor?.id === targetFl);
        flSpaces.forEach((sp) => {
          try {
            this.mapView.updateState(sp, { color: "#d93025" });
            this.coloredHazardSpaces.add(sp);
          } catch {
            // ignore
          }
        });
      }

      // Add visual hazard marker at coordinate
      const coord = {
        latitude: h.coordinates.latitude,
        longitude: h.coordinates.longitude,
        floorId: h.floorId === "all" ? this.mapView.currentFloor?.id : h.floorId,
      };

      const markerNode = document.createElement("div");
      const icon = h.reason.toString().toLowerCase().includes("fire") ? "🔥" : h.reason.toString().toLowerCase().includes("smoke") ? "💨" : "⛔";
      markerNode.innerHTML = `
        <div style="background:#d93025; color:#fff; padding:4px 8px; border-radius:12px; display:flex; align-items:center; gap:4px; font-size:12px; font-weight:700; box-shadow:0 0 12px #d93025; border:2px solid #fff; animation:pulse 1.5s infinite; cursor:pointer;" title="${h.name} (BLOCKED)">
          <span>${icon}</span> <span>${h.locationName} (BLOCKED)</span>
        </div>
      `;

      markerNode.addEventListener("click", () => {
        alert(
          `⚠️ ACTIVE HAZARD / RESTRICTION\n` +
          `Building: ${h.buildingName}\n` +
          `Floor: ${h.floorName}\n` +
          `Location: ${h.locationName} (${h.locationType.toUpperCase()})\n` +
          `Reason: ${h.reason}\n` +
          `Severity: ${h.severity.toUpperCase()}\n` +
          `Reported: ${h.reportedAt}\n` +
          `Status: ACTIVE · BLOCKED`
        );
      });

      try {
        const marker = this.mapView.Markers.add(coord as any, markerNode.innerHTML, {
          anchor: "center",
        });
        if (marker) this.activeMarkers.push(marker);
      } catch {
        // ignore
      }
    });

    // 4. Add markers for entrances and emergency exits of this building
    const allExits = exitRegistry.getAll().filter(
      (e) => hazardStore.normalizeBuildingId(e.buildingId) === normB
    );

    allExits.forEach((entry) => {
      const door = this.mapData.getById("door", entry.doorId);
      const space = entry.spaceId ? this.mapData.getById("space", entry.spaceId) : undefined;
      const coord = door?.center || space?.center || {
        latitude: entry.coordinates.latitude,
        longitude: entry.coordinates.longitude,
        floorId: entry.floorId,
      };

      const floor = this.mapData.getById("floor", entry.floorId);
      if (!floor) return;

      const isBlocked =
        hazardStore.isLocationBlocked(entry.doorId, normB) ||
        hazardStore.isLocationBlocked(entry.id, normB) ||
        hazardStore.isFloorBlocked(entry.floorId, normB);

      const markerNode = document.createElement("div");
      markerNode.className = "campusresq-map-marker";

      if (isBlocked) {
        markerNode.innerHTML = `
          <div style="background:#d93025; color:#fff; padding:3px 6px; border-radius:10px; display:flex; align-items:center; gap:4px; font-size:11px; font-weight:700; box-shadow:0 0 10px rgba(217,48,37,0.7); border:2px solid #fff; cursor:pointer;" title="${entry.name} (BLOCKED)">
            ⛔ BLOCKED EXIT
          </div>
        `;
      } else {
        const isExit = entry.isEmergencyExit;
        const icon = isExit ? "🏃" : "🚪";
        const bg = isExit ? "#188038" : "#1a73e8";
        markerNode.innerHTML = `
          <div style="background:${bg}; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:15px; box-shadow:0 2px 6px rgba(0,0,0,0.35); border:2px solid #fff; cursor:pointer;" title="${entry.name} (${entry.verificationStatus})">
            ${icon}
          </div>
        `;
      }

      markerNode.addEventListener("click", () => {
        alert(
          `📍 ${entry.name}\n` +
          `Building: ${entry.buildingName}\n` +
          `Floor: ${entry.floorName}\n` +
          `Status: ${isBlocked ? "BLOCKED BY EMERGENCY HAZARD" : "ACTIVE / CLEAR"}\n` +
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
      } catch {
        // ignore
      }
    });
  }

  showIncidentDashboard() {
    if (!this.isEmergencyMode) {
      this.setEmergencyMode(true);
    }

    if (this.incidentModalEl) {
      this.incidentModalEl.style.display = "flex";
      this.updateSosHubContent();
      return;
    }

    const modal = document.createElement("div");
    this.incidentModalEl = modal;
    modal.id = "incidentDashboardModal";
    Object.assign(modal.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.65)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10003",
      fontFamily: "inherit",
    });

    modal.innerHTML = `
      <div style="background:#fff; border-radius:16px; padding:22px; width:min(95%, 820px); max-height:88vh; display:flex; flex-direction:column; box-shadow:0 12px 40px rgba(0,0,0,0.35); border:1px solid #e2e8f0;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:12px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">🚨</span>
            <div>
              <h3 style="margin:0; font-size:18px; color:#1a1a1a;">CampusResQ — SOS Beacon & Safety Operations Hub</h3>
              <div style="font-size:11px; color:#64748b; margin-top:2px;">Real-time distress tracking, emergency responder dispatch, and hazard verification</div>
            </div>
          </div>
          <button id="btnCloseIncidentModal" style="background:#f1f5f9; border:none; border-radius:50%; width:32px; height:32px; font-size:16px; font-weight:700; color:#475569; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
        </div>

        <div style="flex:1; overflow-y:auto; margin:14px 0; display:flex; flex-direction:column; gap:14px;">
          <!-- Top Grid: Live Location, SOS Distress Beacon, Dispatch Status -->
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap:12px;">
            <!-- Live Location Card -->
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px;">
              <div style="font-size:11px; font-weight:800; color:#475569; text-transform:uppercase; margin-bottom:6px; display:flex; align-items:center; gap:4px;">
                <span>📍</span> <span>Live User Location</span>
              </div>
              <div id="sosUserBuilding" style="font-size:13px; font-weight:700; color:#0f172a;">Building: Office Building 1</div>
              <div id="sosUserFloor" style="font-size:12px; color:#475569; margin-top:2px;">Floor: Level 1</div>
              <div id="sosUserSpace" style="font-size:12px; color:#2563eb; font-weight:600; margin-top:2px;">Space: Classroom 153</div>
              <div id="sosUserCoords" style="font-size:11px; color:#64748b; margin-top:4px; font-family:monospace;">Coords: 43.46508, -80.52420</div>
            </div>

            <!-- SOS Distress Beacon Card -->
            <div style="background:#fff5f5; border:1.5px solid #fecaca; border-radius:10px; padding:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div style="font-size:11px; font-weight:800; color:#991b1b; text-transform:uppercase; display:flex; align-items:center; gap:4px;">
                  <span>🆘</span> <span>Distress Beacon</span>
                </div>
                <span id="sosBeaconBadge" style="font-size:10px; background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:6px; font-weight:700;">STANDBY</span>
              </div>
              <button id="btnTriggerModalSos" style="width:100%; background:#dc2626; color:#fff; border:none; padding:7px 10px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 2px 6px rgba(220,38,38,0.35);">
                <span>📢</span> <span>Broadcast / Refresh SOS</span>
              </button>
              <div style="margin-top:6px; display:flex; gap:6px;">
                <input id="sosRescueUrlInput" type="text" readonly style="flex:1; font-size:11px; padding:4px 6px; border:1px solid #cbd5e1; border-radius:4px; background:#fff; color:#475569;" />
                <button id="btnCopyRescueUrl" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:700; color:#334155; cursor:pointer;">Copy</button>
              </div>
            </div>

            <!-- Dispatch Services Status Card -->
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div style="font-size:11px; font-weight:800; color:#475569; text-transform:uppercase; display:flex; align-items:center; gap:4px;">
                  <span>🛡️</span> <span>Emergency Dispatch Status</span>
                </div>
                <span style="font-size:9px; background:#e2e8f0; color:#475569; padding:1px 5px; border-radius:4px; font-weight:700;">TEST / DEMO</span>
              </div>
              <div style="display:flex; flex-direction:column; gap:4px; font-size:11px;">
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:#475569;">Campus Security:</span>
                  <span style="color:#16a34a; font-weight:700;">Dispatched · In Transit</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:#475569;">Medical EMS:</span>
                  <span style="color:#d97706; font-weight:700;">Standby (ETA 4 min)</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:#475569;">Fire & Rescue:</span>
                  <span style="color:#2563eb; font-weight:700;">Station 4 Alerted</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Active Incidents Table -->
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <div style="font-size:12px; font-weight:800; color:#1e293b; text-transform:uppercase;">
                📋 Responder Incidents Queue
              </div>
              <span style="font-size:11px; color:#64748b;">Lifecycle: New → Acknowledged → Responding → Resolved</span>
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
              <thead>
                <tr style="background:#f1f5f9; border-bottom:2px solid #cbd5e1;">
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

          <!-- Active Building Hazards & Verification Controls -->
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:11px; font-weight:800; color:#475569; text-transform:uppercase;">⚠️ Building Hazard Clear & Verification</span>
              <button id="btnModalFindNearestExit" style="background:#188038; color:#fff; border:none; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">
                🏃 Test Nearest Safe Exit
              </button>
            </div>
            <div id="modalActiveHazardsList" style="display:flex; flex-direction:column; gap:4px; max-height:100px; overflow-y:auto; font-size:12px;">
            </div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #eee; padding-top:12px;">
          <span style="font-size:11px; color:#64748b;">CampusResQ Parakram 2026 Emergency & Safe Route System</span>
          <button id="btnResetIncidents" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">Reset Demo Incidents</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector("#btnCloseIncidentModal")!.addEventListener("click", () => (modal.style.display = "none"));
    modal.querySelector("#btnResetIncidents")!.addEventListener("click", () => {
      incidentService.resetDemoStore();
      this.updateSosHubContent();
      this.showToast("Demo incident store reset to initial scenario.");
    });

    modal.querySelector("#btnCopyRescueUrl")!.addEventListener("click", () => {
      const urlInput = modal.querySelector("#sosRescueUrlInput") as HTMLInputElement;
      if (urlInput && urlInput.value) {
        navigator.clipboard?.writeText(urlInput.value);
        this.showToast("Rescue link copied to clipboard!");
      }
    });

    modal.querySelector("#btnTriggerModalSos")!.addEventListener("click", () => {
      const startSpace = this.callbacks.getCurrentStartSpace();
      const building =
        CONFIGURED_BUILDINGS.find(
          (b) =>
            hazardStore.normalizeBuildingId(b.id) ===
            hazardStore.normalizeBuildingId(this.currentBuildingId)
        ) || CONFIGURED_BUILDINGS[0];
      const spaceId = startSpace
        ? (startSpace as any).id
        : building.defaultStartSpaceId;
      const spaceObj =
        (this.mapData.getById("door", spaceId) as any) ||
        this.mapData.getById("space", spaceId);
      const locName = spaceObj?.name || spaceId;

      incidentService.createIncident({
        reportedLocation: `${locName} (${building.name})`,
        locationSpaceId: spaceId,
        incidentType: "sos",
        severity: "critical",
        notes: "Emergency SOS broadcast triggered from Hub.",
      });

      this.showToast(`🚨 SOS Broadcasted for ${locName}!`);
      this.updateSosHubContent();
    });

    modal.querySelector("#btnModalFindNearestExit")!.addEventListener("click", () => {
      modal.style.display = "none";
      this.handleFindNearestExit();
    });

    this.updateSosHubContent();
  }

  private updateSosHubContent() {
    if (!this.incidentModalEl) return;
    const startSpace = this.callbacks.getCurrentStartSpace();
    const building =
      CONFIGURED_BUILDINGS.find(
        (b) =>
          hazardStore.normalizeBuildingId(b.id) ===
          hazardStore.normalizeBuildingId(this.currentBuildingId)
      ) || CONFIGURED_BUILDINGS[0];
    const spaceId = startSpace
      ? (startSpace as any).id
      : building.defaultStartSpaceId;
    const spaceObj =
      (this.mapData.getById("door", spaceId) as any) ||
      this.mapData.getById("space", spaceId);
    const spaceName = spaceObj?.name || spaceId || "Not selected";

    const buildingEl = this.incidentModalEl.querySelector("#sosUserBuilding");
    if (buildingEl) buildingEl.textContent = `Building: ${building.name}`;

    const floorEl = this.incidentModalEl.querySelector("#sosUserFloor");
    if (floorEl) floorEl.textContent = `Floor: ${building.floorName || "Level 1"}`;

    const spaceEl = this.incidentModalEl.querySelector("#sosUserSpace");
    if (spaceEl) spaceEl.textContent = `Space: ${spaceName}`;

    const coordsEl = this.incidentModalEl.querySelector("#sosUserCoords");
    if (coordsEl) {
      const center = (spaceObj as any)?.center;
      if (center) {
        coordsEl.textContent = `Coords: ${center.latitude.toFixed(6)}, ${center.longitude.toFixed(6)}`;
      } else {
        coordsEl.textContent = "Coords: 43.465085, -80.524200";
      }
    }

    const urlInput = this.incidentModalEl.querySelector("#sosRescueUrlInput") as HTMLInputElement;
    if (urlInput) {
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("meet", spaceId);
      url.searchParams.set("sos", "true");
      urlInput.value = url.toString();
    }

    // Check if any SOS incident is active
    const incidents = incidentService.getAll();
    const activeSos = incidents.find((i) => i.incidentType === "sos" && i.status !== "Resolved");
    const beaconBadge = this.incidentModalEl.querySelector("#sosBeaconBadge");
    if (beaconBadge) {
      if (activeSos) {
        beaconBadge.textContent = "ACTIVE BEACON";
        (beaconBadge as HTMLElement).style.background = "#fee2e2";
        (beaconBadge as HTMLElement).style.color = "#b91c1c";
      } else {
        beaconBadge.textContent = "STANDBY";
        (beaconBadge as HTMLElement).style.background = "#e2e8f0";
        (beaconBadge as HTMLElement).style.color = "#475569";
      }
    }

    // Render incident table
    this.renderIncidentTable();

    // Render active hazards in modal
    const hazardsListEl = this.incidentModalEl.querySelector("#modalActiveHazardsList");
    if (hazardsListEl) {
      const hazards = hazardStore.getHazardsForBuilding(this.currentBuildingId);
      if (hazards.length === 0) {
        hazardsListEl.innerHTML = `<span style="color:#64748b; font-style:italic;">No active hazards in ${building.shortName}.</span>`;
      } else {
        hazardsListEl.innerHTML = hazards
          .map(
            (h) => `
          <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; border:1px solid #fee2e2; border-radius:6px; padding:4px 8px;">
            <div><b>${h.locationName}</b> <span style="font-size:10px; color:#dc2626;">(${h.reason})</span></div>
            <button class="btn-clear-modal-hazard" data-id="${h.id}" style="background:#fee2e2; color:#b91c1c; border:none; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer;">Clear</button>
          </div>
        `
          )
          .join("");

        hazardsListEl.querySelectorAll(".btn-clear-modal-hazard").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const hId = (e.currentTarget as HTMLElement).getAttribute("data-id");
            if (hId) {
              hazardStore.removeHazard(hId);
              this.renderMapMarkers();
              this.updateActiveHazardsList();
              this.updateSosHubContent();
              this.showToast("Hazard cleared.");
            }
          });
        });
      }
    }
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
    this.showToast("CampusResQ demo incident state cleared and reset to normal.");
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
