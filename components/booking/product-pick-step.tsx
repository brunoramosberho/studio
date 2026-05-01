"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Minus, Plus, ShoppingBag, Coffee, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";

interface ProductOption {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  imageUrl: string | null;
  category: { id: string; name: string };
}

interface AvailableResponse {
  studio: { id: string; name: string; productsEnabled: boolean };
  products: ProductOption[];
}

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  isDefault?: boolean;
}

interface ProductPickStepProps {
  bookingId: string;
  onComplete: () => void;
  onSkip: () => void;
}

const brandLabels: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
};

export function ProductPickStep({ bookingId, onComplete, onSkip }: ProductPickStepProps) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<AvailableResponse>({
    queryKey: ["booking-products", bookingId],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${bookingId}/products`);
      if (!res.ok) throw new Error("Failed to load products");
      return res.json();
    },
  });

  const { data: cards = [], isLoading: cardsLoading } = useQuery<SavedCard[]>({
    queryKey: ["payment-methods"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/payment-methods");
      if (!res.ok) return [];
      const list = await res.json();
      return Array.isArray(list) ? list : [];
    },
  });

  useEffect(() => {
    if (cards.length > 0 && !selectedCardId) setSelectedCardId(cards[0].id);
  }, [cards, selectedCardId]);

  // If the studio has pre-orders disabled or no products, skip immediately.
  useEffect(() => {
    if (!data) return;
    if (!data.studio.productsEnabled || data.products.length === 0) {
      onSkip();
    }
  }, [data, onSkip]);

  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { id: string; name: string; products: ProductOption[] }>();
    for (const p of data.products) {
      const key = p.category.id;
      const existing = map.get(key);
      if (existing) existing.products.push(p);
      else map.set(key, { id: key, name: p.category.name, products: [p] });
    }
    return Array.from(map.values());
  }, [data]);

  const cartItems = useMemo(() => {
    if (!data) return [];
    return data.products
      .filter((p) => (cart[p.id] ?? 0) > 0)
      .map((p) => ({ product: p, quantity: cart[p.id] }));
  }, [cart, data]);

  const totalCents = cartItems.reduce(
    (acc, it) => acc + Math.round(it.product.price * 100) * it.quantity,
    0,
  );
  const totalAmount = totalCents / 100;
  const currency = cartItems[0]?.product.currency ?? "MXN";
  const hasCart = cartItems.length > 0;

  function inc(id: string) {
    setCart((c) => ({ ...c, [id]: Math.min(10, (c[id] ?? 0) + 1) }));
  }
  function dec(id: string) {
    setCart((c) => {
      const next = Math.max(0, (c[id] ?? 0) - 1);
      const copy = { ...c };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }

  async function handleSubmit() {
    if (!hasCart) return;
    if (!selectedCardId) {
      setError("Agrega un método de pago para pre-ordenar.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
          paymentMethodId: selectedCardId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo procesar el pago");
      }
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar el pago");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  if (!data || !data.studio.productsEnabled || data.products.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5 px-4 py-6"
    >
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
          <Coffee className="h-6 w-6 text-accent" />
        </div>
        <h2 className="font-display text-xl font-bold text-foreground">
          ¿Quieres pre-ordenar algo?
        </h2>
        <p className="mt-1 text-sm text-muted">
          Recógelo en {data.studio.name} al terminar tu clase.
        </p>
      </div>

      <div className="space-y-5">
        {grouped.map((group) => (
          <div key={group.id} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {group.name}
            </p>
            <div className="space-y-2">
              {group.products.map((p) => {
                const qty = cart[p.id] ?? 0;
                return (
                  <Card key={p.id} className="rounded-2xl">
                    <CardContent className="flex items-center gap-3 p-3">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="h-14 w-14 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface">
                          <ShoppingBag className="h-5 w-5 text-muted/40" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{p.name}</p>
                        {p.description && (
                          <p className="truncate text-xs text-muted">{p.description}</p>
                        )}
                        <p className="mt-0.5 text-sm font-bold text-accent">
                          {formatCurrency(p.price, p.currency)}
                        </p>
                      </div>
                      {qty === 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => inc(p.id)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => dec(p.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted hover:bg-surface"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => inc(p.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted hover:bg-surface"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {hasCart && (
        <Card className="rounded-2xl border border-accent/20 bg-accent/5">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold">Total</p>
              <p className="font-display text-lg font-bold text-accent">
                {formatCurrency(totalAmount, currency)}
              </p>
            </div>

            {cardsLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Cargando métodos de pago…
              </div>
            ) : cards.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted">
                <p>No tienes una tarjeta guardada.</p>
                <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0 text-xs">
                  <Link href="/my">Agregar una tarjeta</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {cards.map((c) => (
                  <label
                    key={c.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors",
                      selectedCardId === c.id
                        ? "border-accent bg-accent/10"
                        : "border-border hover:bg-surface/50",
                    )}
                  >
                    <input
                      type="radio"
                      name="pre-order-card"
                      checked={selectedCardId === c.id}
                      onChange={() => setSelectedCardId(c.id)}
                      className="accent-accent"
                    />
                    <span className="text-xs font-medium uppercase">
                      {brandLabels[c.brand] ?? c.brand}
                    </span>
                    <span className="text-muted">•••• {c.last4}</span>
                    {c.isDefault && (
                      <span className="ml-auto rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                        Última usada
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="rounded-2xl border border-red-200 bg-red-50">
          <CardContent className="p-3">
            <p className="text-xs text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <Button
          size="lg"
          className="w-full"
          disabled={!hasCart || submitting || !selectedCardId}
          onClick={handleSubmit}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {hasCart
            ? `Pre-ordenar (${formatCurrency(totalAmount, currency)})`
            : "Selecciona algo"}
        </Button>
        <Button variant="ghost" size="lg" className="w-full text-muted" onClick={onSkip}>
          Saltar
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}
