import { describe, expect, it } from "vitest";
import { shortCoachName, surnameOf } from "./coach-name";

describe("shortCoachName", () => {
  it("abbreviates a plain two-part name", () => {
    expect(shortCoachName("Camila Toro")).toBe("Camila T.");
  });

  it("skips the particle in a compound surname", () => {
    // The whole point: "Sofia de" would distinguish nobody.
    expect(shortCoachName("Sofia de Palacio")).toBe("Sofia P.");
    expect(shortCoachName("Paulina de la Concha")).toBe("Paulina C.");
    expect(shortCoachName("Fer del Valle")).toBe("Fer V.");
    expect(shortCoachName("Sofia del Real")).toBe("Sofia R.");
  });

  it("tells apart every real collision in the rosters", () => {
    const sofias = ["Sofia Cincunegui", "Sofia del Real", "Sofia Fuentes"];
    expect(new Set(sofias.map((n) => shortCoachName(n))).size).toBe(3);

    const marias = ["Maria Castillo", "Maria Ricalde", "Maria Ferre"];
    expect(new Set(marias.map((n) => shortCoachName(n))).size).toBe(3);

    const paulinas = ["Paulina de la Concha", "Paulina de la Mora"];
    expect(new Set(paulinas.map((n) => shortCoachName(n))).size).toBe(2);

    const reginas = ["Regina Cervantes", "Regina P"];
    expect(new Set(reginas.map((n) => shortCoachName(n))).size).toBe(2);
  });

  it("leaves a single-word name alone", () => {
    expect(shortCoachName("Zarina")).toBe("Zarina");
  });

  it("doesn't add a dot when the surname is already whole", () => {
    // "Mer H" is stored abbreviated; "Mer H." still reads as an abbreviation,
    // which is fine. A full short surname shouldn't gain a false dot.
    expect(shortCoachName("Ana Paz", 3)).toBe("Ana Paz");
    expect(shortCoachName("Roberta Soto", 3)).toBe("Roberta Sot.");
  });

  it("can show more of the surname when there's room", () => {
    expect(shortCoachName("Sofia Cincunegui", 3)).toBe("Sofia Cin.");
  });

  it("handles empty and missing names without throwing", () => {
    expect(shortCoachName(null)).toBe("");
    expect(shortCoachName(undefined)).toBe("");
    expect(shortCoachName("   ")).toBe("");
  });

  it("collapses extra whitespace", () => {
    expect(shortCoachName("  Camila   Toro  ")).toBe("Camila T.");
  });
});

describe("surnameOf", () => {
  it("returns null when there's nothing but particles", () => {
    expect(surnameOf("Ana de")).toBeNull();
    expect(surnameOf("Zarina")).toBeNull();
  });
});
