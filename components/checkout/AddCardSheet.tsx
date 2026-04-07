"use client";

import { useState, useEffect } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJS } from "@stripe/stripe-js";
import { motion } from "framer-motion";
import { Loader2, X, Check, Lock } from "lucide-react";

const stripePromiseCache = new Map<string, Promise<StripeJS | null>>();

function getStripePromise(stripeAccountId: string) {
  if (!stripePromiseCache.has(stripeAccountId)) {
    stripePromiseCache.set(
      stripeAccountId,
      loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, {
        stripeAccount: stripeAccountId,
      }),
    );
  }
  return stripePromiseCache.get(stripeAccountId)!;
}

interface AddCardSheetProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddCardSheet({ open, onClose, onSuccess }: AddCardSheetProps) {
  const [setupData, setSetupData] = useState<{
    clientSecret: string;
    stripeAccountId: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSetupData(null);
      setError(null);
      return;
    }
    setLoading(true);
    fetch("/api/stripe/setup-intent", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Error ${res.status}`);
        }
        return res.json();
      })
      .then(setSetupData)
      .catch((err) => setError(err.message || "No se pudo iniciar. Intenta de nuevo."))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-[70] rounded-t-3xl bg-white shadow-warm-lg sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pb-8 pt-5">
          <h2 className="font-display text-xl font-bold text-foreground">
            Añadir tarjeta
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted">
            Se guardará para tus próximos pagos
          </p>

          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted" />
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {setupData && (
            <Elements
              stripe={getStripePromise(setupData.stripeAccountId)}
              options={{
                clientSecret: setupData.clientSecret,
                appearance: { theme: "flat" },
              }}
            >
              <SetupForm onSuccess={onSuccess} />
            </Elements>
          )}
        </div>
      </motion.div>
    </>
  );
}

function SetupForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsLoading(true);
    setError(null);

    const { error: setupError } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/my/payment-methods`,
      },
      redirect: "if_required",
    });

    if (setupError) {
      setError(setupError.message ?? "Error al guardar la tarjeta");
      setIsLoading(false);
    } else {
      setDone(true);
      setTimeout(onSuccess, 800);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center py-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", damping: 12 }}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100"
        >
          <Check className="h-7 w-7 text-green-600" />
        </motion.div>
        <p className="mt-3 text-sm font-medium text-foreground">
          Tarjeta guardada
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={isLoading || !stripe}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-4 text-[15px] font-semibold text-background transition-opacity disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Guardando…
          </>
        ) : (
          "Guardar tarjeta"
        )}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
        <Lock className="h-3 w-3" />
        Pago seguro cifrado con Stripe
      </p>
    </form>
  );
}
