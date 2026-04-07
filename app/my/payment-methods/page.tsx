"use client";

import { useState } from "react";
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
import Link from "next/link";
import { PageTransition } from "@/components/shared/page-transition";
import { AddCardSheet } from "@/components/checkout/AddCardSheet";

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
  discover: "Discover",
};

function BrandIcon({ brand }: { brand: string }) {
  const label = brandLabels[brand] ?? brand;
  return (
    <div className="flex h-10 w-14 items-center justify-center rounded-lg border border-border/40 bg-white text-[11px] font-bold uppercase tracking-wider text-muted">
      {label}
    </div>
  );
}

export default function PaymentMethodsPage() {
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
      if (!res.ok) throw new Error("Failed to remove");
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
          <Link
            href="/my/profile"
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-surface"
          >
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </Link>
          <h1 className="font-display text-xl font-bold text-foreground">
            Métodos de pago
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
              Sin tarjetas guardadas
            </p>
            <p className="mt-1 text-xs text-muted">
              Añade una tarjeta para agilizar tus próximos pagos
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {cards.map((card) => (
                <motion.div
                  key={card.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  className="flex items-center gap-3 rounded-2xl border border-border/40 bg-white px-4 py-3.5"
                >
                  <BrandIcon brand={card.brand} />
                  <div className="flex-1">
                    <p className="text-[15px] font-medium text-foreground">
                      ····  {card.last4}
                    </p>
                    <p className="text-xs text-muted">
                      {String(card.expMonth).padStart(2, "0")}/{String(card.expYear).slice(-2)}
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
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Add card button */}
        <button
          onClick={() => setShowAddCard(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/60 py-4 text-[14px] font-medium text-muted transition-colors active:bg-surface"
        >
          <Plus className="h-4 w-4" />
          Añadir nueva tarjeta
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
