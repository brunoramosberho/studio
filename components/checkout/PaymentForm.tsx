"use client";

import { useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJS } from "@stripe/stripe-js";
import { Loader2, Lock } from "lucide-react";

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

interface PaymentFormProps {
  clientSecret: string;
  stripeAccountId: string;
  amount: number;
  currency?: string;
  onSuccess?: () => void;
  returnUrl?: string;
}

export function PaymentForm({
  clientSecret,
  stripeAccountId,
  amount,
  currency = "EUR",
  onSuccess,
  returnUrl,
}: PaymentFormProps) {
  return (
    <Elements
      stripe={getStripePromise(stripeAccountId)}
      options={{
        clientSecret,
        appearance: { theme: "flat" },
      }}
    >
      <CheckoutForm
        amount={amount}
        currency={currency}
        onSuccess={onSuccess}
        returnUrl={returnUrl}
      />
    </Elements>
  );
}

function CheckoutForm({
  amount,
  currency,
  onSuccess,
  returnUrl,
}: {
  amount: number;
  currency: string;
  onSuccess?: () => void;
  returnUrl?: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsLoading(true);
    setError(null);

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url:
          returnUrl ?? `${window.location.origin}/payment/success`,
      },
      redirect: "if_required",
    });

    if (submitError) {
      setError(submitError.message ?? "Error al procesar el pago");
      setIsLoading(false);
    } else {
      onSuccess?.();
    }
  };

  const formatted = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
  }).format(amount);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement
        options={{
          layout: "accordion",
          wallets: { applePay: "auto", googlePay: "auto" },
          fields: { billingDetails: "never" },
        }}
      />
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
            Procesando…
          </>
        ) : (
          `Pagar ${formatted}`
        )}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
        <Lock className="h-3 w-3" />
        Pago seguro cifrado con Stripe
      </p>
    </form>
  );
}
