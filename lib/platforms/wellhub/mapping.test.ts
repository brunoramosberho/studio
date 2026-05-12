import { describe, expect, it } from "vitest";
import {
  capacityPatchPayload,
  classToWellhubSlotPayload,
  classTypeToWellhubCreatePayload,
  classTypeToWellhubUpdatePayload,
  type MagicClassForSync,
  type MagicClassTypeForSync,
} from "./mapping";

const sampleClassType: MagicClassTypeForSync = {
  id: "ct_abc",
  name: "Cycling",
  description: "Indoor cycling, 60 minutes",
  duration: 60,
  wellhubProductId: 12345,
  wellhubCategoryIds: [1, 7],
};

const sampleClass = (overrides: Partial<MagicClassForSync> = {}): MagicClassForSync => ({
  id: "cls_1",
  startsAt: new Date("2026-06-15T17:00:00Z"),
  endsAt: new Date("2026-06-15T18:00:00Z"),
  notes: null,
  room: { name: "Sala A" },
  capacity: 10,
  bookedSpots: 3,
  instructors: [{ name: "Ana García" }],
  ...overrides,
});

describe("classTypeToWellhubCreatePayload", () => {
  it("maps required fields and uses Magic class id as reference", () => {
    const payload = classTypeToWellhubCreatePayload(sampleClassType);
    expect(payload).toMatchObject({
      name: "Cycling",
      description: "Indoor cycling, 60 minutes",
      bookable: true,
      visible: true,
      product_id: 12345,
      reference: "ct_abc",
      categories: [1, 7],
    });
  });

  it("falls back to the name when description is empty", () => {
    const payload = classTypeToWellhubCreatePayload({
      ...sampleClassType,
      description: "   ",
    });
    expect(payload.description).toBe("Cycling");
  });

  it("omits categories when empty", () => {
    const payload = classTypeToWellhubCreatePayload({
      ...sampleClassType,
      wellhubCategoryIds: [],
    });
    expect(payload.categories).toBeUndefined();
  });

  it("throws when product mapping is missing", () => {
    expect(() =>
      classTypeToWellhubCreatePayload({
        ...sampleClassType,
        wellhubProductId: null,
      }),
    ).toThrow(/wellhubProductId/);
  });

  it("truncates names beyond Wellhub's 255-char ceiling", () => {
    const name = "A".repeat(300);
    const payload = classTypeToWellhubCreatePayload({ ...sampleClassType, name });
    expect(payload.name.length).toBe(255);
  });
});

describe("classTypeToWellhubUpdatePayload", () => {
  it("supports flipping visibility off (used as the soft-delete)", () => {
    const payload = classTypeToWellhubUpdatePayload(sampleClassType, { visible: false });
    expect(payload.visible).toBe(false);
    expect(payload.bookable).toBe(true);
  });
});

describe("classToWellhubSlotPayload", () => {
  it("computes length_in_minutes from startsAt/endsAt", () => {
    const payload = classToWellhubSlotPayload(sampleClass(), sampleClassType);
    expect(payload.length_in_minutes).toBe(60);
  });

  it("sets cancellable_until exactly 24h before the slot", () => {
    const payload = classToWellhubSlotPayload(sampleClass(), sampleClassType);
    expect(payload.cancellable_until).toBe("2026-06-14T17:00:00.000Z");
  });

  it("clamps capacity and booked into Wellhub's 0..32000 range", () => {
    const payload = classToWellhubSlotPayload(
      sampleClass({ capacity: 50_000, bookedSpots: -3 }),
      sampleClassType,
    );
    expect(payload.total_capacity).toBe(32_000);
    expect(payload.total_booked).toBe(0);
  });

  it("prevents total_booked from exceeding total_capacity", () => {
    const payload = classToWellhubSlotPayload(
      sampleClass({ capacity: 10, bookedSpots: 25 }),
      sampleClassType,
    );
    expect(payload.total_booked).toBeLessThanOrEqual(payload.total_capacity);
    expect(payload.total_booked).toBe(10);
  });

  it("clamps length to 1..200 minutes", () => {
    const tooLong = classToWellhubSlotPayload(
      sampleClass({
        startsAt: new Date("2026-06-15T17:00:00Z"),
        endsAt: new Date("2026-06-15T22:00:00Z"), // 300 min
      }),
      sampleClassType,
    );
    expect(tooLong.length_in_minutes).toBe(200);

    const tooShort = classToWellhubSlotPayload(
      sampleClass({
        startsAt: new Date("2026-06-15T17:00:00Z"),
        endsAt: new Date("2026-06-15T17:00:00Z"), // 0 min
      }),
      sampleClassType,
    );
    expect(tooShort.length_in_minutes).toBe(1);
  });

  it("drops short or empty room names", () => {
    const noRoom = classToWellhubSlotPayload(
      sampleClass({ room: null }),
      sampleClassType,
    );
    expect(noRoom.room).toBeUndefined();

    const oneChar = classToWellhubSlotPayload(
      sampleClass({ room: { name: "A" } }),
      sampleClassType,
    );
    expect(oneChar.room).toBeUndefined();
  });

  it("keeps the substitute flag from the input", () => {
    const payload = classToWellhubSlotPayload(
      sampleClass({
        instructors: [
          { name: "Original", isSubstitute: false },
          { name: "Substitute", isSubstitute: true },
        ],
      }),
      sampleClassType,
    );
    expect(payload.instructors).toEqual([
      { name: "Original", substitute: false },
      { name: "Substitute", substitute: true },
    ]);
  });

  it("emits ISO-8601 occur_date even for non-UTC inputs", () => {
    const payload = classToWellhubSlotPayload(
      sampleClass({
        startsAt: new Date("2026-06-15T12:00:00-05:00"),
        endsAt: new Date("2026-06-15T13:00:00-05:00"),
      }),
      sampleClassType,
    );
    expect(payload.occur_date).toMatch(/^\d{4}-\d{2}-\d{2}T17:00:00\.000Z$/);
  });

  it("throws when product mapping is missing", () => {
    expect(() =>
      classToWellhubSlotPayload(sampleClass(), {
        id: "ct_x",
        wellhubProductId: null,
      }),
    ).toThrow(/wellhubProductId/);
  });
});

describe("capacityPatchPayload", () => {
  it("only includes provided fields", () => {
    expect(capacityPatchPayload({ totalCapacity: 12 })).toEqual({ total_capacity: 12 });
    expect(capacityPatchPayload({ totalBooked: 4 })).toEqual({ total_booked: 4 });
  });

  it("ensures total_booked never exceeds total_capacity when both present", () => {
    expect(capacityPatchPayload({ totalCapacity: 5, totalBooked: 10 })).toEqual({
      total_capacity: 5,
      total_booked: 5,
    });
  });
});
