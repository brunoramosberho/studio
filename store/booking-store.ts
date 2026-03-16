import { create } from "zustand";

interface BookingState {
  selectedClassId: string | null;
  selectedPackageId: string | null;
  isBooking: boolean;
  bookingSuccess: boolean;
  guestName: string;
  guestEmail: string;
  setSelectedClass: (id: string | null) => void;
  setSelectedPackage: (id: string | null) => void;
  setIsBooking: (val: boolean) => void;
  setBookingSuccess: (val: boolean) => void;
  setGuestName: (name: string) => void;
  setGuestEmail: (email: string) => void;
  reset: () => void;
}

export const useBookingStore = create<BookingState>((set) => ({
  selectedClassId: null,
  selectedPackageId: null,
  isBooking: false,
  bookingSuccess: false,
  guestName: "",
  guestEmail: "",
  setSelectedClass: (id) => set({ selectedClassId: id }),
  setSelectedPackage: (id) => set({ selectedPackageId: id }),
  setIsBooking: (val) => set({ isBooking: val }),
  setBookingSuccess: (val) => set({ bookingSuccess: val }),
  setGuestName: (name) => set({ guestName: name }),
  setGuestEmail: (email) => set({ guestEmail: email }),
  reset: () =>
    set({
      selectedClassId: null,
      selectedPackageId: null,
      isBooking: false,
      bookingSuccess: false,
      guestName: "",
      guestEmail: "",
    }),
}));
