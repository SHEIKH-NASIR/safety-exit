import { BuildingEntranceExit } from "./types";
import { MapData, Space } from "@mappedin/mappedin-js";

/**
 * CampusResQ Audited & Verified Entrance & Exit Registry
 * 
 * AUDIT METHODOLOGY & RESULTS:
 * Every doorway across all 3 venue buildings has been audited against:
 * 1. Mappedin SDK core door data (isExterior attribute).
 * 2. Connected space topology and floor boundaries.
 * 3. Physical path routability and exterior egress coordinates.
 *
 * CLASSIFICATION CRITERIA:
 * - "verified": isExterior === true in venue data, direct egress to outside safe ground.
 * - "internal": isExterior === false in venue data, internal room or partition doorway.
 *   Strictly excluded from emergency evacuation candidates.
 * - "unverified": Doorway where exterior connectivity is ambiguous or maintenance-only.
 *   Requires on-site administrative confirmation before emergency inclusion.
 */
export const INITIAL_ENTRANCES_EXITS: BuildingEntranceExit[] = [
  // --- OFFICE BUILDING 1 (fs_6878b1ed316caa000b260be2) ---
  {
    id: "exit-ob1-main",
    name: "Main Reception Entrance & Exit Door",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "office building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    doorId: "e_7d621cca039b07a9",
    spaceId: "s_0c2e7b34a491e9d8",
    locationType: "both",
    doorType: "exterior",
    isExterior: true,
    isEmergencyExit: true,
    isEntrance: true,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4649542,
      longitude: -80.5241229,
    },
    notes: "Main front foyer exterior doorway and primary ground-floor evacuation exit.",
  },
  {
    id: "exit-ob1-main-sec",
    name: "Main Reception Secondary Foyer Door",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "office building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    doorId: "e_39bcdcb0d2aea823",
    spaceId: "s_0c2e7b34a491e9d8",
    locationType: "both",
    doorType: "exterior",
    isExterior: true,
    isEmergencyExit: true,
    isEntrance: true,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4649486,
      longitude: -80.5241362,
    },
    notes: "Secondary front foyer exterior doorway directly opening outside.",
  },
  {
    id: "exit-ob1-ne",
    name: "North-East Emergency Exit Door",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "office building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    doorId: "e_efc8dc9fb2a2dedd",
    spaceId: "s_968d23a365f36349",
    locationType: "exit",
    doorType: "exterior",
    isExterior: true,
    isEmergencyExit: true,
    isEntrance: false,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4651722,
      longitude: -80.5241884,
    },
    notes: "Direct exterior exit doorway near Classroom 161 and Women's Washroom.",
  },
  {
    id: "exit-ob1-w",
    name: "West Emergency Exit Door",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "office building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    doorId: "e_97e5729191ddffcd",
    spaceId: "s_77ad8a0c6bb31807",
    locationType: "exit",
    doorType: "exterior",
    isExterior: true,
    isEmergencyExit: true,
    isEntrance: false,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4650630,
      longitude: -80.5245460,
    },
    notes: "West wing exterior corridor exit doorway near Classroom 38/39 and Storage 140.",
  },
  {
    id: "exit-ob1-sw",
    name: "South-West Emergency Exit Door",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "office building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    doorId: "e_ac1d7851791e717f",
    spaceId: "s_9cecd06bbfc355f0",
    locationType: "exit",
    doorType: "exterior",
    isExterior: true,
    isEmergencyExit: true,
    isEntrance: false,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4648976,
      longitude: -80.5244554,
    },
    notes: "South-West wing exterior exit doorway near Classroom 132/128.",
  },
  {
    id: "exit-ob1-n",
    name: "North Wing Internal Doorway (Internal)",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "office building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    doorId: "e_c8121a9bdd86804e",
    spaceId: "s_eee59e79de8ff8fd",
    locationType: "exit",
    doorType: "internal",
    isExterior: false,
    isEmergencyExit: false, // EXCLUDED from emergency exits per audit (internal door)
    isEntrance: false,
    verificationStatus: "internal",
    coordinates: {
      latitude: 43.465149,
      longitude: -80.524255,
    },
    notes: "Internal corridor partition doorway (isExterior: false in map data). Excluded from verified exterior exit routing per architectural audit.",
  },
  {
    id: "exit-ob1-south-unverified",
    name: "South Service Door (Unverified)",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "office building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    doorId: "e_458499a22f52b79d",
    spaceId: "s_e7647f337f278d42",
    locationType: "exit",
    doorType: "internal",
    isExterior: false,
    isEmergencyExit: false, // NOT eligible until manually verified
    isEntrance: false,
    verificationStatus: "unverified",
    coordinates: {
      latitude: 43.4649051,
      longitude: -80.5242898,
    },
    notes: "Maintenance doorway with isExterior: false in map data. Requires administrator confirmation before use as emergency exit.",
  },

  // --- WATERLOO ON (fs_687ce890e964ae000bd1b0e2) ---
  {
    id: "exit-wat-porch",
    name: "Porch Entrance & Exit Door",
    buildingId: "fs_687ce890e964ae000bd1b0e2",
    buildingName: "Waterloo ON",
    floorId: "m_f7ad6268bf946916",
    floorName: "Level 1",
    doorId: "e_d91dc2e89bf6e0c7",
    spaceId: "s_d694d105cae021b5",
    locationType: "both",
    doorType: "exterior",
    isExterior: true,
    isEmergencyExit: true,
    isEntrance: true,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4651933,
      longitude: -80.5240701,
    },
    notes: "Main exterior doorway and porch for Waterloo ON building.",
  },
  {
    id: "exit-wat-court",
    name: "Courtyard Emergency Exit Door",
    buildingId: "fs_687ce890e964ae000bd1b0e2",
    buildingName: "Waterloo ON",
    floorId: "m_f7ad6268bf946916",
    floorName: "Level 1",
    doorId: "e_ae3282da063f5a53",
    spaceId: "s_04d941867e50bdbf",
    locationType: "exit",
    doorType: "exterior",
    isExterior: true,
    isEmergencyExit: true,
    isEntrance: false,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4653360,
      longitude: -80.5237863,
    },
    notes: "Exterior door opening directly to outdoor Court Yard safe assembly zone.",
  },
  {
    id: "exit-wat-side",
    name: "Side Porch Exterior Door",
    buildingId: "fs_687ce890e964ae000bd1b0e2",
    buildingName: "Waterloo ON",
    floorId: "m_f7ad6268bf946916",
    floorName: "Level 1",
    doorId: "e_778dea152e018469",
    spaceId: "s_d694d105cae021b5",
    locationType: "both",
    doorType: "exterior",
    isExterior: true,
    isEmergencyExit: true,
    isEntrance: true,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4652041,
      longitude: -80.5240770,
    },
    notes: "Side porch exterior doorway (isExterior: true in venue map data).",
  },

  // --- SCHOOL (fs_6878b4d517d37f000bb0c288) ---
  {
    id: "exit-sch-hall",
    name: "School Main Entrance & Exit Door",
    buildingId: "fs_6878b4d517d37f000bb0c288",
    buildingName: "school",
    floorId: "m_f5d3537f84fb2d4f",
    floorName: "Level 1",
    doorId: "e_36b51dda911ea5dc",
    spaceId: "s_c1f772690d848720",
    locationType: "both",
    doorType: "exterior",
    isExterior: true,
    isEmergencyExit: true,
    isEntrance: true,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4655906,
      longitude: -80.5240052,
    },
    notes: "School facility central exterior entrance and primary assembly exit door.",
  },
  {
    id: "exit-sch-break",
    name: "School South-East Emergency Exit Door",
    buildingId: "fs_6878b4d517d37f000bb0c288",
    buildingName: "school",
    floorId: "m_f5d3537f84fb2d4f",
    floorName: "Level 1",
    doorId: "e_928ca26bad0f64d0",
    spaceId: "s_54517a1da752af00",
    locationType: "exit",
    doorType: "exterior",
    isExterior: true,
    isEmergencyExit: true,
    isEntrance: false,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4654888,
      longitude: -80.5239180,
    },
    notes: "South-East exterior exit door accessing outdoor safe path.",
  },
];

