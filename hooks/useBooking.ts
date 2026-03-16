import { useMutation, useQueryClient } from "@tanstack/react-query";

interface BookingPayload {
  classId: string;
  packageId?: string;
  guestName?: string;
  guestEmail?: string;
}

interface BookingError {
  error: string;
  full?: boolean;
  status?: number;
}

export function useBooking() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (payload: BookingPayload) => {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw { ...data, status: res.status } as BookingError;
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["packages", "mine"] });
    },
  });

  return {
    book: mutation.mutate,
    bookAsync: mutation.mutateAsync,
    isBooking: mutation.isPending,
    error: mutation.error as BookingError | null,
    data: mutation.data,
    reset: mutation.reset,
  };
}
