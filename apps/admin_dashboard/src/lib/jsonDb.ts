import fs from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "students_db.json");

export const defaultMockStudents = [
  {
    id: "std-1",
    name: "Liam Mwangi",
    route_id: "route-1",
    nfc_card_hash: "A1B2C3D4",
    status: "Present",
    grade: "Grade 4",
    class_name: "4 Blue",
    pickup_stop_id: "stop-1-1",
    dropoff_stop_id: "stop-1-2",
    schedule_ids: ["sched-1-1", "sched-1-3"],
    guardians: [
      { name: "James Mwangi", phone: "+254 700 111 222" },
      { name: "Sarah Mwangi", phone: "+254 700 111 333" }
    ],
    route: { name: "Morning Route 1 (Kileleshwa)" }
  },
  {
    id: "std-2",
    name: "Emma Kamau",
    route_id: "route-2",
    nfc_card_hash: "E5F6G7H8",
    status: "Present",
    grade: "Grade 3",
    class_name: "3 Red",
    pickup_stop_id: "stop-2-1",
    dropoff_stop_id: "stop-2-2",
    schedule_ids: ["sched-2-1"],
    guardians: [
      { name: "Mary Kamau", phone: "+254 711 222 333" }
    ],
    route: { name: "Morning Route 2 (Westlands)" }
  },
  {
    id: "std-3",
    name: "Noah Ochieng",
    route_id: "route-4",
    nfc_card_hash: "I9J0K1L2",
    status: "Absent",
    grade: "Grade 5",
    class_name: "5 Yellow",
    pickup_stop_id: "stop-4-1",
    dropoff_stop_id: "stop-4-2",
    schedule_ids: ["sched-4-1"],
    guardians: [
      { name: "Alice Ochieng", phone: "+254 722 333 444" }
    ],
    route: { name: "Morning Route 4 (Kilimani)" }
  },
  {
    id: "std-4",
    name: "Ava Ndwiga",
    route_id: "route-1",
    nfc_card_hash: "M3N4O5P6",
    status: "Present",
    grade: "Grade 4",
    class_name: "4 Blue",
    pickup_stop_id: "stop-1-2",
    dropoff_stop_id: "stop-1-1",
    schedule_ids: ["sched-1-2", "sched-1-4"],
    guardians: [
      { name: "Robert Ndwiga", phone: "+254 733 444 555" }
    ],
    route: { name: "Morning Route 1 (Kileleshwa)" }
  }
];

export function getLocalStudents(): any[] {
  if (!fs.existsSync(dbPath)) {
    try {
      fs.writeFileSync(dbPath, JSON.stringify(defaultMockStudents, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to initialize students_db.json:", e);
    }
    return defaultMockStudents;
  }
  try {
    const data = fs.readFileSync(dbPath, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to parse students_db.json, falling back to default mock list:", e);
    return defaultMockStudents;
  }
}

export function saveLocalStudents(students: any[]): void {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(students, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write to students_db.json:", e);
  }
}

const vehiclesDbPath = path.join(process.cwd(), "vehicles_db.json");

export const defaultMockVehicles = [
  {
    id: "bus-1",
    license_plate: "KBC 104D",
    model: "Isuzu FRR 33-Seater",
    capacity: 33,
    status: "Active",
    fuel_level: 82,
    odometer: 14205.8,
    last_service_date: "2026-05-12",
    next_service_date: "2026-08-12",
    insurance_expiry: "2027-01-15",
    active_driver_id: "drv-1",
    conductor_1_id: "cnd-1",
    conductor_2_id: "cnd-2",
    driver: { id: "drv-1", name: "John Kamau", phone: "+254 712 345 678" },
    conductor_1: { id: "cnd-1", name: "Jane Wanjiku", phone: "+254 755 123 456" },
    conductor_2: { id: "cnd-2", name: "Sam Mutua", phone: "+254 788 321 654" }
  },
  {
    id: "bus-2",
    license_plate: "KCD 542A",
    model: "Toyota Coaster 29-Seater",
    capacity: 29,
    status: "Active",
    fuel_level: 65,
    odometer: 8904.2,
    last_service_date: "2026-06-01",
    next_service_date: "2026-09-01",
    insurance_expiry: "2026-12-10",
    active_driver_id: "drv-2",
    conductor_1_id: "cnd-3",
    conductor_2_id: null,
    driver: { id: "drv-2", name: "David Ochieng", phone: "+254 722 890 123" },
    conductor_1: { id: "cnd-3", name: "Grace Nekesa", phone: "+254 744 789 012" },
    conductor_2: null
  },
  {
    id: "bus-3",
    license_plate: "KDD 889X",
    model: "Isuzu MV123 51-Seater",
    capacity: 51,
    status: "Maintenance",
    fuel_level: 12,
    odometer: 45601.5,
    last_service_date: "2026-06-15",
    next_service_date: "2026-06-18",
    insurance_expiry: "2026-10-22",
    active_driver_id: "drv-3",
    conductor_1_id: "cnd-4",
    conductor_2_id: null,
    driver: { id: "drv-3", name: "Peter Ndwiga", phone: "+254 733 456 789" },
    conductor_1: { id: "cnd-4", name: "Lucy Wambui", phone: "+254 799 444 555" },
    conductor_2: null
  },
  {
    id: "bus-4",
    license_plate: "KBZ 445B",
    model: "Toyota Hiace 14-Seater",
    capacity: 14,
    status: "Active",
    fuel_level: 95,
    odometer: 1205.3,
    last_service_date: "2026-04-10",
    next_service_date: "2026-07-10",
    insurance_expiry: "2026-11-05",
    active_driver_id: "drv-4",
    conductor_1_id: null,
    conductor_2_id: null,
    driver: { id: "drv-4", name: "Michael Mwangi", phone: "+254 701 111 222" },
    conductor_1: null,
    conductor_2: null
  },
  {
    id: "bus-5",
    license_plate: "KCA 998Y",
    model: "Nissan Civilian 26-Seater",
    capacity: 26,
    status: "Out of Service",
    fuel_level: 40,
    odometer: 28940.1,
    last_service_date: "2026-02-14",
    next_service_date: "2026-05-14",
    insurance_expiry: "2026-06-01",
    active_driver_id: null,
    conductor_1_id: null,
    conductor_2_id: null,
    driver: null,
    conductor_1: null,
    conductor_2: null
  },
  {
    id: "bus-6",
    license_plate: "KCA 123",
    model: "Isuzu FRR 33-Seater",
    capacity: 33,
    status: "Active",
    fuel_level: 90,
    odometer: 15400.0,
    last_service_date: "2026-06-01",
    next_service_date: "2026-09-01",
    insurance_expiry: "2027-02-15",
    active_driver_id: null,
    conductor_1_id: null,
    conductor_2_id: null,
    driver: null,
    conductor_1: null,
    conductor_2: null
  }
];

export function getLocalVehicles(): any[] {
  if (!fs.existsSync(vehiclesDbPath)) {
    try {
      fs.writeFileSync(vehiclesDbPath, JSON.stringify(defaultMockVehicles, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to initialize vehicles_db.json:", e);
    }
    return defaultMockVehicles;
  }
  try {
    const data = fs.readFileSync(vehiclesDbPath, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to parse vehicles_db.json, falling back to default mock list:", e);
    return defaultMockVehicles;
  }
}

export function saveLocalVehicles(vehicles: any[]): void {
  try {
    fs.writeFileSync(vehiclesDbPath, JSON.stringify(vehicles, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write to vehicles_db.json:", e);
  }
}

