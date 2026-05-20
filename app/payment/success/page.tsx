"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Check, X } from "lucide-react";

type Status = "loading" | "booking" | "succeeded" | "failed" | "paid-no-book";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 20_000;

export default function PaymentSuccessPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectStatus = params.get("redirect_status");
  const paymentIntentId = params.get("payment_intent");
  const shouldBook = params.get("book") === "1";
  const classId = params.get("classId");
  const spotNumberParam = params.get("spotNumber");
  const packageIdParam = params.get("packageId");
  const spotNumber = spotNumberParam ? Number(spotNumberParam) : null;

  const [status, setStatus] = useState<Status>("loading");
  const [bookErrorMessage, setBookErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (redirectStatus === "failed") {
      setStatus("failed");
      return;
    }

    if (!paymentIntentId) {
      router.replace(classId ? `/class/${classId}` : "/packages");
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    async function bookAfterPayment(packageId: string) {
      try {
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classId,
            packageId,
            ...(spotNumber != null && { spotNumber }),
          }),
        });
        if (!res.ok) {
          let detail: string | null = null;
          try {
            const body = await res.json();
            detail = typeof body?.error === "string" ? body.error : null;
          } catch {
            // ignore
          }
          if (!cancelled) {
            setBookErrorMessage(detail);
            setStatus("paid-no-book");
          }
          return;
        }
        if (!cancelled) {
          setStatus("succeeded");
          setTimeout(() => {
            router.replace(`/class/${classId}?bookedAfterPayment=1`);
          }, 700);
        }
      } catch {
        if (!cancelled) {
          setBookErrorMessage("No pudimos terminar la reserva por un problema de red.");
          setStatus("paid-no-book");
        }
      }
    }

    async function poll() {
      let sawAuthError = false;
      while (!cancelled) {
        try {
          const res = await fetch("/api/packages/mine", { cache: "no-store" });
          if (res.status === 401) {
            sawAuthError = true;
          } else if (res.ok) {
            const packages: {
              id: string;
              packageId: string;
              stripePaymentId?: string;
            }[] = await res.json();
            const match = packages.find(
              (p) => p.stripePaymentId === paymentIntentId,
            );
            if (match) {
              if (!cancelled) {
                if (shouldBook && classId) {
                  setStatus("booking");
                  await bookAfterPayment(packageIdParam ?? match.packageId);
                } else {
                  setStatus("succeeded");
                  setTimeout(
                    () => router.replace(`/class/${classId ?? ""}`),
                    700,
                  );
                }
              }
              return;
            }
          }
        } catch {
          // ignore — retry next tick
        }

        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          if (!cancelled) {
            // Either user is a guest (401) and we can't poll their packages,
            // or the webhook is delayed. Either way, payment went through
            // (Stripe redirected here with success). Hand off to the class
            // page so the member can complete the booking from there.
            if (sawAuthError) {
              setBookErrorMessage(
                "Pago confirmado. Inicia sesión para reservar tu lugar.",
              );
            }
            setStatus("paid-no-book");
          }
          return;
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [
    paymentIntentId,
    redirectStatus,
    router,
    shouldBook,
    classId,
    spotNumber,
    packageIdParam,
  ]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        {status === "loading" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-muted" />
            <p className="text-sm text-muted">Confirmando tu pago…</p>
          </>
        )}
        {status === "booking" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-muted" />
            <p className="text-sm text-muted">Reservando tu lugar…</p>
          </>
        )}
        {status === "succeeded" && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <Check className="h-7 w-7 text-green-600" />
            </div>
            <p className="font-display text-lg font-bold">¡Pago confirmado!</p>
            <p className="text-sm text-muted">Llevándote a tu clase…</p>
          </>
        )}
        {status === "paid-no-book" && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <Check className="h-7 w-7 text-green-600" />
            </div>
            <p className="font-display text-lg font-bold">¡Pago confirmado!</p>
            <p className="text-sm text-muted">
              {bookErrorMessage ??
                "Tu paquete ya está activo, pero no pudimos reservar la clase automáticamente."}
            </p>
            <button
              onClick={() =>
                router.replace(classId ? `/class/${classId}` : "/packages")
              }
              className="mt-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background"
            >
              {classId ? "Reservar mi lugar" : "Ver mis paquetes"}
            </button>
          </>
        )}
        {status === "failed" && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <X className="h-7 w-7 text-red-600" />
            </div>
            <p className="font-display text-lg font-bold">El pago no se completó</p>
            <p className="text-sm text-muted">
              Tu tarjeta no fue cobrada. Puedes intentarlo de nuevo.
            </p>
            <button
              onClick={() =>
                router.replace(classId ? `/class/${classId}` : "/packages")
              }
              className="mt-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background"
            >
              Volver
            </button>
          </>
        )}
      </div>
    </div>
  );
}
