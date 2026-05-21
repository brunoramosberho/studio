"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  Check,
} from "lucide-react";
import { PageTransition } from "@/components/shared/page-transition";
import { AddCardSheet } from "@/components/checkout/AddCardSheet";
import { useTranslations } from "next-intl";

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault?: boolean;
}

function BrandIcon({ brand }: { brand: string }) {
  const b = brand.toLowerCase();

  if (b === "mastercard") {
    return (
      <div className="flex h-9 w-12 items-center justify-center rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-border/40">
        <svg viewBox="0 0 38 24" className="h-5" aria-label="Mastercard">
          <circle cx="15" cy="12" r="8" fill="#EB001B" />
          <circle cx="23" cy="12" r="8" fill="#F79E1B" />
          <path
            d="M19 5.7a8 8 0 010 12.6 8 8 0 010-12.6z"
            fill="#FF5F00"
          />
        </svg>
      </div>
    );
  }

  if (b === "visa") {
    return (
      <div className="flex h-9 w-12 items-center justify-center rounded-lg bg-[#1A1F71] shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <span className="font-display text-[11px] font-black italic tracking-tight text-white">
          VISA
        </span>
      </div>
    );
  }

  if (b === "amex" || b === "american_express") {
    return (
      <div className="flex h-9 w-12 items-center justify-center rounded-lg bg-[#2E77BB] shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <span className="text-[9px] font-extrabold tracking-tight text-white">
          AMEX
        </span>
      </div>
    );
  }

  if (b === "discover") {
    return (
      <div className="flex h-9 w-12 items-center justify-center rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-border/40">
        <span className="text-[8px] font-extrabold uppercase tracking-tight text-[#FF6F00]">
          Discover
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-9 w-12 items-center justify-center rounded-lg bg-surface ring-1 ring-border/40">
      <CreditCard className="h-4 w-4 text-muted" />
    </div>
  );
}

export default function PaymentMethodsPage() {
  const t = useTranslations("paymentMethods");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showAddCard, setShowAddCard] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data: cards = [], isLoading } = useQuery<SavedCard[]>({
    queryKey: ["payment-methods"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/payment-methods");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const res = await fetch("/api/stripe/payment-methods", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId }),
      });
      if (!res.ok) throw new Error(t("removeError"));
    },
    onMutate: (id) => setRemovingId(id),
    onSettled: () => setRemovingId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
    },
  });

  return (
    <PageTransition>
      <div className="space-y-5 pb-20">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-surface"
          >
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="font-display text-xl font-bold text-foreground">
            {t("title")}
          </h1>
        </div>

        {/* Cards list */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface">
              <CreditCard className="h-7 w-7 text-muted" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              {t("noCards")}
            </p>
            <p className="mt-1 text-xs text-muted">
              {t("noCardsDesc")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {cards.map((card) => {
                const brandName =
                  card.brand === "mastercard"
                    ? "Mastercard"
                    : card.brand === "visa"
                      ? "Visa"
                      : card.brand === "amex" || card.brand === "american_express"
                        ? "Amex"
                        : card.brand === "discover"
                          ? "Discover"
                          : "Tarjeta";
                return (
                  <motion.div
                    key={card.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card px-4 py-3.5"
                  >
                    <BrandIcon brand={card.brand} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-semibold text-foreground">
                          {brandName} ·· {card.last4}
                        </p>
                        {card.isDefault && (
                          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                            <Check className="mr-0.5 inline h-2.5 w-2.5" />
                            {t("default")}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {t("expires", {
                          date: `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}`,
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => removeMutation.mutate(card.id)}
                      disabled={removingId === card.id}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      {removingId === card.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Add card button */}
        <button
          onClick={() => setShowAddCard(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/60 py-4 text-[14px] font-medium text-muted transition-colors active:bg-surface"
        >
          <Plus className="h-4 w-4" />
          {t("addNewCard")}
        </button>

        <AddCardSheet
          open={showAddCard}
          onClose={() => setShowAddCard(false)}
          onSuccess={() => {
            setShowAddCard(false);
            queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
          }}
        />
      </div>
    </PageTransition>
  );
}
