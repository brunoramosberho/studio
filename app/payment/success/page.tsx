"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Check, X } from "lucide-react";

type Status = "loading" | "succeeded" | "failed";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 20_000;

export default function PaymentSuccessPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectStatus = params.get("redirect_status");
  const paymentIntentId = params.get("payment_intent");

  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (redirectStatus === "failed") {
      setStatus("failed");
      return;
    }

    if (!paymentIntentId) {
      router.replace("/my/packages");
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch("/api/packages/mine", { cache: "no-store" });
          if (res.ok) {
            const packages: { stripePaymentId?: string }[] = await res.json();
            const found = packages.some((p) => p.stripePaymentId === paymentIntentId);
            if (found) {
              if (!cancelled) {
                setStatus("succeeded");
                setTimeout(() => router.replace("/my/packages"), 800);
              }
              return;
            }
          }
        } catch {
          // ignore — retry next tick
        }

        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          if (!cancelled) {
            // Webhook still hasn't landed. Redirect anyway — the package will
            // appear shortly once the webhook fires.
            router.replace("/my/packages?payment=pending");
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
  }, [paymentIntentId, redirectStatus, router]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        {status === "loading" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-muted" />
            <p className="text-sm text-muted">Confirmando tu pago…</p>
          </>
        )}
        {status === "succeeded" && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <Check className="h-7 w-7 text-green-600" />
            </div>
            <p className="font-display text-lg font-bold">¡Pago confirmado!</p>
            <p className="text-sm text-muted">Llevándote a tus paquetes…</p>
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
              onClick={() => router.replace("/packages")}
              className="mt-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background"
            >
              Volver a paquetes
            </button>
          </>
        )}
      </div>
    </div>
  );
}
