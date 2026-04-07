"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Loader2, Clock, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type { IntroOfferData } from "@/lib/conversion/nudge-engine";

interface IntroOfferCardProps {
  data: IntroOfferData;
  onAccept: () => void;
  onReject: () => void;
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function IntroOfferCard({
  data,
  onAccept,
  onReject,
}: IntroOfferCardProps) {
  const [timeLeft, setTimeLeft] = useState(() =>
    Math.max(
      0,
      Math.floor(
        (new Date(data.expiresAt).getTime() - Date.now()) / 1000,
      ),
    ),
  );
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const expired = timeLeft <= 0;

  async function handleAccept() {
    setAccepting(true);
    try {
      if (!data.isReturning && data.membershipId) {
        await fetch("/api/conversion/intro-offer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ membershipId: data.membershipId }),
        });
      }

      const res = await fetch("/api/conversion/intro-offer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });

      if (res.ok) {
        onAccept();
      }
    } finally {
      setAccepting(false);
    }
  }

  async function handleReject() {
    setRejecting(true);
    try {
      await fetch("/api/conversion/intro-offer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      await fetch("/api/conversion/nudge/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nudgeType: "intro_offer",
          event: "dismissed",
        }),
      });
      onReject();
    } finally {
      setRejecting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="overflow-hidden rounded-2xl"
    >
      {/* Dark header */}
      <div className="bg-[#1C2340] px-6 py-8 text-center text-white">
        <p className="text-xs font-medium uppercase tracking-widest text-white/60">
          Oferta de bienvenida
        </p>
        <h2 className="mt-2 text-2xl font-bold">
          Tu primer mes por solo {formatCurrency(data.introPrice)}
        </h2>

        {!expired && (
          <div className="mt-4 flex items-center justify-center gap-2 text-white/80">
            <Clock className="h-4 w-4" />
            <span className="font-mono text-lg tracking-wider">
              {formatCountdown(timeLeft)}
            </span>
          </div>
        )}

        {expired && (
          <p className="mt-4 text-sm text-white/60">
            Esta oferta ha expirado
          </p>
        )}
      </div>

      {/* Body */}
      <div className="bg-white px-6 py-6 space-y-5">
        {/* Price comparison */}
        <div className="flex items-baseline justify-center gap-3">
          <span className="text-3xl font-bold text-[#3730B8]">
            {formatCurrency(data.introPrice)}
          </span>
          <span className="text-lg text-muted line-through">
            {formatCurrency(data.normalPrice)}
          </span>
        </div>

        {data.saving > 0 && (
          <div className="rounded-xl bg-emerald-50 px-4 py-2 text-center text-sm font-medium text-emerald-800">
            Ahorras {formatCurrency(data.saving)} este mes
          </div>
        )}

        {/* Features */}
        <ul className="space-y-2.5 text-sm text-foreground">
          {[
            "Clases ilimitadas durante el mes",
            "Reserva prioritaria",
            "Cancela cuando quieras",
          ].map((feature) => (
            <li key={feature} className="flex items-center gap-2.5">
              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#3730B8]/10">
                <Check className="h-3 w-3 text-[#3730B8]" />
              </div>
              {feature}
            </li>
          ))}
        </ul>

        {/* CTA */}
        <Button
          size="lg"
          className="w-full min-h-[48px] bg-[#3730B8] hover:bg-[#2D27A0]"
          onClick={handleAccept}
          disabled={accepting || expired}
        >
          {accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Empezar por {formatCurrency(data.introPrice)} este mes
        </Button>

        {/* Reject link */}
        <button
          onClick={handleReject}
          disabled={rejecting}
          className="w-full text-center text-sm text-muted hover:text-foreground transition-colors"
        >
          {rejecting ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          ) : (
            "No gracias, pagar clase suelta →"
          )}
        </button>
      </div>
    </motion.div>
  );
}
