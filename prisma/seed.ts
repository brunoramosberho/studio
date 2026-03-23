import { PrismaClient, Role, Level, ClassStatus, BookingStatus } from "@prisma/client";
import { addDays, setHours, setMinutes, startOfWeek, subWeeks, addMinutes, format } from "date-fns";
import { es } from "date-fns/locale";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Flō Studio database...\n");

  // Clear existing data (respecting foreign key order)
  await prisma.notification.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.like.deleteMany();
  await prisma.feedEvent.deleteMany();
  await prisma.userAchievement.deleteMany();
  await prisma.waitlist.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.class.deleteMany();
  await prisma.classType.deleteMany();
  await prisma.userPackage.deleteMany();
  await prisma.package.deleteMany();
  await prisma.coachProfile.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();

  console.log("✓ Cleared existing data");

  // --- Class Types ---
  const reformer = await prisma.classType.create({
    data: {
      name: "Reformer Pilates",
      duration: 50,
      maxCapacity: 12,
      level: Level.ALL,
      color: "#C9A96E",
      description:
        "Fortalece, tonifica y alarga tu cuerpo con nuestro equipo de Reformer de última generación.",
    },
  });

  const matFlow = await prisma.classType.create({
    data: {
      name: "Mat Flow",
      duration: 45,
      maxCapacity: 20,
      level: Level.ALL,
      color: "#2D5016",
      description:
        "Conecta con tu cuerpo a través de secuencias fluidas en mat. Ideal para todas las edades.",
    },
  });

  const barreFusion = await prisma.classType.create({
    data: {
      name: "Barre Fusion",
      duration: 55,
      maxCapacity: 15,
      level: Level.INTERMEDIATE,
      color: "#8B4513",
      description:
        "Combina ballet, Pilates y yoga para esculpir y fortalecer con movimientos elegantes.",
    },
  });

  const classTypes = [reformer, matFlow, barreFusion];
  console.log(`✓ Created ${classTypes.length} class types`);

  // --- Admin ---
  const admin = await prisma.user.create({
    data: {
      email: "admin@flostudio.mx",
      name: "Admin Flō",
      role: Role.ADMIN,
    },
  });
  console.log("✓ Created admin user");

  // --- Coaches ---
  const coachData = [
    {
      email: "valentina@flostudio.mx",
      name: "Valentina Reyes",
      specialties: ["Reformer", "Prenatal"],
      bio: "Certificada en STOTT Pilates con más de 8 años de experiencia. Especialista en rehabilitación y Pilates prenatal.",
      color: "#C9A96E",
      photoUrl:
        "https://images.unsplash.com/photo-1594381898411-846e7d193883?w=400&h=400&fit=crop",
    },
    {
      email: "carolina@flostudio.mx",
      name: "Carolina Mendez",
      specialties: ["Mat", "Barre"],
      bio: "Bailarina profesional convertida en instructora de Pilates. Su enfoque único combina gracia y fuerza.",
      color: "#2D5016",
      photoUrl:
        "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&h=400&fit=crop",
    },
    {
      email: "isabella@flostudio.mx",
      name: "Isabella Torres",
      specialties: ["Reformer", "Barre", "Mat"],
      bio: "Con formación en fisioterapia y Pilates, Isabella diseña clases que transforman cuerpo y mente.",
      color: "#8B4513",
      photoUrl:
        "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&h=400&fit=crop",
    },
  ];

  const coachProfiles = [];
  for (const c of coachData) {
    const user = await prisma.user.create({
      data: { email: c.email, name: c.name, role: Role.COACH },
    });
    const profile = await prisma.coachProfile.create({
      data: {
        userId: user.id,
        bio: c.bio,
        specialties: c.specialties,
        photoUrl: c.photoUrl,
        color: c.color,
      },
    });
    coachProfiles.push(profile);
  }
  console.log(`✓ Created ${coachProfiles.length} coaches`);

  // --- Packages ---
  const packages = await Promise.all([
    prisma.package.create({
      data: {
        name: "Primera Vez",
        credits: 1,
        validDays: 7,
        price: 150,
        isPromo: true,
        description: "Clase de prueba para nuevos clientes",
      },
    }),
    prisma.package.create({
      data: {
        name: "Clase Individual",
        credits: 1,
        validDays: 30,
        price: 350,
        description: "Una clase individual",
      },
    }),
    prisma.package.create({
      data: {
        name: "Pack 5 Clases",
        credits: 5,
        validDays: 60,
        price: 1500,
        description: "Paquete de 5 clases",
      },
    }),
    prisma.package.create({
      data: {
        name: "Pack 10 Clases",
        credits: 10,
        validDays: 90,
        price: 2800,
        description: "Paquete de 10 clases",
      },
    }),
    prisma.package.create({
      data: {
        name: "Pack 25 Clases",
        credits: 25,
        validDays: 180,
        price: 6500,
        description: "Paquete de 25 clases",
      },
    }),
    prisma.package.create({
      data: {
        name: "Pack 50 Clases",
        credits: 50,
        validDays: 365,
        price: 12000,
        description: "Paquete de 50 clases",
      },
    }),
    prisma.package.create({
      data: {
        name: "Ilimitado Mensual",
        credits: null,
        validDays: 30,
        price: 2200,
        description: "Clases ilimitadas por un mes",
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

      const cls = await prisma.class.create({
        data: {
          classTypeId: classType.id,
          coachId: coach.id,
          startsAt,
          endsAt,
          status: dateIsPast ? ClassStatus.COMPLETED : ClassStatus.SCHEDULED,
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
      phone: "+52 55 1234 5678",
    },
  });

  const clientExpired = await prisma.user.create({
    data: {
      email: "sofia@example.com",
      name: "Sofía López",
      role: Role.CLIENT,
      phone: "+52 55 2345 6789",
    },
  });

  const clientUnlimited = await prisma.user.create({
    data: {
      email: "camila@example.com",
      name: "Camila Hernández",
      role: Role.CLIENT,
      phone: "+52 55 3456 7890",
    },
  });

  const clientPrimeraVez = await prisma.user.create({
    data: {
      email: "lucia@example.com",
      name: "Lucía Martínez",
      role: Role.CLIENT,
    },
  });

  const clientNoPackage = await prisma.user.create({
    data: {
      email: "fernanda@example.com",
      name: "Fernanda Ruiz",
      role: Role.CLIENT,
    },
  });

  console.log("✓ Created 5 sample clients");

  // --- User Packages ---
  await prisma.userPackage.create({
    data: {
      userId: clientWithPack10.id,
      packageId: pack10.id,
      creditsTotal: 10,
      creditsUsed: 5,
      expiresAt: addDays(today, 60),
    },
  });

  await prisma.userPackage.create({
    data: {
      userId: clientExpired.id,
      packageId: pack10.id,
      creditsTotal: 10,
      creditsUsed: 3,
      expiresAt: addDays(today, -15),
    },
  });

  await prisma.userPackage.create({
    data: {
      userId: clientUnlimited.id,
      packageId: ilimitado.id,
      creditsTotal: null,
      creditsUsed: 0,
      expiresAt: addDays(today, 20),
    },
  });

  await prisma.userPackage.create({
    data: {
      userId: clientPrimeraVez.id,
      packageId: primeraVez.id,
      creditsTotal: 1,
      creditsUsed: 0,
      expiresAt: addDays(today, 7),
    },
  });

  console.log("✓ Created user packages");

  // --- Bookings for past classes ---
  const bookableClients = [clientWithPack10, clientExpired, clientUnlimited];
  let bookingCount = 0;

  for (let i = 0; i < Math.min(pastClasses.length, 12); i++) {
    const client = bookableClients[i % bookableClients.length];
    const status = i % 4 === 3 ? BookingStatus.NO_SHOW : BookingStatus.ATTENDED;
    await prisma.booking.create({
      data: {
        classId: pastClasses[i].id,
        userId: client.id,
        status,
      },
    });
    bookingCount++;
  }

  // --- Bookings for future classes ---
  for (let i = 0; i < Math.min(futureClasses.length, 6); i++) {
    const clients = [clientWithPack10, clientUnlimited, clientPrimeraVez];
    const client = clients[i % clients.length];
    await prisma.booking.create({
      data: {
        classId: futureClasses[i].id,
        userId: client.id,
        status: BookingStatus.CONFIRMED,
      },
    });
    bookingCount++;
  }

  console.log(`✓ Created ${bookingCount} bookings`);

  // --- Feed Events (CLASS_COMPLETED for past classes) ---
  const coachUsers = await prisma.user.findMany({ where: { role: "COACH" } });
  let feedCount = 0;

  for (let i = 0; i < Math.min(pastClasses.length, 10); i++) {
    const cls = pastClasses[i];
    const classType = classTypes[i % classTypes.length];
    const coach = coachUsers[i % coachUsers.length];

    const attendeePool = [clientWithPack10, clientExpired, clientUnlimited, clientPrimeraVez, clientNoPackage];
    const numAttendees = 2 + (i % 3);
    const attendees = attendeePool.slice(0, numAttendees).map((u) => ({
      id: u.id,
      name: u.name ?? "Miembro",
      image: null,
    }));

    await prisma.feedEvent.create({
      data: {
        userId: coach.id,
        eventType: "CLASS_COMPLETED",
        visibility: "STUDIO_WIDE",
        createdAt: cls.startsAt,
        payload: {
          classId: cls.id,
          className: classType.name,
          coachName: coach.name,
          date: format(cls.startsAt, "EEEE d 'de' MMMM", { locale: es }),
          time: format(cls.startsAt, "h:mm a"),
          duration: classType.duration,
          attendees,
          attendeeCount: attendees.length,
        },
      },
    });
    feedCount++;
  }
  console.log(`✓ Created ${feedCount} feed events`);

  // --- Achievements ---
  const achievementDefs = [
    { userId: clientWithPack10.id, type: "FIRST_CLASS", label: "Primera Clase", desc: "Completaste tu primera clase en Flō", icon: "🎉" },
    { userId: clientWithPack10.id, type: "MILESTONE_5", label: "5 Clases", desc: "Llevas 5 clases completadas", icon: "⭐" },
    { userId: clientUnlimited.id, type: "FIRST_CLASS", label: "Primera Clase", desc: "Completaste tu primera clase en Flō", icon: "🎉" },
    { userId: clientExpired.id, type: "FIRST_CLASS", label: "Primera Clase", desc: "Completaste tu primera clase en Flō", icon: "🎉" },
    { userId: clientWithPack10.id, type: "EARLY_BIRD", label: "Early Bird", desc: "Tomaste una clase antes de las 7am", icon: "🌅" },
    { userId: clientUnlimited.id, type: "FIRST_CLASS_TYPE_REFORMER", label: "Reformer Desbloqueado", desc: "Tu primera clase de Reformer Pilates", icon: "🏋️" },
  ];

  let achCount = 0;
  for (const a of achievementDefs) {
    const daysAgo = achievementDefs.length - achCount;
    const earnedAt = addDays(today, -daysAgo);

    await prisma.userAchievement.create({
      data: {
        userId: a.userId,
        achievementType: a.type,
        earnedAt,
        metadata: {},
      },
    });

    await prisma.feedEvent.create({
      data: {
        userId: a.userId,
        eventType: "ACHIEVEMENT_UNLOCKED",
        visibility: "STUDIO_WIDE",
        createdAt: earnedAt,
        payload: {
          achievementType: a.type,
          label: a.label,
          description: a.desc,
          icon: a.icon,
        },
      },
    });
    achCount++;
  }
  console.log(`✓ Created ${achCount} achievements + feed events`);

  // --- Sample Likes & Comments ---
  const allFeedEvents = await prisma.feedEvent.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
  const allClientsForInteractions = [clientWithPack10, clientExpired, clientUnlimited, clientPrimeraVez];

  let likeCount = 0;
  let commentCount = 0;

  for (let i = 0; i < Math.min(allFeedEvents.length, 8); i++) {
    const evt = allFeedEvents[i];
    const numLikes = 1 + (i % 3);
    for (let j = 0; j < numLikes; j++) {
      const liker = allClientsForInteractions[j % allClientsForInteractions.length];
      if (liker.id === evt.userId) continue;
      try {
        await prisma.like.create({
          data: {
            userId: liker.id,
            feedEventId: evt.id,
            type: evt.eventType === "ACHIEVEMENT_UNLOCKED" ? "kudos" : "like",
          },
        });
        likeCount++;
      } catch {
        // unique constraint — skip
      }
    }

    if (i < 5) {
      const commenter = allClientsForInteractions[(i + 1) % allClientsForInteractions.length];
      const bodies = [
        "¡Increíble clase! 💪",
        "Me encantó, la mejor del mes",
        "¡Felicidades! 🎉",
        "Excelente trabajo equipo 🔥",
        "¡Qué logro! Sigue así",
      ];
      await prisma.comment.create({
        data: {
          userId: commenter.id,
          feedEventId: evt.id,
          body: bodies[i % bodies.length],
        },
      });
      commentCount++;
    }
  }
  console.log(`✓ Created ${likeCount} likes and ${commentCount} comments`);

  // --- Summary ---
  console.log("\n📊 Seed Summary:");
  console.log(`   Class Types:    ${classTypes.length}`);
  console.log(`   Users:          ${1 + coachProfiles.length + 5} (1 admin, ${coachProfiles.length} coaches, 5 clients)`);
  console.log(`   Packages:       ${packages.length}`);
  console.log(`   Classes:        ${allClasses.length}`);
  console.log(`   Bookings:       ${bookingCount}`);
  console.log(`   Feed Events:    ${feedCount + achCount}`);
  console.log(`   Achievements:   ${achCount}`);
  console.log(`   Likes:          ${likeCount}`);
  console.log(`   Comments:       ${commentCount}`);
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
