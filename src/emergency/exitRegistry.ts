import { BuildingEntranceExit } from "./types";
import { MapData, Space } from "@mappedin/mappedin-js";

/**
 * CampusResQ Verified Entrance & Exit Registry
 * All coordinates, space IDs, floor IDs, and building IDs match the real Mappedin venue.
 * Unverified entries are explicitly marked and require administrator confirmation.
 */
export const INITIAL_ENTRANCES_EXITS: BuildingEntranceExit[] = [
  {
    id: "exit-ob1-main",
    name: "Main Reception Entrance & Exit",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "office building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    spaceId: "s_0c2e7b34a491e9d8",
    locationType: "both",
    isEmergencyExit: true,
    isEntrance: true,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4649984,
      longitude: -80.5241638,
    },
    notes: "Main front foyer entrance and primary ground-floor evacuation exit.",
  },
  {
    id: "exit-ob1-ne",
    name: "North-East Emergency Exit",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "office building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    spaceId: "s_968d23a365f36349",
    locationType: "exit",
    isEmergencyExit: true,
    isEntrance: false,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4651693,
      longitude: -80.5241947,
    },
    notes: "Direct exit near Computer Lab 173 and Classroom 157.",
  },
  {
    id: "exit-ob1-n",
    name: "North Emergency Exit",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "office building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    spaceId: "s_eee59e79de8ff8fd",
    locationType: "exit",
    isEmergencyExit: true,
    isEntrance: false,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4651591,
      longitude: -80.5242748,
    },
    notes: "North wing evacuation doorway near Classroom 153/154.",
  },
  {
    id: "exit-ob1-w",
    name: "West Emergency Exit",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "office building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    spaceId: "s_77ad8a0c6bb31807",
    locationType: "exit",
    isEmergencyExit: true,
    isEntrance: false,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4650578,
      longitude: -80.5245412,
    },
    notes: "West wing corridor exit near Classroom 38/39 and Storage 140.",
  },
  {
    id: "exit-ob1-sw",
    name: "South-West Corridor Exit",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "office building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    spaceId: "s_9cecd06bbfc355f0",
    locationType: "exit",
    isEmergencyExit: true,
    isEntrance: false,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4649001,
      longitude: -80.5244489,
    },
    notes: "South-West wing exit hallway near Music Room 129.",
  },
  {
    id: "exit-wat-porch",
    name: "Porch Entrance & Exit",
    buildingId: "fs_687ce890e964ae000bd1b0e2",
    buildingName: "Waterloo ON",
    floorId: "m_f7ad6268bf946916",
    floorName: "Level 1",
    spaceId: "s_d694d105cae021b5",
    locationType: "both",
    isEmergencyExit: true,
    isEntrance: true,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4652223,
      longitude: -80.5240174,
    },
    notes: "Main exterior doorway and porch for Waterloo ON building.",
  },
  {
    id: "exit-wat-court",
    name: "Courtyard Emergency Exit",
    buildingId: "fs_687ce890e964ae000bd1b0e2",
    buildingName: "Waterloo ON",
    floorId: "m_f7ad6268bf946916",
    floorName: "Level 1",
    spaceId: "s_04d941867e50bdbf",
    locationType: "exit",
    isEmergencyExit: true,
    isEntrance: false,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.4653205,
      longitude: -80.5238061,
    },
    notes: "Open courtyard evacuation exit leading to outdoor safe assembly zone.",
  },
  {
    id: "exit-sch-hall",
    name: "School Main Hall Entrance & Exit",
    buildingId: "fs_6878b4d517d37f000bb0c288",
    buildingName: "school",
    floorId: "m_f5d3537f84fb2d4f",
    floorName: "Level 1",
    spaceId: "s_c1f772690d848720",
    locationType: "both",
    isEmergencyExit: true,
    isEntrance: true,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.465545,
      longitude: -80.524278,
    },
    notes: "School facility central entrance and primary assembly exit.",
  },
  {
    id: "exit-sch-break",
    name: "School West Emergency Exit",
    buildingId: "fs_6878b4d517d37f000bb0c288",
    buildingName: "school",
    floorId: "m_f5d3537f84fb2d4f",
    floorName: "Level 1",
    spaceId: "s_54517a1da752af00",
    locationType: "exit",
    isEmergencyExit: true,
    isEntrance: false,
    verificationStatus: "verified",
    coordinates: {
      latitude: 43.465548,
      longitude: -80.524386,
    },
    notes: "West exit door through Break Room directly accessing exterior path.",
  },
  {
    id: "exit-ob1-south-unverified",
    name: "South Service Door (Requires Admin Verification)",
    buildingId: "fs_6878b1ed316caa000b260be2",
    buildingName: "office building 1",
    floorId: "m_c5bac871ab66226c",
    floorName: "Level 1",
    spaceId: "s_e7647f337f278d42",
    locationType: "exit",
    isEmergencyExit: false, // NOT eligible until verified
    isEntrance: false,
    verificationStatus: "unverified",
    coordinates: {
      latitude: 43.464843,
      longitude: -80.52441,
    },
    notes: "Maintenance doorway. Requires administrator confirmation before use as emergency exit.",
  },
];

export class ExitRegistry {
  private entries: BuildingEntranceExit[] = [...INITIAL_ENTRANCES_EXITS];

  getAll(): BuildingEntranceExit[] {
    return [...this.entries];
  }

  getVerifiedEmergencyExits(): BuildingEntranceExit[] {
    return this.entries.filter(
      (e) => e.isEmergencyExit && e.verificationStatus === "verified"
    );
  }

  getVerifiedEntrances(): BuildingEntranceExit[] {
    return this.entries.filter(
      (e) => e.isEntrance && e.verificationStatus === "verified"
    );
  }

  getById(id: string): BuildingEntranceExit | undefined {
    return this.entries.find((e) => e.id === id);
  }

  getBySpaceId(spaceId: string): BuildingEntranceExit | undefined {
    return this.entries.find((e) => e.spaceId === spaceId);
  }

  getByBuilding(buildingId: string): BuildingEntranceExit[] {
    return this.entries.filter((e) => e.buildingId === buildingId);
  }

  /**
   * Admin verification interface method
   */
  updateVerificationStatus(
    id: string,
    status: "verified" | "unverified",
    isEmergencyExit?: boolean
  ): boolean {
    const entry = this.getById(id);
    if (!entry) return false;
    entry.verificationStatus = status;
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
