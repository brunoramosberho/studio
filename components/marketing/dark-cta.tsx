"use client";

import { motion } from "framer-motion";

export function DarkCTA() {
  return (
    <section id="cta" className="py-20 md:py-28 bg-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground to-accent/20 pointer-events-none" />

      <div className="relative mx-auto max-w-4xl px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white">
            Ready to run your studio <em className="not-italic text-gradient">like magic?</em>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/60">
            Join 200+ boutique studios that switched to Mgic and never looked
            back. Start your free trial today — no credit card, no commitment.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="mailto:hello@mgic.app?subject=I%20want%20to%20try%20Mgic"
              className="btn-gradient inline-flex h-12 items-center rounded-full px-8 text-base font-semibold shadow-lg shadow-accent/25"
            >
              Start Free Trial
            </a>
            <a
              href="mailto:hello@mgic.app?subject=Book%20a%20Mgic%20demo"
              className="inline-flex h-12 items-center rounded-full border border-white/20 px-8 text-base font-semibold text-white transition-all hover:bg-white/10 hover:-translate-y-0.5"
            >
              Book a Demo
            </a>
          </div>

          <p className="mt-6 text-sm text-white/40">
            14-day free trial · No credit card required · Cancel anytime
          </p>
        </motion.div>
      </div>
    </section>
  );
}
