import {
  PrismaClient,
  Prisma,
  Role,
  Level,
  ClassStatus,
  BookingStatus,
} from "@prisma/client";
import { addDays, setHours, setMinutes, startOfWeek, subWeeks, addMinutes, format } from "date-fns";
import { es } from "date-fns/locale";
import {
  getTenantBrandingFromEnv,
  tenantCreateData,
  studioSettingsData,
} from "./seed-branding";
import { seedBeToroShop } from "./seed-shop";
import {
  feedAchievementTypeFromKey,
  LOYALTY_LEVELS_SEED,
  SYSTEM_ACHIEVEMENTS_SEED,
} from "../lib/gamification/catalog";

const prisma = new PrismaClient();

async function main() {
  const branding = getTenantBrandingFromEnv();
  console.log("🌱 Seeding Flō Studio database...\n");
  console.log(
    `   Tenant: ${branding.name} (${branding.slug}) — branding desde env SEED_* o valores por defecto\n`,
  );

  // Clear existing data (respecting foreign key order)
  await prisma.studioSettings.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.favoriteSong.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.like.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.feedEvent.deleteMany();
  await prisma.memberAchievement.deleteMany();
  await prisma.memberReward.deleteMany();
  await prisma.memberProgress.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.loyaltyLevel.deleteMany();
  await prisma.waitlist.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.class.deleteMany();
  await prisma.room.deleteMany();
  await prisma.studio.deleteMany();
  await prisma.city.deleteMany();
  await prisma.country.deleteMany();
  await prisma.classType.deleteMany();
  await prisma.userPackage.deleteMany();
  await prisma.package.deleteMany();
  await prisma.coachProfile.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.tenant.deleteMany();

  console.log("✓ Cleared existing data");

  // --- Tenant (marca: .env SEED_* o defaults en seed-branding.ts) ---
  const tenant = await prisma.tenant.create({
    data: tenantCreateData(branding),
  });
  const tenantId = tenant.id;
  console.log("✓ Created tenant: " + tenant.slug);

  for (const L of LOYALTY_LEVELS_SEED) {
    await prisma.loyaltyLevel.create({
      data: {
        sortOrder: L.sortOrder,
        name: L.name,
        minClasses: L.minClasses,
        icon: L.icon,
        color: L.color,
        rewardOnUnlock:
          L.rewardOnUnlock == null
            ? undefined
            : (L.rewardOnUnlock as Prisma.InputJsonValue),
      },
    });
  }

  for (const A of SYSTEM_ACHIEVEMENTS_SEED) {
    await prisma.achievement.create({
      data: {
        tenantId: null,
        key: A.key,
        name: A.name,
        description: A.description,
        icon: A.icon,
        category: A.category,
        triggerType: A.triggerType,
        triggerValue: A.triggerValue,
        triggerConfig:
          A.triggerConfig == null
            ? undefined
            : (A.triggerConfig as Prisma.InputJsonValue),
        rewardType: A.rewardType,
        rewardValue:
          A.rewardValue == null
            ? undefined
            : (A.rewardValue as Prisma.InputJsonValue),
        isSystem: true,
        active: true,
      },
    });
  }
  console.log(
    `✓ Gamificación: ${LOYALTY_LEVELS_SEED.length} niveles, ${SYSTEM_ACHIEVEMENTS_SEED.length} logros de sistema`,
  );

  // --- Class Types ---
  const btm = await prisma.classType.create({
    data: {
      tenantId,
      name: "BTM",
      duration: 55,
      level: Level.INTERMEDIATE,
      color: "#BF5E2A",
      icon: "music",
      description:
        "High intensity, low impact class powered by music and rhythm. Sculpt, tone, and sweat to the beat.",
      tags: [
        "Alta intensidad",
        "Bajo impacto",
        "Ritmo",
        "Música",
        "Tonificación",
        "Sculpt",
        "Full body",
        "Beat-driven",
      ],
    },
  });

  const btmFlow = await prisma.classType.create({
    data: {
      tenantId,
      name: "BTM Flow",
      duration: 45,
      level: Level.ALL,
      color: "#2D5016",
      icon: "waves",
      description:
        "Flowing sequences that build core strength, mobility, and body awareness at a steady, rhythmic pace.",
      tags: [
        "Flujo",
        "Core",
        "Movilidad",
        "Bajo impacto",
        "Flexibilidad",
        "Respiración",
        "Mind-body",
        "Recovery",
      ],
    },
  });

  const yoga = await prisma.classType.create({
    data: {
      tenantId,
      name: "Yoga",
      duration: 50,
      level: Level.ALL,
      color: "#8C8279",
      icon: "person-standing",
      description:
        "Connect body and breath: build flexibility, find calm, and restore your energy each session.",
      tags: [
        "Flexibilidad",
        "Respiración",
        "Mindfulness",
        "Postura",
        "Antiestrés",
        "Equilibrio",
        "Mat",
        "Relajación",
      ],
    },
  });

  const classTypes = [yoga, btmFlow, btm];
  console.log(`✓ Created ${classTypes.length} class types`);

  // --- Location Hierarchy: Country > City > Studio > Room ---
  const spain = await prisma.country.create({
    data: { name: "España", code: "ES" },
  });
  const mexico = await prisma.country.create({
    data: { name: "México", code: "MX" },
  });

  const madrid = await prisma.city.create({
    data: { name: "Madrid", countryId: spain.id, timezone: "Europe/Madrid" },
  });
  const cdmx = await prisma.city.create({
    data: { name: "Ciudad de México", countryId: mexico.id, timezone: "America/Mexico_City" },
  });

  // 2 studios in Madrid
  const studioSalamanca = await prisma.studio.create({
    data: { tenantId, name: "Flō Salamanca", address: "Calle de Serrano 45, Barrio de Salamanca", cityId: madrid.id },
  });
  const studioChamberi = await prisma.studio.create({
    data: { tenantId, name: "Flō Chamberí", address: "Calle de Fuencarral 112, Chamberí", cityId: madrid.id },
  });
  // 1 studio in CDMX
  const studioPolanco = await prisma.studio.create({
    data: { tenantId, name: "Flō Polanco", address: "Av. Presidente Masaryk 123, Polanco", cityId: cdmx.id },
  });

  // Rooms — Madrid Salamanca
  const roomReformerSalamanca = await prisma.room.create({
    data: { tenantId, name: "Sala Reformer", studioId: studioSalamanca.id, classTypes: { connect: { id: yoga.id } }, maxCapacity: 12 },
  });
  const roomMatSalamanca = await prisma.room.create({
    data: { tenantId, name: "Sala Mat", studioId: studioSalamanca.id, classTypes: { connect: { id: btmFlow.id } }, maxCapacity: 20 },
  });
  const roomBarreSalamanca = await prisma.room.create({
    data: { tenantId, name: "Sala Barre", studioId: studioSalamanca.id, classTypes: { connect: { id: btm.id } }, maxCapacity: 15 },
  });

  // Rooms — Madrid Chamberí
  const roomReformerChamberi = await prisma.room.create({
    data: { tenantId, name: "Sala Reformer", studioId: studioChamberi.id, classTypes: { connect: { id: yoga.id } }, maxCapacity: 10 },
  });
  const roomMatChamberi = await prisma.room.create({
    data: { tenantId, name: "Sala Mat", studioId: studioChamberi.id, classTypes: { connect: { id: btmFlow.id } }, maxCapacity: 16 },
  });
  const roomBarreChamberi = await prisma.room.create({
    data: { tenantId, name: "Sala Barre", studioId: studioChamberi.id, classTypes: { connect: { id: btm.id } }, maxCapacity: 12 },
  });

  // Rooms — CDMX Polanco
  const roomReformerPolanco = await prisma.room.create({
    data: { tenantId, name: "Sala Reformer", studioId: studioPolanco.id, classTypes: { connect: { id: yoga.id } }, maxCapacity: 12 },
  });
  const roomMatPolanco = await prisma.room.create({
    data: { tenantId, name: "Sala Mat", studioId: studioPolanco.id, classTypes: { connect: { id: btmFlow.id } }, maxCapacity: 18 },
  });
  const roomBarrePolanco = await prisma.room.create({
    data: { tenantId, name: "Sala Barre", studioId: studioPolanco.id, classTypes: { connect: { id: btm.id } }, maxCapacity: 14 },
  });

  // Map classType → rooms (alternate between Madrid studios; Polanco classes are separate)
  const roomsByClassType: Record<string, { id: string; maxCapacity: number }[]> = {
    [yoga.id]: [roomReformerSalamanca, roomReformerChamberi, roomReformerPolanco],
    [btmFlow.id]: [roomMatSalamanca, roomMatChamberi, roomMatPolanco],
    [btm.id]: [roomBarreSalamanca, roomBarreChamberi, roomBarrePolanco],
  };

  console.log("✓ Created location hierarchy (2 countries, 2 cities, 3 studios, 9 rooms)");

  // --- Admin ---
  const admin = await prisma.user.create({
    data: {
      email: "admin@flostudio.es",
      name: "Admin Flō",
      role: Role.ADMIN,
      image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face",
      countryId: spain.id,
      cityId: madrid.id,
    },
  });
  await prisma.membership.create({
    data: { userId: admin.id, tenantId, role: Role.ADMIN },
  });
  console.log("✓ Created admin user");

  // --- Coaches ---
  const coachData = [
    {
      email: "valentina@flostudio.es",
      name: "Valentina Reyes",
      specialties: ["Reformer", "Prenatal"],
      bio: "Certificada en STOTT Pilates con más de 8 años de experiencia. Especialista en rehabilitación y Pilates prenatal.",
      color: "#C9A96E",
      photoUrl:
        "https://images.unsplash.com/photo-1594381898411-846e7d193883?w=400&h=400&fit=crop",
      userImage:
        "https://images.unsplash.com/photo-1548690312-e3b507d8c110?w=200&h=200&fit=crop&crop=face",
    },
    {
      email: "carolina@flostudio.es",
      name: "Carolina Méndez",
      specialties: ["Mat", "Barre"],
      bio: "Bailarina profesional convertida en instructora de Pilates. Su enfoque único combina gracia y fuerza.",
      color: "#2D5016",
      photoUrl:
        "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&h=400&fit=crop",
      userImage:
        "https://images.unsplash.com/photo-1499952127939-9bbf5af6c51c?w=200&h=200&fit=crop&crop=face",
    },
    {
      email: "isabella@flostudio.es",
      name: "Isabella Torres",
      specialties: ["Reformer", "Barre", "Mat"],
      bio: "Con formación en fisioterapia y Pilates, Isabella diseña clases que transforman cuerpo y mente.",
      color: "#8B4513",
      photoUrl:
        "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&h=400&fit=crop",
      userImage:
        "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=face",
    },
  ];

  const coachProfiles = [];
  for (const c of coachData) {
    const user = await prisma.user.create({
      data: { email: c.email, name: c.name, role: Role.COACH, image: c.userImage, countryId: spain.id, cityId: madrid.id },
    });
    const profile = await prisma.coachProfile.create({
      data: {
        userId: user.id,
        tenantId,
        bio: c.bio,
        specialties: c.specialties,
        photoUrl: c.photoUrl,
        color: c.color,
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, tenantId, role: Role.COACH },
    });
    coachProfiles.push(profile);
  }
  console.log(`✓ Created ${coachProfiles.length} coaches`);

  // --- Packages (EUR for Spain, MXN for Mexico) ---
  const packages = await Promise.all([
    prisma.package.create({
      data: {
        tenantId,
        name: "Primera Vez",
        type: "OFFER",
        credits: 1,
        validDays: 7,
        price: 9,
        currency: "EUR",
        isPromo: true,
        description: "Clase de prueba para nuevos clientes",
        countryId: spain.id,
      },
    }),
    prisma.package.create({
      data: {
        tenantId,
        name: "Clase Individual",
        credits: 1,
        validDays: 30,
        price: 22,
        currency: "EUR",
        description: "Una clase individual",
        countryId: spain.id,
      },
    }),
    prisma.package.create({
      data: {
        tenantId,
        name: "Pack 5 Clases",
        credits: 5,
        validDays: 60,
        price: 95,
        currency: "EUR",
        description: "Paquete de 5 clases",
        countryId: spain.id,
      },
    }),
    prisma.package.create({
      data: {
        tenantId,
        name: "Pack 10 Clases",
        credits: 10,
        validDays: 90,
        price: 175,
        currency: "EUR",
        description: "Paquete de 10 clases",
        countryId: spain.id,
      },
    }),
    prisma.package.create({
      data: {
        tenantId,
        name: "Pack 25 Clases",
        credits: 25,
        validDays: 180,
        price: 399,
        currency: "EUR",
        description: "Paquete de 25 clases",
        countryId: spain.id,
      },
    }),
    prisma.package.create({
      data: {
        tenantId,
        name: "Pack 50 Clases",
        credits: 50,
        validDays: 365,
        price: 699,
        currency: "EUR",
        description: "Paquete de 50 clases",
        countryId: spain.id,
      },
    }),
    prisma.package.create({
      data: {
        tenantId,
        name: "Ilimitado Mensual",
        type: "SUBSCRIPTION",
        credits: null,
        validDays: 30,
        price: 139,
        currency: "EUR",
        recurringInterval: "month",
        description: "Clases ilimitadas por un mes",
        countryId: spain.id,
      },
    }),
  ]);
  console.log(`✓ Created ${packages.length} packages`);

  const [primeraVez, , , pack10, , , ilimitado] = packages;

  // --- Scheduled Classes (5 weeks: 1 past + today + 3 future) ---
  const today = new Date();
  const todayStart = setMinutes(setHours(today, 0), 0);
  const startDate = addDays(todayStart, -7);

  const weekdaySlots = [
    { hour: 7, minute: 0 },
    { hour: 8, minute: 0 },
    { hour: 9, minute: 0 },
    { hour: 10, minute: 30 },
    { hour: 12, minute: 0 },
    { hour: 17, minute: 0 },
    { hour: 18, minute: 30 },
    { hour: 19, minute: 30 },
    { hour: 20, minute: 30 },
  ];
  const weekendSlots = [
    { hour: 8, minute: 0 },
    { hour: 9, minute: 30 },
    { hour: 10, minute: 30 },
    { hour: 11, minute: 30 },
    { hour: 12, minute: 30 },
    { hour: 17, minute: 0 },
  ];

  let classIndex = 0;
  const allClasses: Awaited<ReturnType<typeof prisma.class.create>>[] = [];

  for (let dayOffset = 0; dayOffset < 28; dayOffset++) {
    const date = addDays(startDate, dayOffset);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const slots = isWeekend ? weekendSlots : weekdaySlots;
    const dateIsPast = date < todayStart;

    for (const slot of slots) {
      const classType = classTypes[classIndex % classTypes.length];
      const coach = coachProfiles[classIndex % coachProfiles.length];
      const startsAt = setMinutes(setHours(date, slot.hour), slot.minute);
      const endsAt = addMinutes(startsAt, classType.duration);

      const sampleTags: (string | null)[] = [
        null, null, null, null, null, null, null, null, null,
        null, null, "Special Edition", null, null, null, null, null, "Candlelight",
      ];
      const tag = !dateIsPast ? (sampleTags[classIndex % sampleTags.length] ?? null) : null;

      // Alternate rooms between studios for variety
      const rooms = roomsByClassType[classType.id];
      const room = rooms[classIndex % rooms.length];

      const cls = await prisma.class.create({
        data: {
          tenantId,
          classTypeId: classType.id,
          coachId: coach.id,
          roomId: room.id,
          startsAt,
          endsAt,
          status: dateIsPast ? ClassStatus.COMPLETED : ClassStatus.SCHEDULED,
          tag,
        },
      });
      allClasses.push(cls);
      classIndex++;
    }
  }

  const pastClasses = allClasses.filter((c) => c.status === ClassStatus.COMPLETED);
  const futureClasses = allClasses.filter((c) => c.status === ClassStatus.SCHEDULED);
  console.log(`✓ Created ${allClasses.length} classes (${pastClasses.length} past, ${futureClasses.length} future)`);

  // --- Sample Clients ---
  const clientWithPack10 = await prisma.user.create({
    data: {
      email: "maria@example.com",
      name: "María García",
      role: Role.CLIENT,
      phone: "+34 612 345 678",
      birthday: new Date(1995, 6, 15),
      image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face",
      countryId: spain.id,
      cityId: madrid.id,
    },
  });

  // Birthday this week!
  const clientExpired = await prisma.user.create({
    data: {
      email: "sofia@example.com",
      name: "Sofía López",
      role: Role.CLIENT,
      phone: "+34 623 456 789",
      birthday: new Date(1998, today.getMonth(), today.getDate() + 2),
      image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face",
      countryId: spain.id,
      cityId: madrid.id,
    },
  });

  const clientUnlimited = await prisma.user.create({
    data: {
      email: "camila@example.com",
      name: "Camila Hernández",
      role: Role.CLIENT,
      phone: "+34 634 567 890",
      birthday: new Date(1992, 11, 3),
      image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face",
      countryId: spain.id,
      cityId: madrid.id,
    },
  });

  // New member — just joined
  const clientPrimeraVez = await prisma.user.create({
    data: {
      email: "lucia@example.com",
      name: "Lucía Martínez",
      role: Role.CLIENT,
      birthday: new Date(2000, 3, 22),
      image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop&crop=face",
      countryId: spain.id,
      cityId: madrid.id,
    },
  });

  const clientNoPackage = await prisma.user.create({
    data: {
      email: "fernanda@example.com",
      name: "Fernanda Ruiz",
      role: Role.CLIENT,
      birthday: new Date(1997, 8, 10),
      image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&h=200&fit=crop&crop=face",
      countryId: spain.id,
      cityId: madrid.id,
    },
  });

  // Create memberships for all clients
  for (const client of [clientWithPack10, clientExpired, clientUnlimited, clientPrimeraVez, clientNoPackage]) {
    await prisma.membership.create({
      data: { userId: client.id, tenantId, role: Role.CLIENT },
    });
  }

  console.log("✓ Created 5 sample clients");

  // --- User Packages (creditsUsed will be updated after bookings) ---
  const upMaria = await prisma.userPackage.create({
    data: {
      tenantId,
      userId: clientWithPack10.id,
      packageId: pack10.id,
      creditsTotal: 10,
      creditsUsed: 0,
      expiresAt: addDays(today, 60),
    },
  });

  const upSofia = await prisma.userPackage.create({
    data: {
      tenantId,
      userId: clientExpired.id,
      packageId: pack10.id,
      creditsTotal: 10,
      creditsUsed: 0,
      expiresAt: addDays(today, -15),
    },
  });

  const upCamila = await prisma.userPackage.create({
    data: {
      tenantId,
      userId: clientUnlimited.id,
      packageId: ilimitado.id,
      creditsTotal: null,
      creditsUsed: 0,
      expiresAt: addDays(today, 20),
    },
  });

  const upLucia = await prisma.userPackage.create({
    data: {
      tenantId,
      userId: clientPrimeraVez.id,
      packageId: primeraVez.id,
      creditsTotal: 1,
      creditsUsed: 0,
      expiresAt: addDays(today, 7),
    },
  });

  const userPackageMap: Record<string, string> = {
    [clientWithPack10.id]: upMaria.id,
    [clientExpired.id]: upSofia.id,
    [clientUnlimited.id]: upCamila.id,
    [clientPrimeraVez.id]: upLucia.id,
  };
  const creditsCounter: Record<string, number> = {};

  console.log("✓ Created user packages");

  // --- Bookings for past classes ---
  const bookableClients = [clientWithPack10, clientExpired, clientUnlimited];
  let bookingCount = 0;

  for (let i = 0; i < Math.min(pastClasses.length, 12); i++) {
    const client = bookableClients[i % bookableClients.length];
    const status = i % 4 === 3 ? BookingStatus.NO_SHOW : BookingStatus.ATTENDED;
    const pkgUsed = userPackageMap[client.id] ?? null;
    await prisma.booking.create({
      data: {
        tenantId,
        classId: pastClasses[i].id,
        userId: client.id,
        status,
        spotNumber: (i % 12) + 1,
        packageUsed: pkgUsed,
      },
    });
    if (pkgUsed) creditsCounter[pkgUsed] = (creditsCounter[pkgUsed] ?? 0) + 1;
    bookingCount++;
  }

  // --- Cancelled bookings for María (with packageUsed, credits already restored) ---
  for (let i = 0; i < 2 && i < pastClasses.length; i++) {
    const cls = pastClasses[pastClasses.length - 1 - i];
    await prisma.booking.create({
      data: {
        tenantId,
        classId: cls.id,
        userId: clientWithPack10.id,
        status: BookingStatus.CANCELLED,
        spotNumber: null,
        packageUsed: upMaria.id,
      },
    });
    bookingCount++;
  }

  // --- Create filler users ---
  const fillerNames = [
    "Ana Pérez", "Elena Vega", "Diana Cruz", "Paula Ríos", "Laura Soto",
    "Renata Mora", "Mariana Gil", "Daniela Paz", "Gabriela Luna", "Natalia Ramos",
    "Andrea Silva", "Claudia Nava", "Regina Campos", "Valeria Ortiz", "Jimena Flores",
    "Isabel Mena", "Carmen Vega", "Rosa Delgado", "Marta Domínguez", "Patricia Sáenz",
    "Eva Contreras", "Lorena Prieto", "Silvia Rojas", "Teresa Camacho", "Angela Fuentes",
    "Beatriz Márquez", "Noelia Santos",
  ];
  const fillerUsers = [];
  for (let i = 0; i < fillerNames.length; i++) {
    const u = await prisma.user.create({
      data: {
        email: `filler${i}@example.com`,
        name: fillerNames[i],
        role: Role.CLIENT,
        image: `https://i.pravatar.cc/200?img=${(i % 70) + 1}`,
      },
    });
    await prisma.membership.create({
      data: { userId: u.id, tenantId, role: Role.CLIENT },
    });
    fillerUsers.push(u);
  }

  const otherClients = [clientExpired, clientUnlimited, clientPrimeraVez, clientNoPackage];
  const mainClients = [clientWithPack10, ...otherClients];
  const allBookableUsers = [...mainClients, ...fillerUsers];

  function shuffleUsers<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let k = a.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [a[k], a[j]] = [a[j], a[k]];
    }
    return a;
  }

  // --- Dense ATTENDED groups on past classes (realistic feed / sin cargar más créditos) ---
  const pastForCrowds = Math.min(pastClasses.length, 55);
  for (let i = 0; i < pastForCrowds; i++) {
    const cls = pastClasses[i];
    const full = await prisma.class.findUnique({
      where: { id: cls.id },
      include: { room: true },
    });
    if (!full) continue;
    const cap = full.room.maxCapacity;
    const existing = await prisma.booking.findMany({
      where: { classId: cls.id },
      select: { userId: true, spotNumber: true, status: true },
    });
    const attendedIds = new Set(
      existing
        .filter((b) => b.status === BookingStatus.ATTENDED && b.userId)
        .map((b) => b.userId!),
    );
    const takenSpots = new Set(
      existing.map((b) => b.spotNumber).filter((n): n is number => typeof n === "number"),
    );
    const targetTotal = Math.min(cap - 1, 5 + ((i * 7) % 8));
    if (attendedIds.size >= targetTotal) continue;

    const candidates = shuffleUsers(allBookableUsers.filter((u) => !attendedIds.has(u.id)));
    for (const user of candidates) {
      if (attendedIds.size >= targetTotal) break;
      const freeSpot = Array.from({ length: cap }, (_, s) => s + 1).find((s) => !takenSpots.has(s));
      if (freeSpot === undefined) break;
      try {
        await prisma.booking.create({
          data: {
            tenantId,
            classId: cls.id,
            userId: user.id,
            status: BookingStatus.ATTENDED,
            spotNumber: freeSpot,
            packageUsed: null,
          },
        });
        takenSpots.add(freeSpot);
        attendedIds.add(user.id);
        bookingCount++;
      } catch {
        /* spot / unique */
      }
    }
  }
  console.log("✓ Filled past classes with group attendance for feed");

  // --- Bookings for future classes (populate generously, with spot numbers) ---
  // María (clientWithPack10) only gets booked into 3 classes so the logged-in
  // user can test the spot-selection flow on most classes.
  const mariaClassIndices = new Set([0, 5, 12]);

  for (let i = 0; i < Math.min(futureClasses.length, 50); i++) {
    const cls = futureClasses[i];
    const ct = classTypes[i % classTypes.length];
    const rooms = roomsByClassType[ct.id];
    const room = rooms[i % rooms.length];
    const capacity = room.maxCapacity;

    const numToBook = Math.min(capacity - 2, i < 20 ? 5 + (i % 5) : 3 + (i % 4));
    const base = mariaClassIndices.has(i)
      ? [clientWithPack10, ...otherClients]
      : [...otherClients];
    const pool = [...base, ...fillerUsers.slice(0, numToBook)].slice(0, numToBook);

    const spots = Array.from({ length: capacity }, (_, s) => s + 1)
      .sort(() => Math.random() - 0.5);

    let spotIdx = 0;
    for (const client of pool) {
      try {
        const pkgUsed = userPackageMap[client.id] ?? null;
        await prisma.booking.create({
          data: {
            tenantId,
            classId: cls.id,
            userId: client.id,
            status: BookingStatus.CONFIRMED,
            spotNumber: spots[spotIdx],
            packageUsed: pkgUsed,
          },
        });
        if (pkgUsed) creditsCounter[pkgUsed] = (creditsCounter[pkgUsed] ?? 0) + 1;
        bookingCount++;
        spotIdx++;
      } catch { /* unique constraint */ }
    }
  }

  // --- Fill up a couple of future classes + add waitlist entries ---
  let waitlistCount = 0;

  // Pick future classes that are truly in the future (not already past by time)
  const now = new Date();
  const trulyFuture = futureClasses.filter((c) => new Date(c.startsAt) > now);
  // Pick classes on different days for visibility — skip first few, grab ones from tomorrow+
  const tomorrow = addDays(todayStart, 1);
  const tomorrowClasses = trulyFuture.filter((c) => {
    const d = new Date(c.startsAt);
    return d >= tomorrow && d < addDays(tomorrow, 1);
  });
  const dayAfterClasses = trulyFuture.filter((c) => {
    const d = new Date(c.startsAt);
    return d >= addDays(tomorrow, 1) && d < addDays(tomorrow, 2);
  });
  const classesToFill = [
    tomorrowClasses[2] || tomorrowClasses[0] || trulyFuture[5],
    dayAfterClasses[1] || dayAfterClasses[0] || trulyFuture[15],
  ].filter(Boolean);

  for (const fullClass of classesToFill) {
    const ct = await prisma.class.findUnique({
      where: { id: fullClass.id },
      include: { room: true, _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
    });
    if (!ct) continue;
    const cap = ct.room.maxCapacity;
    const existing = ct._count.bookings;
    const needed = cap - existing;

    // Find which spots are already taken
    const existingBookings = await prisma.booking.findMany({
      where: { classId: fullClass.id, status: "CONFIRMED" },
      select: { spotNumber: true },
    });
    const takenSpots = new Set(existingBookings.map((b) => b.spotNumber).filter(Boolean));
    const freeSpots = Array.from({ length: cap }, (_, s) => s + 1).filter((s) => !takenSpots.has(s));

    let booked = 0;
    for (let b = 0; b < needed && b < allBookableUsers.length && b < freeSpots.length; b++) {
      try {
        const pkgUsed = userPackageMap[allBookableUsers[b].id] ?? null;
        await prisma.booking.create({
          data: { tenantId, classId: fullClass.id, userId: allBookableUsers[b].id, status: BookingStatus.CONFIRMED, spotNumber: freeSpots[b], packageUsed: pkgUsed },
        });
        if (pkgUsed) creditsCounter[pkgUsed] = (creditsCounter[pkgUsed] ?? 0) + 1;
        bookingCount++;
        booked++;
      } catch { /* unique constraint — skip */ }
    }

    // Add waitlist entries — create dedicated waitlist users if needed
    for (let w = 0; w < 3; w++) {
      const waitUser = await prisma.user.create({
        data: {
          email: `waitlist-${fullClass.id}-${w}@example.com`,
          name: `Waitlist User ${w + 1}`,
          role: Role.CLIENT,
          image: `https://i.pravatar.cc/200?img=${30 + w}`,
        },
      });
      await prisma.membership.create({
        data: { userId: waitUser.id, tenantId, role: Role.CLIENT },
      });
      await prisma.waitlist.create({
        data: { tenantId, classId: fullClass.id, userId: waitUser.id, position: w + 1 },
      });
      waitlistCount++;
    }
  }

  console.log(`✓ Created ${bookingCount} bookings + ${waitlistCount} waitlist entries`);

  // --- Update creditsUsed on user packages to match actual bookings ---
  for (const [upId, used] of Object.entries(creditsCounter)) {
    await prisma.userPackage.update({ where: { id: upId }, data: { creditsUsed: used } });
  }
  console.log("✓ Synced creditsUsed on user packages");

  const coachUsers = await prisma.user.findMany({ where: { role: Role.COACH } });

  // --- Feed Events: CLASS_COMPLETED from real ATTENDED bookings ---
  const completedCaptions: (string | null)[] = [
    "¡Sesión increíble! 💪 Gracias equipo.",
    null,
    "Energy de hoy 🔥 nos vemos la próxima.",
    "Post-clase con las mejores. ✨",
    null,
    "Cuerpo y mente alineados. Namaste 🙏",
    "¡Qué clase! Salimos renovadas.",
    null,
    "Team Flō nunca falla 💛",
    "Sudor, sonrisas y buena vibra.",
    null,
    "Otra clase que me dejó en las nubes.",
    "La mejor hora del día.",
  ];

  const photoPools: string[][] = [
    [
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&h=600&fit=crop",
    ],
    [
      "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&h=600&fit=crop",
    ],
    [
      "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1518310952931-b1de897abd40?w=800&h=600&fit=crop",
    ],
    [
      "https://images.unsplash.com/photo-1588286840104-8957b019727f?w=800&h=600&fit=crop",
    ],
    [
      "https://images.unsplash.com/photo-1562088287-bde35a1ea917?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1607962837359-5e7e89f86776?w=800&h=600&fit=crop",
    ],
    [
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1603988363607-e1e4a66962c6?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1594381898411-846e7d193883?w=800&h=600&fit=crop",
    ],
    [
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1576678927484-cc907957088c?w=800&h=600&fit=crop",
    ],
    [
      "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=800&h=600&fit=crop",
    ],
    [
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&h=600&fit=crop",
    ],
    [],
    [
      "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=800&h=600&fit=crop",
    ],
    [
      "https://images.unsplash.com/photo-1593079831268-3381b0db4a77?w=800&h=600&fit=crop",
    ],
    [
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&h=600&fit=crop",
    ],
  ];

  let feedCount = 0;
  let photoCount = 0;
  const completedFeedLimit = Math.min(pastClasses.length, 48);

  for (let i = 0; i < completedFeedLimit; i++) {
    const cls = pastClasses[i];
    const attendedRows = await prisma.booking.findMany({
      where: { classId: cls.id, status: BookingStatus.ATTENDED },
      include: { user: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (attendedRows.length < 2) continue;

    const fullClass = await prisma.class.findUnique({
      where: { id: cls.id },
      include: {
        classType: true,
        coach: { include: { user: true } },
        room: { include: { studio: true } },
      },
    });
    if (!fullClass?.coach?.user) continue;

    const coachUser = fullClass.coach.user;
    const attendees = attendedRows
      .filter((b) => b.user)
      .map((b) => ({
        id: b.user!.id,
        name: b.user!.name ?? "Miembro",
        image: b.user!.image ?? null,
      }));

    const caption = completedCaptions[i % completedCaptions.length];
    const postedAt = addMinutes(fullClass.startsAt, 30 + (i % 120));

    const feedEvent = await prisma.feedEvent.create({
      data: {
        tenantId,
        userId: coachUser.id,
        eventType: "CLASS_COMPLETED",
        visibility: "STUDIO_WIDE",
        createdAt: postedAt,
        payload: {
          classId: fullClass.id,
          className: fullClass.classType.name,
          classTypeIcon: fullClass.classType.icon,
          classTypeColor: fullClass.classType.color,
          coachName: coachUser.name,
          coachUserId: coachUser.id,
          date: format(fullClass.startsAt, "EEEE d 'de' MMMM", { locale: es }),
          time: format(fullClass.startsAt, "h:mm a"),
          duration: fullClass.classType.duration,
          attendees,
          attendeeCount: attendees.length,
          ...(caption ? { caption } : {}),
        },
      },
    });

    const urls = photoPools[i % photoPools.length];
    for (let pi = 0; pi < urls.length; pi++) {
      const url = urls[pi];
      const uploader = attendees[pi % attendees.length];
      await prisma.photo.create({
        data: {
          userId: uploader.id,
          feedEventId: feedEvent.id,
          url,
          mimeType: "image/jpeg",
        },
      });
      photoCount++;
    }
    feedCount++;
  }
  console.log(`✓ Created ${feedCount} CLASS_COMPLETED feed events with ${photoCount} photos (from real attendance)`);

  // --- Logros demo (MemberAchievement + feed agrupado) ---
  const achievementRecords = [
    { userId: clientWithPack10.id, key: "first_class" as const },
    { userId: clientUnlimited.id, key: "first_class" as const },
    { userId: clientExpired.id, key: "first_class" as const },
    { userId: clientWithPack10.id, key: "classes_5" as const },
    { userId: clientWithPack10.id, key: "early_bird" as const },
    { userId: clientUnlimited.id, key: "early_bird" as const },
    { userId: clientUnlimited.id, key: "first_class_type_reformer" as const },
    { userId: clientExpired.id, key: "first_class_type_reformer" as const },
  ];

  const achievementLabels: Record<string, { label: string; desc: string; icon: string }> = {
    first_class: { label: "Primera Clase", desc: "Completaste tu primera clase en Flō", icon: "🎉" },
    classes_5: { label: "5 Clases", desc: "Llevas 5 clases completadas", icon: "⭐" },
    early_bird: { label: "Early Bird", desc: "Tomaste una clase antes de las 7am", icon: "🌅" },
    first_class_type_reformer: {
      label: "Reformer Desbloqueado",
      desc: "Tu primera clase de Reformer Pilates",
      icon: "🏋️",
    },
  };

  let achCount = 0;
  for (const a of achievementRecords) {
    const ach = await prisma.achievement.findUnique({ where: { key: a.key } });
    if (!ach) continue;
    await prisma.memberAchievement.create({
      data: {
        tenantId,
        userId: a.userId,
        achievementId: ach.id,
        earnedAt: addDays(today, -3),
        metadata: {},
      },
    });
    achCount++;
  }

  const allUsers = [clientWithPack10, clientExpired, clientUnlimited, clientPrimeraVez, clientNoPackage];
  const byKey = new Map<string, typeof allUsers>();
  for (const a of achievementRecords) {
    const list = byKey.get(a.key) ?? [];
    const u = allUsers.find((u) => u.id === a.userId);
    if (u) list.push(u);
    byKey.set(a.key, list);
  }

  let achEventCount = 0;
  const keyList = [...byKey.keys()];
  for (let t = 0; t < keyList.length; t++) {
    const key = keyList[t];
    const users = byKey.get(key)!;
    const def = achievementLabels[key];
    const feedEvent = await prisma.feedEvent.create({
      data: {
        tenantId,
        userId: users[0].id,
        eventType: "ACHIEVEMENT_UNLOCKED",
        visibility: "STUDIO_WIDE",
        createdAt: addDays(today, -(keyList.length - t)),
        payload: {
          achievementKey: key,
          achievementType: feedAchievementTypeFromKey(key),
          label: def.label,
          description: def.desc,
          icon: def.icon,
          users: users.map((u) => ({ id: u.id, name: u.name ?? "Miembro", image: u.image })),
        },
      },
    });

    const achievementRow = await prisma.achievement.findUnique({ where: { key } });
    if (achievementRow) {
      const firstMa = await prisma.memberAchievement.findFirst({
        where: {
          tenantId,
          achievementId: achievementRow.id,
          userId: users[0].id,
          feedEventId: null,
        },
      });
      if (firstMa) {
        await prisma.memberAchievement.update({
          where: { id: firstMa.id },
          data: { feedEventId: feedEvent.id },
        });
      }
    }
    achEventCount++;
  }
  console.log(`✓ Created ${achCount} member achievements → ${achEventCount} grouped feed events`);

  // --- Level-up feed events + MemberProgress (NO user/tenant changes) ---
  const bronzeLevel = await prisma.loyaltyLevel.findFirst({ where: { name: "Bronce" } });
  const silverLevel = await prisma.loyaltyLevel.findFirst({ where: { name: "Plata" } });
  const goldLevel = await prisma.loyaltyLevel.findFirst({ where: { name: "Oro" } });

  const memberProgressSeeds = [
    { user: clientWithPack10, totalClasses: 28, streak: 4, longest: 7, level: goldLevel },
    { user: clientUnlimited, totalClasses: 14, streak: 2, longest: 5, level: silverLevel },
    { user: clientExpired, totalClasses: 6, streak: 0, longest: 3, level: bronzeLevel },
    { user: clientPrimeraVez, totalClasses: 1, streak: 1, longest: 1, level: bronzeLevel },
  ];

  for (const mp of memberProgressSeeds) {
    if (!mp.level) continue;
    await prisma.memberProgress.create({
      data: {
        userId: mp.user.id,
        tenantId,
        currentLevelId: mp.level.id,
        totalClassesAttended: mp.totalClasses,
        currentStreak: mp.streak,
        longestStreak: mp.longest,
        lastClassDate: addDays(today, -1),
      },
    });
  }
  console.log(`✓ Created ${memberProgressSeeds.length} MemberProgress rows`);

  const levelUpEvents = [
    { user: clientWithPack10, level: goldLevel, daysAgo: 5 },
    { user: clientUnlimited, level: silverLevel, daysAgo: 8 },
  ];

  let levelUpCount = 0;
  for (const ev of levelUpEvents) {
    if (!ev.level) continue;
    await prisma.feedEvent.create({
      data: {
        tenantId,
        userId: ev.user.id,
        eventType: "LEVEL_UP",
        visibility: "STUDIO_WIDE",
        createdAt: addDays(today, -ev.daysAgo),
        payload: {
          levelId: ev.level.id,
          levelName: ev.level.name,
          icon: ev.level.icon,
          color: ev.level.color,
          minClasses: ev.level.minClasses,
        },
      },
    });
    levelUpCount++;
  }
  console.log(`✓ Created ${levelUpCount} LEVEL_UP feed events`);

  // --- Sample Likes & Comments (spread across feed) ---
  const allFeedEvents = await prisma.feedEvent.findMany({ orderBy: { createdAt: "desc" }, take: 65 });
  const allClientsForInteractions = [...mainClients, ...fillerUsers.slice(0, 18)];

  let likeCount = 0;
  let commentCount = 0;

  const commentBodies = [
    "¡Increíble clase! 💪",
    "Me encantó, la mejor del mes",
    "¡Felicidades! 🎉",
    "Excelente trabajo equipo 🔥",
    "¡Qué logro! Sigue así",
    "Nos vemos el jueves 💛",
    "Qué energía traía hoy la sala",
    "Goals 🔥",
    "Amo estas clases",
    "Gracias coach 🙌",
    "La música estuvo perfecta",
    "Salimos renovadas",
  ];

  for (let i = 0; i < allFeedEvents.length; i++) {
    const evt = allFeedEvents[i];
    const numLikes =
      evt.eventType === "CLASS_COMPLETED" ? 3 + (i % 9) : 1 + (i % 4);
    const shuffledLikers = shuffleUsers(
      allClientsForInteractions.filter((u) => u.id !== evt.userId),
    );
    for (let j = 0; j < numLikes && j < shuffledLikers.length; j++) {
      try {
        await prisma.like.create({
          data: {
            userId: shuffledLikers[j].id,
            feedEventId: evt.id,
            type:
              evt.eventType === "ACHIEVEMENT_UNLOCKED" || evt.eventType === "LEVEL_UP"
                ? "kudos"
                : "like",
          },
        });
        likeCount++;
      } catch {
        /* unique */
      }
    }

    if (evt.eventType === "CLASS_COMPLETED" && i < 32) {
      const c1 = allClientsForInteractions[(i + 2) % allClientsForInteractions.length];
      if (c1.id !== evt.userId) {
        await prisma.comment.create({
          data: {
            userId: c1.id,
            feedEventId: evt.id,
            body: commentBodies[i % commentBodies.length],
          },
        });
        commentCount++;
      }
      if (i % 3 === 0 && i < 24) {
        const c2 = allClientsForInteractions[(i + 5) % allClientsForInteractions.length];
        if (c2.id !== evt.userId && c2.id !== c1.id) {
          await prisma.comment.create({
            data: {
              userId: c2.id,
              feedEventId: evt.id,
              body: commentBodies[(i + 4) % commentBodies.length],
            },
          });
          commentCount++;
        }
      }
    } else if (
      i < 10 &&
      (evt.eventType === "ACHIEVEMENT_UNLOCKED" || evt.eventType === "LEVEL_UP")
    ) {
      const commenter = allClientsForInteractions[(i + 1) % allClientsForInteractions.length];
      await prisma.comment.create({
        data: {
          userId: commenter.id,
          feedEventId: evt.id,
          body: commentBodies[i % commentBodies.length],
        },
      });
      commentCount++;
    }
  }
  console.log(`✓ Created ${likeCount} likes and ${commentCount} comments`);

  // --- Friendships ---
  const friendshipPairs: [typeof clientWithPack10, typeof clientExpired][] = [
    [clientWithPack10, clientExpired],
    [clientWithPack10, clientUnlimited],
    [clientWithPack10, clientPrimeraVez],
    [clientUnlimited, clientExpired],
  ];

  let friendshipCount = 0;
  for (const [a, b] of friendshipPairs) {
    await prisma.friendship.create({
      data: {
        tenantId,
        requesterId: a.id,
        addresseeId: b.id,
        status: "ACCEPTED",
      },
    });
    friendshipCount++;
  }

  // One pending request
  await prisma.friendship.create({
    data: {
      tenantId,
      requesterId: clientNoPackage.id,
      addresseeId: clientWithPack10.id,
      status: "PENDING",
    },
  });
  friendshipCount++;
  console.log(`✓ Created ${friendshipCount} friendships`);

  // --- CLASS_RESERVED feed events (friends-only) ---
  // Use tomorrow+ classes so they're always truly in the future.
  // María is booked at indices [0, 5, 12]. Tomorrow starts ~index 9.
  const friends = [clientExpired, clientUnlimited, clientPrimeraVez];
  const friendReservations: { friend: typeof clientExpired; classIdx: number; hoursAgo: number }[] = [
    // Camila reserves a class María has NOT booked → CTA visible
    { friend: clientUnlimited, classIdx: 10, hoursAgo: 1 },
    // Sofía + Lucía reserve the SAME class María has NOT booked → grouped + CTA
    { friend: clientExpired, classIdx: 11, hoursAgo: 2 },
    { friend: clientPrimeraVez, classIdx: 11, hoursAgo: 3 },
    // Sofía reserves the class María already booked (idx 12) → "también reservó"
    { friend: clientExpired, classIdx: 12, hoursAgo: 4 },
    // Camila reserves another class María has NOT booked → CTA visible
    { friend: clientUnlimited, classIdx: 14, hoursAgo: 6 },
  ];

  let reservedCount = 0;
  for (const { friend, classIdx, hoursAgo } of friendReservations) {
    const cls = futureClasses[classIdx];
    if (!cls) continue;
    const ct = classTypes[classIdx % classTypes.length];
    const coachUser = coachUsers[classIdx % coachUsers.length];

    // Ensure the friend actually has a booking for that class
    try {
      const existingSpots = await prisma.booking.findMany({
        where: { classId: cls.id, status: "CONFIRMED" },
        select: { spotNumber: true, userId: true },
      });
      const alreadyBooked = existingSpots.some((b) => b.userId === friend.id);
      if (!alreadyBooked) {
        const takenSpots = new Set(existingSpots.map((b) => b.spotNumber).filter(Boolean));
        const classRoom = roomsByClassType[ct.id];
        const roomCap = classRoom[classIdx % classRoom.length].maxCapacity;
        const freeSpot = Array.from({ length: roomCap }, (_, s) => s + 1).find((s) => !takenSpots.has(s));
        const pkgUsed = userPackageMap[friend.id] ?? null;
        await prisma.booking.create({
          data: {
            tenantId,
            classId: cls.id,
            userId: friend.id,
            status: BookingStatus.CONFIRMED,
            spotNumber: freeSpot ?? null,
            packageUsed: pkgUsed,
          },
        });
        if (pkgUsed) creditsCounter[pkgUsed] = (creditsCounter[pkgUsed] ?? 0) + 1;
        bookingCount++;
      }
    } catch { /* unique constraint — skip */ }

    await prisma.feedEvent.create({
      data: {
        tenantId,
        userId: friend.id,
        eventType: "CLASS_RESERVED",
        visibility: "FRIENDS_ONLY",
        createdAt: addMinutes(today, -(hoursAgo * 60)),
        payload: {
          classId: cls.id,
          className: ct.name,
          coachName: coachUser.name,
          date: cls.startsAt.toISOString(),
          duration: ct.duration,
        },
      },
    });
    reservedCount++;
  }
  console.log(`✓ Created ${reservedCount} CLASS_RESERVED feed events`);

  // --- Notifications ---
  let notifCount = 0;
  const notifData = [
    { userId: clientWithPack10.id, type: "FRIEND_REQUEST", actorId: clientNoPackage.id },
    { userId: clientWithPack10.id, type: "LIKE", actorId: clientExpired.id },
    { userId: clientWithPack10.id, type: "COMMENT", actorId: clientUnlimited.id },
    { userId: clientWithPack10.id, type: "FRIEND_ACCEPTED", actorId: clientExpired.id },
    { userId: clientExpired.id, type: "KUDOS", actorId: clientWithPack10.id },
    { userId: clientUnlimited.id, type: "LIKE", actorId: clientPrimeraVez.id },
  ];

  for (let i = 0; i < notifData.length; i++) {
    const n = notifData[i];
    await prisma.notification.create({
      data: {
        tenantId,
        userId: n.userId,
        type: n.type,
        actorId: n.actorId,
        createdAt: addDays(today, -(i)),
      },
    });
    notifCount++;
  }
  console.log(`✓ Created ${notifCount} notifications`);

  // --- Favorite Songs ---
  const songData: { userId: string; title: string; artist: string }[] = [
    { userId: clientWithPack10.id, title: "Flowers", artist: "Miley Cyrus" },
    { userId: clientWithPack10.id, title: "Levitating", artist: "Dua Lipa" },
    { userId: clientWithPack10.id, title: "Blinding Lights", artist: "The Weeknd" },
    { userId: clientExpired.id, title: "Anti-Hero", artist: "Taylor Swift" },
    { userId: clientExpired.id, title: "As It Was", artist: "Harry Styles" },
    { userId: clientUnlimited.id, title: "Unholy", artist: "Sam Smith ft. Kim Petras" },
    { userId: clientUnlimited.id, title: "Calm Down", artist: "Rema & Selena Gomez" },
    { userId: clientUnlimited.id, title: "Shakira: Bzrp Session #53", artist: "Bizarrap & Shakira" },
    { userId: clientUnlimited.id, title: "Ella Baila Sola", artist: "Eslabon Armado & Peso Pluma" },
    { userId: clientPrimeraVez.id, title: "Kill Bill", artist: "SZA" },
    { userId: clientPrimeraVez.id, title: "Creepin'", artist: "Metro Boomin, The Weeknd & 21 Savage" },
    { userId: clientNoPackage.id, title: "Die For You", artist: "The Weeknd & Ariana Grande" },
    { userId: clientNoPackage.id, title: "Boy's a Liar Pt. 2", artist: "PinkPantheress & Ice Spice" },
    { userId: clientNoPackage.id, title: "La Bebe", artist: "Yng Lvcas & Peso Pluma" },
  ];

  let songCount = 0;
  for (const s of songData) {
    await prisma.favoriteSong.create({ data: s });
    songCount++;
  }
  console.log(`✓ Created ${songCount} favorite songs`);

  // --- Summary ---
  console.log("\n📊 Seed Summary:");
  console.log(`   Class Types:    ${classTypes.length}`);
  console.log(`   Users:          ${1 + coachProfiles.length + 5 + fillerUsers.length} (1 admin, ${coachProfiles.length} coaches, ${5 + fillerUsers.length} clients)`);
  console.log(`   Packages:       ${packages.length}`);
  console.log(`   Classes:        ${allClasses.length}`);
  console.log(`   Bookings:       ${bookingCount}`);
  console.log(`   Waitlist:       ${waitlistCount}`);
  console.log(`   Feed Events:    ${feedCount + achEventCount + levelUpCount + reservedCount} (clases + logros + level-ups + reservas)`);
  console.log(`   Photos:         ${photoCount}`);
  console.log(`   Achievements:   ${achCount}`);
  console.log(`   MemberProgress: ${memberProgressSeeds.length}`);
  console.log(`   Level-Ups:      ${levelUpCount}`);
  console.log(`   Likes:          ${likeCount}`);
  console.log(`   Comments:       ${commentCount}`);
  console.log(`   Friendships:    ${friendshipCount}`);
  console.log(`   Notifications:  ${notifCount}`);
  console.log(`   Songs:          ${songCount}`);

  // ── Studio Branding Settings (alineado con tenant) ──
  const settingsPayload = { id: "singleton" as const, ...studioSettingsData(branding) };
  await prisma.studioSettings.upsert({
    where: { id: "singleton" },
    update: studioSettingsData(branding),
    create: settingsPayload,
  });
  console.log("   Branding:       ✓");

  const shopCount = await seedBeToroShop(prisma, tenantId);
  console.log(`   Shop Be-Toro:   ✓ ${shopCount} productos (Shopify)`);

  console.log("\n✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
