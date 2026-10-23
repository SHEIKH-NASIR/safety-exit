# CampusResQ — Safety Exit & Emergency Navigation System

[![Deployment: Render](https://img.shields.io/badge/Deploy-Render-46E3B7?style=flat&logo=render&logoColor=white)](https://render.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.4+-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Mappedin JS v6](https://img.shields.io/badge/Mappedin-SDK%20v6-0A85EA?style=flat)](https://developer.mappedin.com/)

**CampusResQ / Safety Exit** is an intelligent indoor and outdoor emergency evacuation, hazard-avoidance, and rescue navigation platform built for multi-building university and enterprise campuses.

Using real-time 3D spatial mapping powered by the Mappedin JS v6 SDK, CampusResQ dynamically calculates safe evacuation routes, steers evacuees away from verified active hazards, and allows victims to broadcast self-contained emergency distress snapshots to rescue teams.

---

## 🌟 Key Features

### 1. Independent Start & Destination Selectors
- **Full Venue Freedom**: Independently select Start Building, Floor, and Room/Door alongside Destination Building, Floor, and Room/Door across all campus facilities (Main Building / School, Office Building 1, Waterloo Venue).
- **Interactive Map Picking**: Pick locations directly from the 3D map canvas without triggering premature auto-navigation.
- **Collapsible UI Dashboards**: Route selection dashboards automatically collapse upon successful route generation to maximize map visibility, with independent manual expand/collapse toggles and instant restoration on **Reset**.

### 2. Intelligent Emergency Evacuation (Find Nearest Safe Exit)
- Evaluates all verified exterior and emergency exit doors within the evacuee's active building.
- Dynamically calculates the shortest walkable route avoiding every active hazard zone.
- If closer exits are compromised by fire, smoke, or debris, the system automatically redirects evacuees to the nearest safe, reachable alternative.

### 3. Multi-Hazard Restriction Management
- **5 Restriction Modes**:
  - **Custom Drawn Polygons**: Click directly on the map to draw arbitrary polygonal hazard boundaries.
  - **Drawn Corridor Sections**: Draw targeted segment blockades along hallways with configurable corridor width.
  - **Corridor Sections**: Pre-configured architectural hallway segments.
  - **Specific Rooms & Spaces**: Block single rooms, labs, or offices.
  - **Exit & Entrance Doors**: Mark doors as impassable or blocked.
  - **Floor-Wide Restrictions**: Mark entire floors as restricted.
- **Visible 3D Map Rendering**: Active hazard zones are rendered on the map floor using native Mappedin 3D shapes with red volume fills (`#dc2626`, 0.55 opacity) and high-contrast perimeter path outlines (`mapView.Paths.add`).
- **Selective Clearance**: Remove individual hazards with one click without resetting or affecting other active restrictions.

### 4. Strict Safety Enforcement & Unsafe Route Refusal
- Route endpoints (Start and Destination) are verified using point-in-polygon containment tests.
- Every route coordinate and waypoint is strictly checked against active hazard polygons on matching floors.
- If any segment crosses an impassable hazard zone, route generation is strictly refused, existing navigation cleared, and a high-visibility warning displayed: `"NO SAFE ROUTE AVAILABLE — YOUR DESTINATION CANNOT BE REACHED WITHOUT CROSSING A BLOCKED AREA."`

### 5. Multi-Floor & Inter-Building Navigation
- **Genuine Vertical Connections**: Utilizes real architectural staircases and elevator connections (such as Waterloo Venue Level 1 $\leftrightarrow$ Level 2 stairs `s_ccaa34f019aa4c31`).
- **Outdoor Inter-Building Connectors**: Connects Office Building 1 and School via verified exterior pathways and doors.

### 6. Emergency SOS Hub & Validated Incident Sharing
- Victims generate an authoritative, self-contained SOS distress link containing a tamper-resistant JSON snapshot payload (`sosData`).
- When opened on a rescuer device:
  - The victim's exact building, floor, and space are automatically restored as the rescuer's **Destination**.
  - The rescuer's existing **Start** selection is preserved independently.
  - All active red-zone hazard restrictions are imported and rendered on the rescuer's 3D map.
  - A prominent verified Incident Banner displays the victim's location, floor, reported timestamp, and incident ID.

### 7. Nine Integrated Demo Scenarios
Built-in presets for hackathon showcases and demonstrations across all three venues:
1. **School**: Main Hallway Fire $\rightarrow$ East Exit Reroute
2. **School**: Dual Hallway Fire $\rightarrow$ West Exit Reroute
3. **School**: All Exits Blocked $\rightarrow$ Refusal & Alarm
4. **Office Building 1**: East Wing Fire $\rightarrow$ West Exit Reroute
5. **Office Building 1**: Office Wing Fire $\rightarrow$ Alternate Exit
6. **Office Building 1**: Multiple Exits Blocked $\rightarrow$ Refusal & Alarm
7. **Waterloo Venue**: All Clear $\rightarrow$ Venue Evacuation
8. **Waterloo Venue**: Courtyard Fire $\rightarrow$ Automatic Rerouting
9. **Waterloo Venue**: Entrances and Hallways Blocked $\rightarrow$ Refusal & Alarm

---

## 🛠️ Project Architecture

```
safety-exit/
├── index.html                       # Application shell and UI controls
├── package.json                     # Parcel build configuration & dependencies
├── tsconfig.json                    # TypeScript compiler configuration
├── render.yaml                      # Render Infrastructure-as-Code Blueprint
├── .env.example                     # Environment variable template
├── .gitignore                       # Git exclusions (credentials, caches, scratch)
└── src/
    ├── index.ts                     # Core application bootstrap, routing & event loop
    ├── floorSelector.ts             # Floor picker integration
    ├── spaceSelector.ts             # Room & door dropdown population
    ├── generator.ts                 # Route step & turn position generator
    ├── positionUpdater.ts           # Blue Dot tracking & chase camera
    ├── fileDownloader.ts            # Route export utility
    └── emergency/
        ├── types.ts                 # Incident, hazard & exit data models
        ├── hazardStore.ts           # Reactive hazard store & building metadata
        ├── exitRegistry.ts          # Building entrance & emergency exit registry
        ├── safeRouteService.ts      # Geometry intersection & safe routing engine
        ├── incidentService.ts       # SOS snapshot serialization & encoding
        ├── corridorSections.ts      # Pre-configured corridor section definitions
        └── emergencyPanel.ts        # SOS Hub UI, 3D shape overlays & demo scenarios
```

---

## 🚀 Quick Start (Local Development)

### 1. Clone the repository
```bash
git clone https://github.com/SHEIKH-NASIR/safety-exit.git
cd safety-exit
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(Default demo credentials are pre-configured in code fallback, so `.env` is optional for standard demo execution).*

### 4. Start local development server
```bash
npm start
```
Open [http://localhost:1234](http://localhost:1234) in your browser.

### 5. Build for production
```bash
npm run build
```
Compiled static assets are generated in the `dist/` directory.

---

## 🌐 Free Deployment to Render (Connected to GitHub)

CampusResQ supports full dual deployment on Render:
1. **Frontend Static Site (`safety-exit`)**: Single-page application served via Render Static Site.
2. **Auth Web Service (`safety-exit-api`)**: Minimal Node.js service that securely exchanges private Mappedin credentials for short-lived access tokens, ensuring private keys are never exposed in client bundles.

### Method A: One-Click Blueprint Deployment via `render.yaml`
1. Push this repository to GitHub: `https://github.com/SHEIKH-NASIR/safety-exit.git`.
2. Log into the [Render Dashboard](https://dashboard.render.com).
3. Click **New +** $\rightarrow$ **Blueprint**.
4. Connect your GitHub repository `SHEIKH-NASIR/safety-exit`.
5. Render reads `render.yaml` automatically and configures:
   - **Static Site (`safety-exit`)**: Build command `npm install && npm run build`, publish path `dist`.
   - **Web Service (`safety-exit-api`)**: Build command `npm install`, start command `npm run start:api`.
6. Click **Apply**. Both services will build and deploy automatically!
7. *(Optional)* If using private custom venue credentials, set `MAPPEDIN_KEY` and `MAPPEDIN_SECRET` in the `safety-exit-api` Web Service Environment settings on Render.

### Method B: Standalone Static Site Setup
1. In the [Render Dashboard](https://dashboard.render.com), click **New +** $\rightarrow$ **Static Site**.
2. Connect `SHEIKH-NASIR/safety-exit`.
3. Configure settings:
   - **Name**: `safety-exit`
   - **Branch**: `master`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. Click **Create Static Site**.

---

## 🔒 Security & Privacy Architecture
- **Server-Side Token Authentication**: In production, private API keys (`MAPPEDIN_KEY`, `MAPPEDIN_SECRET`) are kept strictly on the backend (`safety-exit-api`). The client requests short-lived, ephemeral JWT tokens (`/api/mappedin-token`) with zero client-side secret leakage.
- **Client Fallback Resilience**: If the auth backend is unavailable or cold-starting, the frontend seamlessly falls back to public demo credentials so map navigation and evacuation routing are never interrupted.
- **Git Protection**: Sensitive configuration files (`.env`, `.env.*`), private keys, build caches (`.parcel-cache-build/`), and temporary scratch logs are strictly excluded via `.gitignore`.
- **Venue Settings Masking**: Credential inputs inside the collapsible Venue Settings panel are masked (`type="password"`) to prevent accidental plaintext disclosure during presentations and screen sharing.

---

## 📄 License
MIT License. Venue geometry and map tile data courtesy of Mappedin.
