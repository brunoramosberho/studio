import type {
  User,
  CoachProfile,
  ClassType,
  Class,
  Booking,
  Waitlist,
  Package,
  UserPackage,
  Role,
  Level,
  ClassStatus,
  BookingStatus,
  Room,
  Studio,
  Country,
  City,
} from "@prisma/client";

export type {
  User,
  CoachProfile,
  ClassType,
  Class,
  Booking,
  Waitlist,
  Package,
  UserPackage,
  Role,
  Level,
  ClassStatus,
  BookingStatus,
  Room,
  Studio,
  Country,
  City,
};

export interface RoomWithStudio extends Room {
  studio: Studio;
}

export interface ClassWithDetails extends Class {
  classType: ClassType;
  room: RoomWithStudio;
  coach: CoachProfile & { user: Pick<User, "name" | "image"> };
  bookings: Booking[];
  _count?: { bookings: number; waitlist: number };
  spotsLeft?: number;
  friendsGoing?: { id: string; name: string | null; image: string | null }[];
}

export interface BookingWithDetails extends Booking {
  class: ClassWithDetails;
}

export interface UserPackageWithDetails extends UserPackage {
  package: Package;
}

export interface CoachProfileWithUser extends CoachProfile {
  user: Pick<User, "id" | "name" | "email" | "image">;
}

export interface ScheduleFilters {
  classTypeId?: string;
  coachId?: string;
  level?: Level;
  timeOfDay?: "morning" | "afternoon" | "evening";
}

export interface AdminStats {
  bookingsToday: number;
  bookingsThisWeek: number;
  revenueThisWeek: number;
  avgOccupancy: number;
  newClientsThisWeek: number;
  popularClassType: string;
  packagesSoldThisMonth: Record<string, number>;
}
