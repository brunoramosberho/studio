"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Check,
  CalendarSync,
  CreditCard,
  X,
  Plus,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentForm } from "@/components/checkout/PaymentForm";
import { formatCurrency } from "@/lib/utils";

interface SubscribeSheetProps {
  open: boolean;
  onClose: () => void;
  pkg: {
    id: string;
    name: string;
    price: number;
    currency: string;
    recurringInterval: string | null;
    credits: number | null;
  };
  onSuccess?: () => void;
}

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

const brandLabels: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
};

type Step = "confirm" | "processing" | "select-card" | "payment" | "done";

export function SubscribeSheet({
  open,
  onClose,
  pkg,
  onSuccess,
}: SubscribeSheetProps) {
  const { data: session } = useSession();
  const t = useTranslations("checkout");
  const [step, setStep] = useState<Step>("confirm");
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<SavedCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<{
    clientSecret: string;
    stripeAccountId: string;
  } | null>(null);
  const [payingWithCard, setPayingWithCard] = useState<string | null>(null);

  useEffect(() => {
    if (open && session?.user) {
      resetState();
      setLoadingCards(true);
      fetch("/api/stripe/payment-methods")
        .then((r) => (r.ok ? r.json() : []))
        .then((cards: SavedCard[]) => {
          setSavedCards(cards);
          setSelectedCard(cards.length > 0 ? cards[0] : null);
        })
        .catch(() => {
          setSavedCards([]);
          setSelectedCard(null);
        })
        .finally(() => setLoadingCards(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session?.user]);

  function resetState() {
    setStep("confirm");
    setError(null);
    setPaymentData(null);
    setPayingWithCard(null);
    setLoading(false);
  }

  async function subscribe(paymentMethodId?: string) {
    setLoading(true);
    setError(null);
    setStep("processing");

    try {
      const res = await fetch("/api/stripe/member-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: pkg.id, paymentMethodId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("processingError"));
        setStep("confirm");
        setLoading(false);
        return;
      }

      if (data.status === "active") {
        setStep("done");
        onSuccess?.();
        return;
      }

      if (data.status === "requires_payment" && data.clientSecret) {
        setPaymentData({
          clientSecret: data.clientSecret,
          stripeAccountId: data.stripeAccountId,
        });
        setStep("payment");
        setLoading(false);
        return;
      }

      setError(t("unexpectedStatus") + ": " + data.status);
      setStep("confirm");
    } catch {
      setError(t("connectionError"));
      setStep("confirm");
    } finally {
      setLoading(false);
      setPayingWithCard(null);
    }
  }

  function handleSubscribe() {
    if (selectedCard) {
      subscribe(selectedCard.id);
    } else {
      subscribe();
    }
  }

  function selectCard(card: SavedCard) {
    setSelectedCard(card);
    setStep("confirm");
  }

  if (!open) return null;

  const interval = pkg.recurringInterval === "year" ? t("year") : t("month");
  const formatted = formatCurrency(pkg.price, pkg.currency);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-foreground/40 backdrop-blur-sm"
        onClick={step !== "processing" ? () => { resetState(); onClose(); } : undefined}
      />

      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-[70] max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-card shadow-warm-lg sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {step !== "processing" && (
          <button
            onClick={() => { resetState(); onClose(); }}
            className="absolute right-4 top-4 rounded-full p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground sm:top-5"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="px-6 pb-8 pt-5">
          <AnimatePresence mode="wait">
            {step === "confirm" && (
              <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h2 className="font-display text-xl font-bold text-foreground">
                  {t("subscribe")}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {t("reviewDetails")}
                </p>

                {error && (
                  <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/5 p-5">
                  <p className="font-display text-lg font-bold text-foreground">
                    {pkg.name}
                  </p>
                  <div className="mt-3 flex items-end justify-between">
                    <div className="text-sm text-muted">
                      <p>{pkg.credits === null ? t("unlimitedClasses") : t("classesCount", { num: pkg.credits })}</p>
                      <p>{t("renewal")} {pkg.recurringInterval === "year" ? t("annual") : t("monthly")}</p>
                    </div>
                    <p className="font-display text-2xl font-bold text-foreground">
                      {formatted}<span className="text-sm font-normal text-muted">/{interval}</span>
                    </p>
                  </div>
                </div>

                {/* Payment method section */}
                {!loadingCards && (
                  <div className="mt-4">
                    {selectedCard ? (
                      <button
                        onClick={() => setStep("select-card")}
                        className="flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-surface/50 px-4 py-3 text-left transition-colors active:bg-surface"
                      >
                        <div className="flex h-8 w-11 items-center justify-center rounded-lg border border-border/30 bg-card text-[9px] font-bold uppercase tracking-wider text-muted">
                          {brandLabels[selectedCard.brand] ?? selectedCard.brand}
                        </div>
                        <div className="flex-1">
                          <p className="text-[13px] font-medium text-foreground">····  {selectedCard.last4}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted" />
                      </button>
                    ) : (
                      <p className="text-center text-xs text-muted">
                        {t("paymentMethodRequired")}
                      </p>
                    )}
                  </div>
                )}

                {loadingCards && (
                  <div className="mt-4 flex justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted" />
                  </div>
                )}

                <Button
                  size="lg"
                  onClick={handleSubscribe}
                  disabled={loading || loadingCards}
                  className="mt-5 w-full gap-2 rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <CalendarSync className="h-4 w-4" />
                  {t("subscribeFor", { price: formatted, interval })}
                </Button>
                <p className="mt-2 text-center text-[10px] text-muted/60">
                  {t("cancelAnytime")}
                </p>
              </motion.div>
            )}

            {step === "processing" && (
              <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
                <p className="mt-4 text-sm font-medium text-muted">{t("processing")}</p>
              </motion.div>
            )}

            {step === "select-card" && (
              <motion.div key="select-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h2 className="font-display text-xl font-bold text-foreground">
                  {t("paymentMethod")}
                </h2>
                <p className="mt-1 mb-5 text-sm text-muted">
                  {t("chooseCard")}
                </p>

                <div className="space-y-2">
                  {savedCards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => selectCard(card)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors active:bg-surface ${
                        selectedCard?.id === card.id
                          ? "border-foreground/30 bg-surface/80"
                          : "border-border/40 bg-card"
                      }`}
                    >
                      <div className="flex h-9 w-12 items-center justify-center rounded-lg border border-border/30 bg-surface text-[10px] font-bold uppercase tracking-wider text-muted">
                        {brandLabels[card.brand] ?? card.brand}
                      </div>
                      <div className="flex-1">
                        <p className="text-[14px] font-medium text-foreground">····  {card.last4}</p>
                        <p className="text-[11px] text-muted">
                          {String(card.expMonth).padStart(2, "0")}/{String(card.expYear).slice(-2)}
                        </p>
                      </div>
                      {selectedCard?.id === card.id && (
                        <Check className="h-4 w-4 text-foreground" />
                      )}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setSelectedCard(null);
                    setStep("confirm");
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/60 py-3.5 text-[13px] font-medium text-muted transition-colors active:bg-surface"
                >
                  <Plus className="h-4 w-4" />
                  {t("useAnotherCard")}
                </button>
              </motion.div>
            )}

            {step === "payment" && paymentData && (
              <motion.div key="payment" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h2 className="font-display text-xl font-bold text-foreground">
                  {t("paymentDetails")}
                </h2>
                <p className="mt-1 mb-5 text-sm text-muted">
                  {pkg.name} · {formatted}/{interval}
                </p>

                <PaymentForm
                  clientSecret={paymentData.clientSecret}
                  stripeAccountId={paymentData.stripeAccountId}
                  amount={pkg.price}
                  currency={pkg.currency}
                  onSuccess={() => {
                    setStep("done");
                    onSuccess?.();
                  }}
                />
              </motion.div>
            )}

            {step === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center py-8 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.1, damping: 12 }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100"
                >
                  <Check className="h-8 w-8 text-green-600" />
                </motion.div>
                <h2 className="mt-5 font-display text-xl font-bold text-foreground">
                  {t("subscriptionActive")}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {pkg.name} · {formatted}/{interval}
                </p>
                <Button
                  onClick={() => { resetState(); onClose(); }}
                  className="mt-8 w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                  size="lg"
                >
                  {t("done")}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}
