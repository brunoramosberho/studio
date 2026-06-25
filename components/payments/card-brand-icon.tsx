import { CreditCard } from "lucide-react";

/**
 * Card-brand badge (Mastercard / Visa / Amex / Discover, with a generic
 * fallback). Shared so saved cards look the same in the payment-methods page
 * and at checkout.
 */
export function CardBrandIcon({ brand }: { brand: string }) {
  const b = brand.toLowerCase();

  if (b === "mastercard") {
    return (
      <div className="flex h-9 w-12 items-center justify-center rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-border/40">
        <svg viewBox="0 0 38 24" className="h-5" aria-label="Mastercard">
          <circle cx="15" cy="12" r="8" fill="#EB001B" />
          <circle cx="23" cy="12" r="8" fill="#F79E1B" />
          <path d="M19 5.7a8 8 0 010 12.6 8 8 0 010-12.6z" fill="#FF5F00" />
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
        <span className="text-[9px] font-extrabold tracking-tight text-white">AMEX</span>
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
