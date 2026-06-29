import { describe, it, expect } from "vitest";
import { suggestEmailCorrection } from "./email-typo";

describe("suggestEmailCorrection", () => {
  it("fixes TLD typos like .con → .com", () => {
    expect(suggestEmailCorrection("bruno@gmail.con")).toBe("bruno@gmail.com");
    expect(suggestEmailCorrection("ana@company.con")).toBe("ana@company.com");
    expect(suggestEmailCorrection("x@empresa.cmo")).toBe("x@empresa.com");
  });

  it("fixes mistyped popular domains", () => {
    expect(suggestEmailCorrection("bruno@gmial.com")).toBe("bruno@gmail.com");
    expect(suggestEmailCorrection("bruno@hotmial.com")).toBe("bruno@hotmail.com");
    expect(suggestEmailCorrection("bruno@outlok.com")).toBe("bruno@outlook.com");
    expect(suggestEmailCorrection("bruno@iclod.com")).toBe("bruno@icloud.com");
    expect(suggestEmailCorrection("bruno@yahooo.com")).toBe("bruno@yahoo.com");
  });

  it("preserves the local part's casing", () => {
    expect(suggestEmailCorrection("Bruno.R@gmial.com")).toBe("Bruno.R@gmail.com");
  });

  it("returns null for correct addresses", () => {
    expect(suggestEmailCorrection("bruno@gmail.com")).toBeNull();
    expect(suggestEmailCorrection("bruno@hotmail.com")).toBeNull();
    expect(suggestEmailCorrection("deeusebio.su@northeastern.edu")).toBeNull();
  });

  it("does not flag valid non-.com TLDs", () => {
    expect(suggestEmailCorrection("contacto@empresa.mx")).toBeNull();
    expect(suggestEmailCorrection("user@startup.io")).toBeNull();
    expect(suggestEmailCorrection("hola@negocio.com.mx")).toBeNull();
  });

  it("stays quiet while the address is still incomplete", () => {
    expect(suggestEmailCorrection("bruno")).toBeNull();
    expect(suggestEmailCorrection("bruno@")).toBeNull();
    expect(suggestEmailCorrection("bruno@gmail")).toBeNull();
    expect(suggestEmailCorrection("bruno@gmail.")).toBeNull();
    expect(suggestEmailCorrection("")).toBeNull();
  });
});
