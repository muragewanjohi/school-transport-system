import { describe, expect, it } from "vitest";
import { driverVehicleAssignmentOps, emptyToNullVehicleId } from "@/lib/assignDriverVehicle";

describe("driverVehicleAssignmentOps › register driver with a bus", () => {
  it("Given a new driver and a selected bus, When assignment ops are built, Then the bus is set to that driver after clearing any previous bus", () => {
    const ops = driverVehicleAssignmentOps("driver-1", "vehicle-9");
    expect(ops.clearDriverId).toBe("driver-1");
    expect(ops.setVehicleId).toBe("vehicle-9");
    expect(ops.setDriverId).toBe("driver-1");
  });
});

describe("driverVehicleAssignmentOps › allocate bus on the drivers page", () => {
  it("Given an existing driver, When a vehicle is chosen, Then ops clear the driver then set the new vehicle", () => {
    const ops = driverVehicleAssignmentOps("drv-a", "bus-uuid");
    expect(ops.setVehicleId).toBe("bus-uuid");
    expect(ops.setDriverId).toBe("drv-a");
  });

  it("Given an assigned driver, When standby is chosen, Then only the previous assignment is cleared", () => {
    const ops = driverVehicleAssignmentOps("drv-a", null);
    expect(ops.setVehicleId).toBeNull();
    expect(ops.clearDriverId).toBe("drv-a");
  });
});

describe("emptyToNullVehicleId › failed allocation is not reported as saved", () => {
  it("Given an empty dropdown value, When parsed, Then it is standby (null) rather than an invalid id", () => {
    expect(emptyToNullVehicleId("")).toBeNull();
    expect(emptyToNullVehicleId(undefined)).toBeNull();
    expect(emptyToNullVehicleId("veh-1")).toBe("veh-1");
  });
});
