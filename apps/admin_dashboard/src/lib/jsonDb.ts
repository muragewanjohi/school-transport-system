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
