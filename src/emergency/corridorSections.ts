import { CorridorSection } from "./types";

export const CORRIDOR_SECTIONS: CorridorSection[] = [
  // ==========================================
  // BUILDING 1: Main Building / School (m_f5d3537f84fb2d4f)
  // Corridor Space: Hall (s_c1f772690d848720)
  // ==========================================
  {
    id: "school_hall_sec_a",
    corridorName: "Hall",
    sectionName: "Section A (Main Entrance & North Wing)",
    displayName: "Hall — Section A (Main Entrance & North Wing)",
    buildingId: "fs_6878b4d517d37f000bb0c288",
    floorId: "m_f5d3537f84fb2d4f",
    spaceId: "s_c1f772690d848720",
    coordinates: { latitude: 43.4655906, longitude: -80.5240052 },
    radiusMeters: 5.5,
    notes: "Main hallway passage directly leading to the Main Entrance & Exit door (e_36b51dda911ea5dc).",
  },
  {
    id: "school_hall_sec_b",
    corridorName: "Hall",
    sectionName: "Section B (Central Junction / Offices & Lab)",
    displayName: "Hall — Section B (Central Junction / Offices & Lab)",
    buildingId: "fs_6878b4d517d37f000bb0c288",
    floorId: "m_f5d3537f84fb2d4f",
    spaceId: "s_c1f772690d848720",
    coordinates: { latitude: 43.4653808, longitude: -80.5244107 },
    radiusMeters: 5.5,
    notes: "Central corridor junction connecting Office 1, Office 2, Lab, and Break Room.",
  },
  {
    id: "school_hall_sec_c",
    corridorName: "Hall",
    sectionName: "Section C (South-East Corridor near Break Room)",
    displayName: "Hall — Section C (South-East Corridor near Break Room)",
    buildingId: "fs_6878b4d517d37f000bb0c288",
    floorId: "m_f5d3537f84fb2d4f",
    spaceId: "s_c1f772690d848720",
    coordinates: { latitude: 43.4654888, longitude: -80.523918 },
    radiusMeters: 5.5,
    notes: "South-East hallway segment connecting to the South-East Emergency Exit door (e_928ca26bad0f64d0).",
  },

  // ==========================================
  // BUILDING 2: Office Building 1 (m_c5bac871ab66226c)
  // Mapped corridor spaces:
  // ==========================================
  {
    id: "ob1_sec_east_ne",
    corridorName: "East Corridor",
    sectionName: "North-East Wing (Classroom 153/154 & NE Exit)",
    displayName: "East Corridor — North-East Wing (near Classroom 153 & NE Exit)",
    buildingId: "fs_6878b1ed316caa000b260be2",
    floorId: "m_c5bac871ab66226c",
    spaceId: "s_968d23a365f36349",
    coordinates: { latitude: 43.4651693, longitude: -80.5241947 },
    radiusMeters: 5.0,
    notes: "East wing corridor providing direct access to the North-East Emergency Exit.",
  },
  {
    id: "ob1_sec_east_mid",
    corridorName: "East Corridor",
    sectionName: "Mid-Section (Classrooms 150/151 & 149)",
    displayName: "East Corridor — Mid-Section (Classrooms 150/151 & 149)",
    buildingId: "fs_6878b1ed316caa000b260be2",
    floorId: "m_c5bac871ab66226c",
    spaceId: "s_9d4965e1d802cca5",
    coordinates: { latitude: 43.46506, longitude: -80.5242142 },
    radiusMeters: 5.0,
    notes: "East corridor stretch connecting classroom clusters 149-152.",
  },
  {
    id: "ob1_sec_east_jct",
    corridorName: "East Corridor",
    sectionName: "Foyer Junction (near Copier 108 & Reception)",
    displayName: "East Corridor — Foyer Junction (near Copier 108 & Reception)",
    buildingId: "fs_6878b1ed316caa000b260be2",
    floorId: "m_c5bac871ab66226c",
    spaceId: "s_09892650e4cba55f",
    coordinates: { latitude: 43.4649602, longitude: -80.5242361 },
    radiusMeters: 5.0,
    notes: "Central corridor junction between East Wing and Main Reception.",
  },
  {
    id: "ob1_sec_reception",
    corridorName: "Reception Entryway",
    sectionName: "Main Entrance Foyer (Main Reception Exit)",
    displayName: "Reception Entryway — Main Entrance Foyer (Main Reception Exit)",
    buildingId: "fs_6878b1ed316caa000b260be2",
    floorId: "m_c5bac871ab66226c",
    spaceId: "s_a8a6521104cc8de3",
    coordinates: { latitude: 43.4649757, longitude: -80.524128 },
    radiusMeters: 5.0,
    notes: "Foyer passage leading directly to Main Reception Exit Door e_7d621cca039b07a9.",
  },
  {
    id: "ob1_sec_north_jct",
    corridorName: "North Corridor",
    sectionName: "Cafeteria & Library Junction",
    displayName: "North Corridor — Cafeteria & Library Junction",
    buildingId: "fs_6878b1ed316caa000b260be2",
    floorId: "m_c5bac871ab66226c",
    spaceId: "s_eee59e79de8ff8fd",
    coordinates: { latitude: 43.4651591, longitude: -80.5242749 },
    radiusMeters: 5.0,
    notes: "North hallway corridor connecting East Wing to Cafeteria and Library 172.",
  },
  {
    id: "ob1_sec_central_conn",
    corridorName: "Central Corridor",
    sectionName: "Cross-Connector (Classrooms 132/133 & 158)",
    displayName: "Central Corridor — Cross-Connector (Classrooms 132/133)",
    buildingId: "fs_6878b1ed316caa000b260be2",
    floorId: "m_c5bac871ab66226c",
    spaceId: "s_34d37255902d72cb",
    coordinates: { latitude: 43.4650198, longitude: -80.5244175 },
    radiusMeters: 5.0,
    notes: "Horizontal cross-connector between East corridor and West corridor.",
  },
  {
    id: "ob1_sec_west",
    corridorName: "West Corridor",
    sectionName: "West Emergency Exit Passage (Classrooms 38/39)",
    displayName: "West Corridor — West Emergency Exit Passage (Classrooms 38/39)",
    buildingId: "fs_6878b1ed316caa000b260be2",
    floorId: "m_c5bac871ab66226c",
    spaceId: "s_77ad8a0c6bb31807",
    coordinates: { latitude: 43.4650578, longitude: -80.5245413 },
    radiusMeters: 5.0,
    notes: "West hallway leading to West Emergency Exit door e_97e5729191ddffcd.",
  },
  {
    id: "ob1_sec_south_west",
    corridorName: "South-West Corridor",
    sectionName: "Locker Rooms & Washrooms Wing",
    displayName: "South-West Corridor — Locker Rooms & Washrooms Wing",
    buildingId: "fs_6878b1ed316caa000b260be2",
    floorId: "m_c5bac871ab66226c",
    spaceId: "s_f49b82bba57a513c",
    coordinates: { latitude: 43.4649152, longitude: -80.5243625 },
    radiusMeters: 5.0,
    notes: "Passage connecting Girls/Boys Locker Rooms and Washrooms.",
  },

  // ==========================================
  // BUILDING 3: Waterloo Venue (m_f7ad6268bf946916)
  // ==========================================
  {
    id: "wat_sec_lobby",
    corridorName: "LOBBY",
    sectionName: "Main Entrance Foyer",
    displayName: "LOBBY — Main Entrance Foyer",
    buildingId: "fs_687ce890e964ae000bd1b0e2",
    floorId: "m_f7ad6268bf946916",
    spaceId: "s_b31a4161f074c1dc",
    coordinates: { latitude: 43.4652374, longitude: -80.523879 },
    radiusMeters: 5.0,
    notes: "Main reception and lobby passageway.",
  },
  {
    id: "wat_sec_courtyard",
    corridorName: "Court Yard",
    sectionName: "Courtyard Passage (Courtyard Exit Access)",
    displayName: "Court Yard — Courtyard Passage (Courtyard Exit Access)",
    buildingId: "fs_687ce890e964ae000bd1b0e2",
    floorId: "m_f7ad6268bf946916",
    coordinates: { latitude: 43.465336, longitude: -80.5237863 },
    radiusMeters: 4.5,
    notes: "Open corridor passage connecting Drawing Room to Courtyard Exit Door e_ae3282da063f5a53.",
  },
  {
    id: "wat_sec_porch",
    corridorName: "Porch Passage",
    sectionName: "South Porch Passage (Front Porch Exit Access)",
    displayName: "Porch Passage — Front Porch Exit Access",
    buildingId: "fs_687ce890e964ae000bd1b0e2",
    floorId: "m_f7ad6268bf946916",
    coordinates: { latitude: 43.4651933, longitude: -80.5240701 },
    radiusMeters: 4.5,
    notes: "Passage leading out to Front Porch Exit Door e_d91dc2e89bf6e0c7.",
  },
];

export class CorridorSectionRegistry {
  private sections: CorridorSection[] = CORRIDOR_SECTIONS;

  getAll(): CorridorSection[] {
    return this.sections;
  }

  getById(id: string): CorridorSection | undefined {
    return this.sections.find((s) => s.id === id);
  }

  getBySpaceId(spaceId: string): CorridorSection | undefined {
    return this.sections.find((s) => s.spaceId === spaceId);
  }

  getSectionsForBuilding(buildingId: string): CorridorSection[] {
    const norm = buildingId.startsWith("fs_") ? buildingId : `fs_${buildingId}`;
    return this.sections.filter((s) => s.buildingId === norm);
  }

  getSectionsForBuildingAndFloor(buildingId: string, floorId?: string): CorridorSection[] {
    const norm = buildingId.startsWith("fs_") ? buildingId : `fs_${buildingId}`;
    return this.sections.filter((s) => {
      if (s.buildingId !== norm) return false;
      if (floorId && floorId !== "all" && s.floorId !== floorId) return false;
      return true;
    });
  }
}

export const corridorSectionRegistry = new CorridorSectionRegistry();
