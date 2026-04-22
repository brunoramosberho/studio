"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    q: "How long does it take to set up Mgic?",
    a: "Most studios are up and running in under 30 minutes. We handle data migration from your current platform, and our team walks you through every step. No technical skills required.",
  },
  {
    q: "Do my members need to download an app?",
    a: "Nope. Mgic's member app is a Progressive Web App (PWA) — members just visit your branded link and add it to their home screen. Looks and feels native, no App Store needed.",
  },
  {
    q: "What payment processor do you use?",
    a: "We use Stripe Connect for secure, global payment processing. Your members can pay with credit cards, and you get payouts directly to your bank account. We never hold your money.",
  },
  {
    q: "Can I manage multiple studio locations?",
    a: "Absolutely. Our Scale plan includes full multi-studio management — separate rooms, coaches, and schedules per location, all controlled from one dashboard.",
  },
  {
    q: "How does MgicAI work?",
    a: "MgicAI is powered by Claude and analyzes your studio data in real time. It generates daily briefings, flags at-risk members, forecasts revenue, and answers questions about your business in natural language. Available on Growth and Scale plans.",
  },
  {
    q: "What makes the social features different from just having a WhatsApp group?",
    a: "Mgic's social layer is built into the booking experience. Members see what friends are booking, give kudos after classes, celebrate achievements, and discover new friends through shared sessions. It's contextual, not just chat.",
  },
  {
    q: "Do you integrate with ClassPass or Gympass?",
    a: "Yes. Our Scale plan includes full integration with ClassPass and Gympass — manage quotas, handle check-ins, export reconciliation data, and track which external bookings convert to members.",
  },
  {
    q: "Is there a contract or commitment?",
    a: "No contracts, ever. All plans are month-to-month. You can upgrade, downgrade, or cancel anytime. We believe the product should earn your business every month.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="text-sm sm:text-base font-semibold text-foreground pr-4">{q}</span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-muted"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-sm text-muted leading-relaxed pr-10">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MarketingFAQ() {
  return (
    <section id="faq" className="py-20 md:py-28 bg-surface/50">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <p className="text-sm font-semibold text-accent mb-3">FAQ</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Questions? Answers.
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="border-t border-border"
        >
          {faqs.map((faq) => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
