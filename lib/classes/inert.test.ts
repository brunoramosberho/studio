import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASS_REFERENCING_TABLES } from "./inert";

/**
 * The inertness check decides whether a class row gets deleted, so it has to
 * know about every table that could still point at it. A new table with a
 * classId that nobody adds here would make `findInertClassIds` call an
 * encumbered class empty — and the delete would take real history with it.
 *
 * Rather than trusting a comment, this reads the schema and fails on drift.
 */
function modelsWithClassId(): string[] {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const found: string[] = [];

  for (const block of schema.split(/\nmodel /).slice(1)) {
    const name = block.slice(0, block.search(/\s/));
    const body = block.slice(0, block.indexOf("\n}"));
    // Any scalar FK pointing at a class: classId, and the swap variant that
    // names the column differently.
    const lines = body.split("\n").filter((l) => !l.trim().startsWith("//"));
    if (lines.some((l) => /^\s*(classId|swapWithClassId)\s+String/.test(l))) {
      found.push(name);
    }
  }
  return found;
}

describe("class-referencing tables", () => {
  it("covers every model in the schema that holds a classId", () => {
    const inSchema = modelsWithClassId().filter((m) => m !== "Class");
    const covered = new Set<string>(CLASS_REFERENCING_TABLES);
    const missing = inSchema.filter((m) => !covered.has(m));

    expect(
      missing,
      `These models reference a Class but are not checked before deleting one. ` +
        `Add them to CLASS_REFERENCING_TABLES and to either COUNTED_RELATIONS ` +
        `(if Class exposes the relation) or UNRELATED_TABLES.`,
    ).toEqual([]);
  });

  it("does not claim to cover models that no longer exist", () => {
    const inSchema = new Set(modelsWithClassId());
    const stale = CLASS_REFERENCING_TABLES.filter((m) => !inSchema.has(m));
    expect(stale).toEqual([]);
  });

  it("finds a meaningful number of tables, so a parser slip can't pass silently", () => {
    // If the schema parsing broke and returned nothing, both checks above would
    // pass vacuously.
    expect(modelsWithClassId().length).toBeGreaterThan(10);
  });
});
