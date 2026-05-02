"use client";

import { useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Coffee,
  ArrowRight,
  Sparkles,
  Check,
  Clock,
  ShoppingCart,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency, formatTime } from "@/lib/utils";

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
  classEndsAt?: string | null;
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

type Phase = "browse" | "success";

export function ProductPickStep({ bookingId, onComplete, onSkip }: ProductPickStepProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("browse");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [confirmedItems, setConfirmedItems] = useState<
    { product: ProductOption; quantity: number }[]
  >([]);
  const [pickupAt, setPickupAt] = useState<Date | null>(null);

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

  // Open the sheet once we know there are products to offer; if the studio
  // has pre-orders disabled or the catalog is empty, skip immediately so the
  // member never sees an empty modal.
  useEffect(() => {
    if (!data) return;
    if (phase === "success") return;
    if (!data.studio.productsEnabled || data.products.length === 0) {
      onSkip();
      return;
    }
    setOpen(true);
  }, [data, onSkip, phase]);

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
  const totalQty = cartItems.reduce((acc, it) => acc + it.quantity, 0);
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
      setConfirmedItems(cartItems);
      if (data?.classEndsAt) setPickupAt(new Date(data.classEndsAt));
      setPhase("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar el pago");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    setOpen(false);
    onSkip();
  }

  function handleContinueAfterSuccess() {
    setOpen(false);
    onComplete();
  }

  // Don't render the sheet host until we know we should show something.
  if (isLoading || !data) return null;
  if (!data.studio.productsEnabled || data.products.length === 0) return null;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        // Closing while still browsing = skip. Closing after success = complete.
        if (!next) {
          if (phase === "success") handleContinueAfterSuccess();
          else handleSkip();
        } else {
          setOpen(true);
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
            "sm:inset-x-auto sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:max-h-[88dvh]",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Pre-ordenar productos para tu clase
          </DialogPrimitive.Title>

          {/* Drag handle (mobile) */}
          <div className="flex justify-center pb-1 pt-2 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>

          {/* Close button (top right) — hidden during success so the screen feels final */}
          {phase === "browse" && (
            <DialogPrimitive.Close
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-card/70 text-muted shadow-sm transition-colors hover:bg-card hover:text-foreground sm:right-4 sm:top-4"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          )}

          {phase === "success" ? (
            <SuccessScreen
              items={confirmedItems}
              totalAmount={totalAmount}
              currency={currency}
              studioName={data.studio.name}
              pickupAt={pickupAt}
              onContinue={handleContinueAfterSuccess}
            />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2">
                <Hero studioName={data.studio.name} />
                <div className="mt-5 space-y-6">
                  {grouped.map((group) => (
                    <div key={group.id} className="space-y-2">
                      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        {group.name}
                      </p>
                      <div className="space-y-2.5">
                        {group.products.map((p) => (
                          <ProductRow
                            key={p.id}
                            product={p}
                            quantity={cart[p.id] ?? 0}
                            onInc={() => inc(p.id)}
                            onDec={() => dec(p.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <AnimatePresence>
                  {hasCart && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <Card className="mt-5 rounded-2xl border border-accent/20 bg-card">
                        <CardContent className="space-y-3 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                            Método de pago
                          </p>
                          {cardsLoading ? (
                            <div className="flex items-center gap-2 text-xs text-muted">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Cargando métodos de pago…
                            </div>
                          ) : cards.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted">
                              <p>No tienes una tarjeta guardada.</p>
                              <Button
                                asChild
                                variant="link"
                                size="sm"
                                className="mt-1 h-auto p-0 text-xs"
                              >
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
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && (
                  <Card className="mt-4 rounded-2xl border border-red-200 bg-red-50">
                    <CardContent className="p-3">
                      <p className="text-xs text-red-700">{error}</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Footer CTA — anchored inside the sheet, never collides with bottom nav */}
              <div
                className="border-t border-border/60 bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {hasCart ? (
                    <motion.div
                      key="cta-cart"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
                            <ShoppingCart className="h-3.5 w-3.5" />
                            <motion.span
                              key={totalQty}
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: "spring", stiffness: 400, damping: 16 }}
                              className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold tabular-nums text-white"
                            >
                              {totalQty}
                            </motion.span>
                          </span>
                          <p className="text-xs text-muted">
                            {cartItems.length === 1
                              ? cartItems[0].product.name
                              : `${cartItems.length} productos`}
                          </p>
                        </div>
                        <motion.p
                          key={totalCents}
                          initial={{ scale: 0.92 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 18 }}
                          className="font-display text-base font-bold text-foreground"
                        >
                          {formatCurrency(totalAmount, currency)}
                        </motion.p>
                      </div>
                      <Button
                        size="lg"
                        className="w-full bg-gradient-to-r from-accent to-accent/80 text-white shadow-md hover:from-accent/90 hover:to-accent/70"
                        disabled={submitting || !selectedCardId}
                        onClick={handleSubmit}
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Procesando…
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Pre-ordenar
                          </>
                        )}
                      </Button>
                      <button
                        type="button"
                        onClick={handleSkip}
                        className="block w-full py-1 text-center text-[11px] text-muted hover:text-foreground"
                      >
                        Saltar y solo reservar la clase
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="cta-skip"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Button
                        variant="ghost"
                        size="lg"
                        className="w-full text-muted"
                        onClick={handleSkip}
                      >
                        No, gracias
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Hero({ studioName }: { studioName: string }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-accent/15 bg-gradient-to-br from-accent/15 via-accent/5 to-transparent p-6 pb-7 text-center">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-accent/30 blur-3xl"
        initial={{ opacity: 0.6, scale: 0.85 }}
        animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.85, 1.05, 0.85] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      <Sparkle className="left-6 top-4" delay={0.1} />
      <Sparkle className="right-7 top-7" delay={0.6} />
      <Sparkle className="right-12 bottom-6" delay={1.2} />

      <motion.div
        className="relative mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-card shadow-lg"
        initial={{ scale: 0, rotate: -12 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 16, delay: 0.05 }}
      >
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-2xl bg-accent/20"
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
        />
        <Coffee className="relative h-7 w-7 text-accent" strokeWidth={2.2} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="relative inline-flex items-center gap-1.5 rounded-full bg-card/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent"
      >
        <Sparkles className="h-3 w-3" />
        Nuevo
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="relative mt-2 font-display text-2xl font-bold leading-tight text-foreground"
      >
        ¿Algo rico para
        <br />
        después de tu clase?
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32 }}
        className="relative mt-2 text-sm leading-relaxed text-muted"
      >
        Pídelo ahora y recógelo en el bar de{" "}
        <span className="font-semibold text-foreground">{studioName}</span> al salir.
      </motion.p>
    </div>
  );
}

function Sparkle({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <motion.span
      aria-hidden
      className={cn("absolute text-accent/70", className)}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 0.6], rotate: [0, 30, -10] }}
      transition={{
        duration: 2.4,
        repeat: Infinity,
        repeatDelay: 1.2,
        delay,
        ease: "easeOut",
      }}
    >
      <Sparkles className="h-3.5 w-3.5" />
    </motion.span>
  );
}

function ProductRow({
  product,
  quantity,
  onInc,
  onDec,
}: {
  product: ProductOption;
  quantity: number;
  onInc: () => void;
  onDec: () => void;
}) {
  const inCart = quantity > 0;
  return (
    <motion.div whileTap={{ scale: 0.99 }}>
      <Card
        className={cn(
          "overflow-hidden rounded-2xl border transition-all",
          inCart
            ? "border-accent/40 bg-accent/5 shadow-sm"
            : "border-border/60 hover:border-border",
        )}
      >
        <CardContent className="flex items-center gap-3 p-3">
          <div className="relative">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className={cn(
                  "h-16 w-16 rounded-xl object-cover transition-transform",
                  inCart && "scale-[1.03] ring-2 ring-accent/40",
                )}
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-surface">
                <ShoppingBag className="h-5 w-5 text-muted/40" />
              </div>
            )}
            <AnimatePresence>
              {inCart && (
                <motion.span
                  key="badge"
                  initial={{ scale: 0, y: -4 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0, y: -4 }}
                  transition={{ type: "spring", stiffness: 380, damping: 18 }}
                  className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold tabular-nums text-white shadow"
                >
                  {quantity}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
            {product.description && (
              <p className="truncate text-xs text-muted">{product.description}</p>
            )}
            <p className="mt-0.5 text-sm font-bold text-accent">
              {formatCurrency(product.price, product.currency)}
            </p>
          </div>

          {!inCart ? (
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1 rounded-full border-accent/30 px-3 text-xs font-semibold text-accent hover:bg-accent/10"
              onClick={onInc}
            >
              <Plus className="h-3.5 w-3.5" />
              Añadir
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full bg-card p-1 shadow-sm ring-1 ring-accent/30">
              <button
                type="button"
                onClick={onDec}
                aria-label="Restar"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <motion.span
                key={quantity}
                initial={{ scale: 0.7 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 16 }}
                className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums text-foreground"
              >
                {quantity}
              </motion.span>
              <button
                type="button"
                onClick={onInc}
                aria-label="Sumar"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent/90"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SuccessScreen({
  items,
  totalAmount,
  currency,
  studioName,
  pickupAt,
  onContinue,
}: {
  items: { product: ProductOption; quantity: number }[];
  totalAmount: number;
  currency: string;
  studioName: string;
  pickupAt: Date | null;
  onContinue: () => void;
}) {
  // Math.random can't be called during render (React Compiler), so seed
  // particles once via lazy state init.
  const [particles] = useState(() =>
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      angle: Math.random() * Math.PI * 2,
      distance: 70 + Math.random() * 110,
      size: 4 + Math.random() * 5,
      delay: Math.random() * 0.25,
      opacity: 0.5 + Math.random() * 0.5,
    })),
  );

  return (
    <div className="flex flex-1 flex-col">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-1 flex-col items-center overflow-y-auto px-4 pb-4 pt-10 text-center"
      >
        <div className="relative mb-7 flex h-24 w-24 items-center justify-center">
          {particles.map((p) => (
            <motion.span
              key={p.id}
              aria-hidden
              className="absolute rounded-full bg-accent"
              style={{ width: p.size, height: p.size }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
              animate={{
                x: Math.cos(p.angle) * p.distance,
                y: Math.sin(p.angle) * p.distance,
                opacity: [0, p.opacity, 0],
                scale: [0, 1, 0.4],
              }}
              transition={{ duration: 1.3, delay: 0.3 + p.delay, ease: "easeOut" }}
            />
          ))}

          <motion.div
            className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 14, delay: 0.1 }}
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 rounded-full bg-emerald-400/40"
              animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 14, delay: 0.35 }}
            >
              <Check className="h-10 w-10 text-white" strokeWidth={3} />
            </motion.div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700"
        >
          <Sparkles className="h-3 w-3" />
          Pago confirmado
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="font-display text-2xl font-bold leading-tight text-foreground"
        >
          ¡Lo tendremos listo!
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="mt-2 max-w-xs text-sm leading-relaxed text-muted"
        >
          Pasa al bar de{" "}
          <span className="font-semibold text-foreground">{studioName}</span> al
          terminar tu clase para recoger tu pedido.
        </motion.p>

        {pickupAt && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85 }}
            className="mt-6 flex items-center gap-2 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-2.5"
          >
            <Clock className="h-4 w-4 text-accent" />
            <span className="text-xs font-medium text-muted">Listo a las</span>
            <span className="font-mono text-sm font-bold text-accent">
              {formatTime(pickupAt)}
            </span>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="mt-6 w-full max-w-sm"
        >
          <Card className="rounded-2xl border-border/50">
            <CardContent className="p-4 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Tu pedido
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {items.map((it) => (
                  <li
                    key={it.product.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="truncate">
                      <span className="mr-1.5 font-bold tabular-nums text-accent">
                        {it.quantity}×
                      </span>
                      {it.product.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {formatCurrency(it.product.price * it.quantity, it.product.currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-baseline justify-between border-t border-border/50 pt-2.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Total cobrado
                </span>
                <span className="font-display text-lg font-bold text-foreground">
                  {formatCurrency(totalAmount, currency)}
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      <div
        className="border-t border-border/60 bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <Button
          size="lg"
          className="w-full bg-gradient-to-r from-accent to-accent/80 text-white shadow-md hover:from-accent/90 hover:to-accent/70"
          onClick={onContinue}
        >
          Continuar
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
