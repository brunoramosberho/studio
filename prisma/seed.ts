import { PrismaClient, Role, Level, ClassStatus, BookingStatus } from "@prisma/client";
import { addDays, setHours, setMinutes, startOfWeek, subWeeks, addMinutes, format } from "date-fns";
import { es } from "date-fns/locale";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Flō Studio database...\n");

  // Clear existing data (respecting foreign key order)
  await prisma.studioSettings.deleteMany();
  await prisma.favoriteSong.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.like.deleteMany();
  await prisma.photo.deleteMany();
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
      image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face",
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
      userImage:
        "https://images.unsplash.com/photo-1548690312-e3b507d8c110?w=200&h=200&fit=crop&crop=face",
    },
    {
      email: "carolina@flostudio.mx",
      name: "Carolina Mendez",
      specialties: ["Mat", "Barre"],
      bio: "Bailarina profesional convertida en instructora de Pilates. Su enfoque único combina gracia y fuerza.",
      color: "#2D5016",
      photoUrl:
        "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&h=400&fit=crop",
      userImage:
        "https://images.unsplash.com/photo-1499952127939-9bbf5af6c51c?w=200&h=200&fit=crop&crop=face",
    },
    {
      email: "isabella@flostudio.mx",
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
      data: { email: c.email, name: c.name, role: Role.COACH, image: c.userImage },
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
      birthday: new Date(1995, 6, 15),
      image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face",
    },
  });

  // Birthday this week!
  const clientExpired = await prisma.user.create({
    data: {
      email: "sofia@example.com",
      name: "Sofía López",
      role: Role.CLIENT,
      phone: "+52 55 2345 6789",
      birthday: new Date(1998, today.getMonth(), today.getDate() + 2),
      image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face",
    },
  });

  const clientUnlimited = await prisma.user.create({
    data: {
      email: "camila@example.com",
      name: "Camila Hernández",
      role: Role.CLIENT,
      phone: "+52 55 3456 7890",
      birthday: new Date(1992, 11, 3),
      image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face",
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
    },
  });

  const clientNoPackage = await prisma.user.create({
    data: {
      email: "fernanda@example.com",
      name: "Fernanda Ruiz",
      role: Role.CLIENT,
      birthday: new Date(1997, 8, 10),
      image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&h=200&fit=crop&crop=face",
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
        spotNumber: (i % 12) + 1,
      },
    });
    bookingCount++;
  }

  // --- Create filler users ---
  const fillerNames = [
    "Ana Pérez", "Elena Vega", "Diana Cruz", "Paula Ríos", "Laura Soto",
    "Renata Mora", "Mariana Gil", "Daniela Paz", "Gabriela Luna", "Natalia Ramos",
    "Andrea Silva", "Claudia Nava", "Regina Campos", "Valeria Ortiz", "Jimena Flores",
  ];
  const fillerUsers = [];
  for (let i = 0; i < fillerNames.length; i++) {
    const u = await prisma.user.create({
      data: {
        email: `filler${i}@example.com`,
        name: fillerNames[i],
        role: Role.CLIENT,
        image: `https://i.pravatar.cc/200?img=${i + 10}`,
      },
    });
    fillerUsers.push(u);
  }

  const otherClients = [clientExpired, clientUnlimited, clientPrimeraVez, clientNoPackage];
  const mainClients = [clientWithPack10, ...otherClients];
  const allBookableUsers = [...mainClients, ...fillerUsers];

  // --- Bookings for future classes (populate generously, with spot numbers) ---
  // María (clientWithPack10) only gets booked into 3 classes so the logged-in
  // user can test the spot-selection flow on most classes.
  const mariaClassIndices = new Set([0, 5, 12]);

  for (let i = 0; i < Math.min(futureClasses.length, 50); i++) {
    const cls = futureClasses[i];
    const ct = classTypes[i % classTypes.length];
    const capacity = ct.maxCapacity;

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
        await prisma.booking.create({
          data: {
            classId: cls.id,
            userId: client.id,
            status: BookingStatus.CONFIRMED,
            spotNumber: spots[spotIdx],
          },
        });
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
      include: { classType: true, _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
    });
    if (!ct) continue;
    const cap = ct.classType.maxCapacity;
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
        await prisma.booking.create({
          data: { classId: fullClass.id, userId: allBookableUsers[b].id, status: BookingStatus.CONFIRMED, spotNumber: freeSpots[b] },
        });
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
      await prisma.waitlist.create({
        data: { classId: fullClass.id, userId: waitUser.id, position: w + 1 },
      });
      waitlistCount++;
    }
  }

  console.log(`✓ Created ${bookingCount} bookings + ${waitlistCount} waitlist entries`);

  // --- Feed Events (CLASS_COMPLETED for past classes) ---
  const coachUsers = await prisma.user.findMany({ where: { role: "COACH" } });
  let feedCount = 0;
  let photoCount = 0;

  for (let i = 0; i < Math.min(pastClasses.length, 10); i++) {
    const cls = pastClasses[i];
    const classType = classTypes[i % classTypes.length];
    const coach = coachUsers[i % coachUsers.length];

    const attendeePool = [clientWithPack10, clientExpired, clientUnlimited, clientPrimeraVez, clientNoPackage];
    const numAttendees = 2 + (i % 3);
    const attendees = attendeePool.slice(0, numAttendees).map((u) => ({
      id: u.id,
      name: u.name ?? "Miembro",
      image: u.image ?? null,
    }));

    const feedEvent = await prisma.feedEvent.create({
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

    // Add sample photos to some feed events
    const samplePhotos: string[][] = [
      [
        "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&h=600&fit=crop",
      ],
      [
        "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=800&h=600&fit=crop",
      ],
      [
        "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1518310952931-b1de897abd40?w=800&h=600&fit=crop",
      ],
      [],
      [
        "https://images.unsplash.com/photo-1588286840104-8957b019727f?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1562088287-bde35a1ea917?w=800&h=600&fit=crop",
      ],
      [],
      [
        "https://images.unsplash.com/photo-1607962837359-5e7e89f86776?w=800&h=600&fit=crop",
      ],
      [],
      [
        "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1603988363607-e1e4a66962c6?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&h=600&fit=crop",
      ],
      [
        "https://images.unsplash.com/photo-1594381898411-846e7d193883?w=800&h=600&fit=crop",
      ],
    ];

    const urls = samplePhotos[i] ?? [];
    for (const url of urls) {
      const uploader = attendeePool[Math.floor(Math.random() * numAttendees)];
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
  console.log(`✓ Created ${feedCount} feed events with ${photoCount} photos`);

  // --- Achievements (grouped by type) ---
  const achievementRecords = [
    { userId: clientWithPack10.id, type: "FIRST_CLASS" },
    { userId: clientUnlimited.id, type: "FIRST_CLASS" },
    { userId: clientExpired.id, type: "FIRST_CLASS" },
    { userId: clientWithPack10.id, type: "MILESTONE_5" },
    { userId: clientWithPack10.id, type: "EARLY_BIRD" },
    { userId: clientUnlimited.id, type: "EARLY_BIRD" },
    { userId: clientUnlimited.id, type: "FIRST_CLASS_TYPE_REFORMER" },
    { userId: clientExpired.id, type: "FIRST_CLASS_TYPE_REFORMER" },
  ];

  const achievementLabels: Record<string, { label: string; desc: string; icon: string }> = {
    FIRST_CLASS: { label: "Primera Clase", desc: "Completaste tu primera clase en Flō", icon: "🎉" },
    MILESTONE_5: { label: "5 Clases", desc: "Llevas 5 clases completadas", icon: "⭐" },
    EARLY_BIRD: { label: "Early Bird", desc: "Tomaste una clase antes de las 7am", icon: "🌅" },
    FIRST_CLASS_TYPE_REFORMER: { label: "Reformer Desbloqueado", desc: "Tu primera clase de Reformer Pilates", icon: "🏋️" },
  };

  let achCount = 0;
  for (const a of achievementRecords) {
    await prisma.userAchievement.create({
      data: { userId: a.userId, achievementType: a.type, earnedAt: addDays(today, -3), metadata: {} },
    });
    achCount++;
  }

  // Group by type and create one feed event per type
  const allUsers = [clientWithPack10, clientExpired, clientUnlimited, clientPrimeraVez, clientNoPackage];
  const byType = new Map<string, typeof allUsers>();
  for (const a of achievementRecords) {
    const list = byType.get(a.type) ?? [];
    const u = allUsers.find((u) => u.id === a.userId);
    if (u) list.push(u);
    byType.set(a.type, list);
  }

  let achEventCount = 0;
  const typeKeys = [...byType.keys()];
  for (let t = 0; t < typeKeys.length; t++) {
    const type = typeKeys[t];
    const users = byType.get(type)!;
    const def = achievementLabels[type];
    await prisma.feedEvent.create({
      data: {
        userId: users[0].id,
        eventType: "ACHIEVEMENT_UNLOCKED",
        visibility: "STUDIO_WIDE",
        createdAt: addDays(today, -(typeKeys.length - t)),
        payload: {
          achievementType: type,
          label: def.label,
          description: def.desc,
          icon: def.icon,
          users: users.map((u) => ({ id: u.id, name: u.name ?? "Miembro", image: u.image })),
        },
      },
    });
    achEventCount++;
  }
  console.log(`✓ Created ${achCount} achievements → ${achEventCount} grouped feed events`);

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
      requesterId: clientNoPackage.id,
      addresseeId: clientWithPack10.id,
      status: "PENDING",
    },
  });
  friendshipCount++;
  console.log(`✓ Created ${friendshipCount} friendships`);

  // --- CLASS_RESERVED feed events (friends-only) ---
  let reservedCount = 0;
  const reservedClasses = futureClasses.slice(0, 4);
  for (let i = 0; i < reservedClasses.length; i++) {
    const cls = reservedClasses[i];
    const ct = classTypes[i % classTypes.length];
    const coach = coachUsers[i % coachUsers.length];
    const user = allClientsForInteractions[i % allClientsForInteractions.length];

    await prisma.feedEvent.create({
      data: {
        userId: user.id,
        eventType: "CLASS_RESERVED",
        visibility: "FRIENDS_ONLY",
        createdAt: addDays(today, -(i + 1)),
        payload: {
          classId: cls.id,
          className: ct.name,
          coachName: coach.name,
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
    await prisma.notification.create({
      data: {
        ...notifData[i],
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
  console.log(`   Feed Events:    ${feedCount + achEventCount}`);
  console.log(`   Photos:         ${photoCount}`);
  console.log(`   Achievements:   ${achCount}`);
  console.log(`   Likes:          ${likeCount}`);
  console.log(`   Comments:       ${commentCount}`);
  console.log(`   Friendships:    ${friendshipCount}`);
  console.log(`   Notifications:  ${notifCount}`);
  console.log(`   Songs:          ${songCount}`);

  // ── Studio Branding Settings ──
  await prisma.studioSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      studioName: "Flō",
      tagline: "Pilates & Wellness",
      slogan: "Muévete. Respira. Floréce.",
      metaDescription: "Tu espacio de Pilates y bienestar.",
      fontPairing: "playfair-dmsans",
      colorBg: "#FAF9F6",
      colorFg: "#1C1917",
      colorSurface: "#F5F2ED",
      colorAccent: "#C9A96E",
      colorAccentSoft: "#E8D9BF",
      colorMuted: "#8C8279",
      colorBorder: "#E8E2D9",
      colorCoach: "#2D5016",
      colorAdmin: "#1A2C4E",
    },
  });
  console.log("   Branding:       ✓");

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