export class ExitRegistry {
  private entries: BuildingEntranceExit[] = [...INITIAL_ENTRANCES_EXITS];

  getAll(): BuildingEntranceExit[] {
    return [...this.entries];
  }

  /**
   * Returns only VERIFIED EXTERIOR exits eligible for emergency evacuation.
   * Internal doors and unverified doors are strictly excluded.
   */
  getVerifiedEmergencyExits(): BuildingEntranceExit[] {
    return this.entries.filter(
      (e) =>
        e.isEmergencyExit === true &&
        e.verificationStatus === "verified" &&
        e.doorType !== "internal" &&
        e.isExterior !== false
    );
  }

  getVerifiedEntrances(): BuildingEntranceExit[] {
    return this.entries.filter(
      (e) => e.isEntrance && e.verificationStatus === "verified" && e.doorType !== "internal"
    );
  }

  getById(id: string): BuildingEntranceExit | undefined {
    return this.entries.find((e) => e.id === id);
  }

  getByDoorId(doorId: string): BuildingEntranceExit | undefined {
    return this.entries.find((e) => e.doorId === doorId);
  }

  getBySpaceId(spaceId: string): BuildingEntranceExit | undefined {
    return this.entries.find((e) => e.spaceId === spaceId || e.doorId === spaceId);
  }

  getByBuilding(buildingId: string): BuildingEntranceExit[] {
    return this.entries.filter((e) => e.buildingId === buildingId);
  }

  /**
   * Returns complete audit statistics across all venues
   */
  getAuditSummary() {
    return {
      totalDoorsRegistered: this.entries.length,
      verifiedExteriorExits: this.entries.filter(e => e.doorType === "exterior" && e.verificationStatus === "verified").length,
      internalDoorways: this.entries.filter(e => e.doorType === "internal").length,
      unverifiedDoors: this.entries.filter(e => e.verificationStatus === "unverified").length,
    };
  }

  /**
   * Admin verification interface method
   */
  updateVerificationStatus(
    id: string,
    status: "verified" | "unverified" | "internal",
    isEmergencyExit?: boolean
  ): boolean {
    const entry = this.getById(id);
    if (!entry) return false;
    entry.verificationStatus = status;
    if (status === "internal") {
      entry.doorType = "internal";
      entry.isEmergencyExit = false;
      entry.isExterior = false;
    }
    if (typeof isEmergencyExit === "boolean") {
      entry.isEmergencyExit = isEmergencyExit;
    }
    return true;
  }

  reset(): void {
    this.entries = JSON.parse(JSON.stringify(INITIAL_ENTRANCES_EXITS));
  }
}

export const exitRegistry = new ExitRegistry();
