"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Check, X } from "lucide-react";

type Status = "loading" | "booking" | "succeeded" | "failed" | "paid-no-book";

const RETRY_INTERVAL_MS = 1500;
const RETRY_TIMEOUT_MS = 20_000;

export default function PaymentSuccessPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectStatus = params.get("redirect_status");
  const paymentIntentId = params.get("payment_intent");
  const shouldBook = params.get("book") === "1";
  const classId = params.get("classId");
  const spotNumberParam = params.get("spotNumber");
  const spotNumber = spotNumberParam ? Number(spotNumberParam) : null;

  const [status, setStatus] = useState<Status>("loading");
  const [bookErrorMessage, setBookErrorMessage] = useState<string | null>(null);
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    if (redirectStatus === "failed") {
      setStatus("failed");
      return;
    }

    if (!paymentIntentId) {
      router.replace(classId ? `/class/${classId}` : "/packages");
      return;
    }

    let cancelled = false;

    async function attemptBooking() {
      if (!shouldBook || !classId) {
        // Nothing to chain — just acknowledge the payment.
        setStatus("succeeded");
        setTimeout(() => router.replace("/my/packages"), 700);
        return;
      }

      setStatus("booking");
      const startedAt = Date.now();
      let lastError: string | null = null;

      while (!cancelled) {
        try {
          const res = await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              classId,
              paymentIntentId,
              ...(spotNumber != null && { spotNumber }),
            }),
          });

          if (res.ok) {
            // Pull data from response to hand off to the class page so it can
            // render the "Spot reserved" confirmation + login CTA without
            // needing a session.
            let bookedSpot: number | null = spotNumber;
            let bookedEmail: string | null = null;
            try {
              const data = await res.json();
              if (typeof data?.spotNumber === "number") {
                bookedSpot = data.spotNumber;
              }
              if (typeof data?.guestEmail === "string") {
                bookedEmail = data.guestEmail;
              } else if (typeof data?.userEmail === "string") {
                bookedEmail = data.userEmail;
              }
            } catch {
              // ignore — fall back to URL params
            }
            if (!cancelled) {
              setStatus("succeeded");
              const next = new URL(`/class/${classId}`, window.location.origin);
              next.searchParams.set("bookedAfterPayment", "1");
              if (bookedSpot != null) {
                next.searchParams.set("spot", String(bookedSpot));
              }
              if (bookedEmail) {
                next.searchParams.set("email", bookedEmail);
              }
              setTimeout(() => {
                router.replace(`${next.pathname}${next.search}`);
              }, 600);
            }
            return;
          }

          // 402 = package not yet ACTIVE (webhook still pending). Retry.
          // Any other error = real failure, surface immediately.
          let detail: string | null = null;
          try {
            const body = await res.json();
            detail = typeof body?.error === "string" ? body.error : null;
          } catch {
            // ignore
          }
          lastError = detail;
          if (res.status !== 402) {
            if (!cancelled) {
              setBookErrorMessage(detail);
              setStatus("paid-no-book");
            }
            return;
          }
        } catch {
          lastError = "No pudimos terminar la reserva por un problema de red.";
        }

        if (Date.now() - startedAt > RETRY_TIMEOUT_MS) {
          if (!cancelled) {
            setBookErrorMessage(lastError);
            setStatus("paid-no-book");
          }
          return;
        }
        await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
      }
    }

    attemptBooking();
    return () => {
      cancelled = true;
    };
  }, [paymentIntentId, redirectStatus, router, shouldBook, classId, spotNumber]);

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
