import { prisma } from "@/lib/db";

const DESIRED = [
  {
    key: "method",
    name: "Be Toro Method (BTM)",
    description:
      "Be Toro Method is our signature high-intensity, low-impact workout designed to energize both body and mind. In 50-minute sessions, we combine music, rhythm, and powerful movement to create a dynamic full-body experience. Using light weights and mat-based exercises, each class flows to the beat, blending strength, control, and bursts of cardio. The result is a workout that not only challenges you physically, but also leaves you feeling recharged, uplifted, and empowered.",
    tags: [
      "signature",
      "high intensity",
      "low impact",
      "music",
      "rhythm",
      "beat-driven",
      "full body",
      "strength",
      "control",
      "cardio",
      "light weights",
      "mat-based",
      "energizing",
      "mind-body",
    ],
    icon: "music",
    duration: 50,
    level: "ALL" as const,
  },
  {
    key: "tone",
    name: "Be Toro Tone (BTM Tone)",
    description:
      "Be Toro Tone builds on the foundation of our signature method, focusing on strength and muscle definition. This 50-minute session keeps the same rhythm-driven, mat-based structure, but incorporates heavier weights and removes cardio to allow for deeper, more controlled work. It’s designed to sculpt, tone, and strengthen your entire body while maintaining the signature Be Toro energy—intense, focused, and deeply satisfying.",
    tags: [
      "strength",
      "muscle definition",
      "sculpt",
      "tone",
      "heavier weights",
      "controlled",
      "rhythm-driven",
      "mat-based",
      "no cardio",
      "full body",
      "intense",
      "focused",
    ],
    icon: "biceps-flexed",
    duration: 50,
    level: "ALL" as const,
  },
  {
    key: "flow",
    name: "Be Toro Flow (BTM Flow)",
    description:
      "Be Toro Flow is a softer, more mindful version of our method, created for moments when your body craves movement without intensity. Inspired by yoga, this no-weight session focuses on stretching, mobility, and fluid sequences that still move to the rhythm. It’s the perfect balance between relaxation and activation, offering a gentle yet powerful reset that leaves you feeling just as uplifted, centered, and re-energized.",
    tags: [
      "flow",
      "mindful",
      "yoga-inspired",
      "no weights",
      "stretching",
      "mobility",
      "fluid",
      "rhythm",
      "relaxation",
      "activation",
      "reset",
      "gentle",
      "centered",
    ],
    icon: "waves",
    duration: 50,
    level: "ALL" as const,
  },
] as const;

function pickTenantId(tenants: { id: string; name: string }[]) {
  const env = process.env.TENANT_ID?.trim();
  if (env) return env;
  if (tenants.length === 1) return tenants[0]!.id;
  return null;
}

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function findMatch(classTypes: { id: string; name: string }[], key: string) {
  const byKey = classTypes.find((ct) => normalize(ct.name).includes(`btm ${key}`));
  if (byKey) return byKey;
  const byName = classTypes.find((ct) => normalize(ct.name).includes(`be toro ${key}`));
  if (byName) return byName;
  // fallback: any "BTM" record that contains the key word
  const any = classTypes.find((ct) => normalize(ct.name).includes("btm") && normalize(ct.name).includes(key));
  return any ?? null;
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  const tenantId = pickTenantId(tenants);
  if (!tenantId) {
    throw new Error(
      `Multiple tenants found. Re-run with TENANT_ID=<id>. Tenants: ${tenants
        .map((t) => `${t.name}:${t.id}`)
        .join(", ")}`,
    );
  }

  const classTypes = await prisma.classType.findMany({
    where: { tenantId },
    select: { id: true, name: true, color: true },
  });

  if (classTypes.length === 0) {
    throw new Error("No ClassType records found for tenant.");
  }

  for (const d of DESIRED) {
    const match = findMatch(classTypes, d.key);
    if (!match) {
      // Create if it doesn't exist; does not delete or modify others.
      await prisma.classType.create({
        data: {
          tenantId,
          name: d.name,
          description: d.description,
          duration: d.duration,
          level: d.level,
          color: "#1A2C4E",
          icon: d.icon,
          tags: [...d.tags],
        },
      });
      continue;
    }

    await prisma.classType.update({
      where: { id: match.id },
      data: {
        name: d.name,
        description: d.description,
        duration: d.duration,
        level: d.level,
        icon: d.icon,
        tags: [...d.tags],
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

