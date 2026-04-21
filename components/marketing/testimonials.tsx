"use client";

import { motion } from "framer-motion";

const testimonials = [
  {
    quote:
      "We replaced Mindbody, Mailchimp, and three other tools the day we switched to Mgic. Our admin hours dropped by 60%.",
    name: "Maria S.",
    role: "Owner, HIIT Republic",
    avatar: "MS",
  },
  {
    quote:
      "The social feed changed everything. Members are tagging each other, celebrating streaks — our retention is up 35% since launch.",
    name: "Alex K.",
    role: "Founder, FlowState Yoga",
    avatar: "AK",
  },
  {
    quote:
      "MgicAI told me three members were about to churn before I even noticed. I reached out, and all three renewed. That alone pays for the platform.",
    name: "Carlos R.",
    role: "Director, CrossFit Elevate",
    avatar: "CR",
  },
  {
    quote:
      "My coaches love their dashboards. They can see their earnings, their top students, their ratings — all in one place. Morale is through the roof.",
    name: "Emma T.",
    role: "Co-Founder, Barre & Beyond",
    avatar: "ET",
  },
  {
    quote:
      "The gamification system is our secret weapon. Members are competing for badges, climbing tiers — it turned fitness into a game they don't want to stop playing.",
    name: "David L.",
    role: "Owner, Ride Collective",
    avatar: "DL",
  },
  {
    quote:
      "Setup took 20 minutes. Not days, not weeks — 20 minutes. And the team at Mgic was there the whole way. Best onboarding experience I've had.",
    name: "Sophia W.",
    role: "Manager, Zen Studio",
    avatar: "SW",
  },
];

export function Testimonials() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-2xl text-center mb-14"
        >
          <p className="text-sm font-semibold text-accent mb-3">Loved by Studios</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            Don&apos;t take our word for it
          </h2>
          <p className="mt-4 text-lg text-muted">
            Hear from studio owners who made the switch.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="rounded-2xl border border-border bg-white p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_, si) => (
                  <svg
                    key={si}
                    className="h-4 w-4 text-amber-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              <p className="text-sm text-foreground leading-relaxed mb-6">
                &ldquo;{t.quote}&rdquo;
              </p>

              <div className="flex items-center gap-3 mt-auto">
                <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-sm">
                  {t.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
