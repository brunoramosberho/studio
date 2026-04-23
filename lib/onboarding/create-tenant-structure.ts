import { prisma } from "@/lib/db";
import { Level, Role } from "@prisma/client";
import type { ExtractedData } from "./types";

function mapLevel(level: string | null): Level {
  switch (level) {
    case "beginner": return Level.BEGINNER;
    case "intermediate": return Level.INTERMEDIATE;
    case "advanced": return Level.ADVANCED;
    default: return Level.ALL;
  }
}

function deriveAccentSoft(accent: string | null): string {
  if (!accent) return "#FFF1EE";
  // Lighten the accent color for soft variant
  const hex = accent.replace("#", "");
  const r = Math.min(255, parseInt(hex.slice(0, 2), 16) + 200);
  const g = Math.min(255, parseInt(hex.slice(2, 4), 16) + 200);
  const b = Math.min(255, parseInt(hex.slice(4, 6), 16) + 200);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export interface TenantStructure {
  tenantId: string;
  classTypes: { id: string; name: string; duration: number; color: string; icon: string | null }[];
  coachProfiles: { id: string; name: string; userId: string }[];
  rooms: { id: string; maxCapacity: number; studioId: string; cityTimezone: string }[];
  adminUserId: string;
}

export async function createTenantStructure(
  data: ExtractedData,
  slug: string,
  superAdminUserId: string,
): Promise<TenantStructure> {
  // 1. Create tenant
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: data.identity.name,
      tagline: data.identity.tagline || "Fitness & Wellness",
      slogan: data.identity.slogan || "",
      metaDescription: data.identity.seoDescription || "",
      communityHeadline: data.identity.homeHeadline || "Tu comunidad en movimiento",
      logoUrl: data.brand.logoUrl,
      colorBg: "#FFFFFF",
      colorFg: "#18181B",
      colorSurface: "#FAFAFA",
      // Brand color = primaryColor. All other colors stay as system defaults.
      colorAccent: data.brand.primaryColor || "#FF5A2C",
      colorAccentSoft: deriveAccentSoft(data.brand.primaryColor),
      colorMuted: "#71717A",
      colorBorder: "#E4E4E7",
      colorHeroBg: data.brand.landingBgColor || "#18181B",
      colorCoach: "#EA580C",
      colorAdmin: "#EA580C",
      landingUrl: data.identity.websiteUrl,
      locale: "es",
    },
  });
  const tenantId = tenant.id;

  // 2. Admin membership for super-admin
  await prisma.membership.create({
    data: { userId: superAdminUserId, tenantId, role: Role.ADMIN },
  });

  // 3. Class types from disciplines
  // Use secondaryColors as fallback palette for disciplines without a suggestedColor
  const secondaryPalette = data.brand.secondaryColors || [];
  const classTypes = [];
  for (let i = 0; i < data.disciplines.length; i++) {
    const disc = data.disciplines[i];
    const fallbackColor = secondaryPalette[i % secondaryPalette.length]
      || data.brand.primaryColor
      || "#6366f1";
    const ct = await prisma.classType.create({
      data: {
        tenantId,
        name: disc.name,
        description: disc.description,
        duration: disc.durationMinutes || 50,
        level: mapLevel(disc.level),
        color: disc.suggestedColor || fallbackColor,
        icon: disc.suggestedIcon || "dumbbell",
        tags: disc.tags,
      },
    });
    classTypes.push({
      id: ct.id,
      name: ct.name,
      duration: ct.duration,
      color: ct.color,
      icon: ct.icon,
    });
  }

  // If no disciplines were extracted, create a default one
  if (classTypes.length === 0) {
    const ct = await prisma.classType.create({
      data: {
        tenantId,
        name: "Clase",
        description: "Clase general",
        duration: 50,
        level: Level.ALL,
        color: data.brand.primaryColor || "#6366f1",
        icon: "dumbbell",
        tags: [],
      },
    });
    classTypes.push({ id: ct.id, name: ct.name, duration: ct.duration, color: ct.color, icon: ct.icon });
  }

  // 4. Coach profiles
  const coachProfiles = [];
  for (let i = 0; i < data.coaches.length; i++) {
    const c = data.coaches[i];
    const coachUser = await prisma.user.create({
      data: {
        email: `coach-${slug}-${i}@demo.mgic.app`,
        name: c.name,
        role: Role.COACH,
        image: c.photoUrl || `https://i.pravatar.cc/200?img=${40 + i}`,
      },
    });
    const profile = await prisma.coachProfile.create({
      data: {
        name: c.name,
        userId: coachUser.id,
        tenantId,
        specialties: c.specialties,
        photoUrl: c.photoUrl,
        color: data.brand.primaryColor || "#C9A96E",
      },
    });
    await prisma.membership.create({
      data: { userId: coachUser.id, tenantId, role: Role.COACH },
    });
    coachProfiles.push({ id: profile.id, name: profile.name, userId: coachUser.id });
  }

  // If no coaches, create a default one
  if (coachProfiles.length === 0) {
    const coachUser = await prisma.user.create({
      data: {
        email: `coach-${slug}-0@demo.mgic.app`,
        name: "Coach Demo",
        role: Role.COACH,
        image: "https://i.pravatar.cc/200?img=40",
      },
    });
    const profile = await prisma.coachProfile.create({
      data: {
        name: "Coach Demo",
        userId: coachUser.id,
        tenantId,
        specialties: [],
        color: data.brand.primaryColor || "#C9A96E",
      },
    });
    await prisma.membership.create({
      data: { userId: coachUser.id, tenantId, role: Role.COACH },
    });
    coachProfiles.push({ id: profile.id, name: profile.name, userId: coachUser.id });
  }

  // 5. Locations → Studios → Rooms
  const rooms: { id: string; maxCapacity: number; studioId: string; cityTimezone: string }[] = [];

  if (data.locations.length > 0) {
    for (const loc of data.locations) {
      // Find or create country/city
      let city = loc.city
        ? await prisma.city.findFirst({ where: { name: loc.city } })
        : null;
      if (!city) {
        let country = await prisma.country.findFirst({ where: { code: "MX" } });
        if (!country) {
          country = await prisma.country.create({
            data: {
              name: "México",
              code: "MX",
              currency: "MXN",
              currencySymbol: "$",
              intlLocale: "es-MX",
            },
          });
        }
        city = await prisma.city.create({
          data: {
            name: loc.city || "Ciudad",
            countryId: country.id,
            timezone: "America/Mexico_City",
          },
        });
      }

      const studio = await prisma.studio.create({
        data: {
          tenantId,
          name: loc.name || `${data.identity.name} ${loc.city || ""}`.trim(),
          address: loc.address,
          cityId: city.id,
        },
      });

      // One room per class type per studio
      for (const ct of classTypes) {
        const room = await prisma.room.create({
          data: {
            tenantId,
            name: `Sala ${ct.name}`,
            studioId: studio.id,
            maxCapacity: 12 + Math.floor(Math.random() * 8), // 12-20
            classTypes: { connect: { id: ct.id } },
          },
        });
        rooms.push({ id: room.id, maxCapacity: room.maxCapacity, studioId: studio.id, cityTimezone: city.timezone });
      }
    }
  } else {
    // Default: 1 studio, 1 room per class type
    let country = await prisma.country.findFirst({ where: { code: "MX" } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          name: "México",
          code: "MX",
          currency: "MXN",
          currencySymbol: "$",
          intlLocale: "es-MX",
        },
      });
    }
    let city = await prisma.city.findFirst({ where: { name: "Ciudad de México" } });
    if (!city) {
      city = await prisma.city.create({
        data: { name: "Ciudad de México", countryId: country.id, timezone: "America/Mexico_City" },
      });
    }
    const studio = await prisma.studio.create({
      data: { tenantId, name: data.identity.name, address: null, cityId: city.id },
    });
    for (const ct of classTypes) {
      const room = await prisma.room.create({
        data: {
          tenantId,
          name: `Sala ${ct.name}`,
          studioId: studio.id,
          maxCapacity: 15,
          classTypes: { connect: { id: ct.id } },
        },
      });
      rooms.push({ id: room.id, maxCapacity: room.maxCapacity, studioId: studio.id, cityTimezone: city.timezone });
    }
  }

  // Anchor the tenant to its primary country for currency/locale defaults.
  const firstRoomStudioId = rooms[0]?.studioId;
  if (firstRoomStudioId) {
    const primaryStudio = await prisma.studio.findUnique({
      where: { id: firstRoomStudioId },
      select: { city: { select: { countryId: true } } },
    });
    if (primaryStudio?.city.countryId) {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { defaultCountryId: primaryStudio.city.countryId },
      });
    }
  }

  // 6. Packages
  const currency = data.brand.currency || "MXN";
  for (const pkg of data.packages) {
    await prisma.package.create({
      data: {
        tenantId,
        name: pkg.name,
        type: pkg.type === "subscription" ? "SUBSCRIPTION" : pkg.type === "offer" ? "OFFER" : "PACK",
        credits: pkg.unlimited ? null : (pkg.credits || 1),
        validDays: pkg.validityDays || 30,
        price: pkg.price || 0,
        currency,
        description: pkg.description,
        recurringInterval: pkg.periodicity === "monthly" ? "month" : pkg.periodicity === "annual" ? "year" : null,
        isPromo: pkg.type === "offer",
      },
    });
  }

  return { tenantId, classTypes, coachProfiles, rooms, adminUserId: superAdminUserId };
}
