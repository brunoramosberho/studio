"use client";

import { motion } from "framer-motion";

const cards = [
  {
    type: "icon" as const,
    content: {
      icons: ["🏢", "🌙", "⚡"],
      title: "Your data, our promise",
      desc: "Your switching concerns are valid. That's why our team spends 4 weeks preparing for one perfect night. We move your business to Mgic overnight with zero downtime, zero disruption, zero stress.",
    },
  },
  {
    type: "image" as const,
    content: {
      title: "For studio owners, by studio owners",
      desc: "Last year we shipped 400+ product requests made by studio owners like you. We listen, think and act like your partner. Shipping new updates every week to help you win.",
    },
  },
  {
    type: "image" as const,
    content: {
      title: "Customer for life philosophy",
      desc: "Video call support from product experts whenever you and your team need it. 99.9% uptime and enterprise-grade security standards.",
    },
  },
  {
    type: "image" as const,
    content: {
      title: "AI frontdesk — MgicAI",
      desc: "Stop training staff who leave in six months. Let AI handle inquiries, member insights, and business intelligence automatically.",
    },
  },
  {
    type: "image" as const,
    content: {
      title: "Contract buyout",
      desc: "Don't stay stuck with outdated or overpriced software. We offer full contract buyouts for all fitness studios. Switch risk-free.",
    },
  },
];

function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div className="w-full h-full min-h-[180px] rounded-xl bg-gradient-to-br from-surface via-border/30 to-surface flex items-center justify-center">
      <div className="text-center px-4">
        <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
          <svg className="h-6 w-6 text-accent/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>
        <p className="text-[10px] text-muted-foreground/60">{label}</p>
      </div>
    </div>
  );
}

export function SwitchingCost() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center mb-6"
        >
          <div className="inline-flex items-center rounded-full border border-border bg-white px-4 py-1.5 text-sm font-medium text-muted mb-6">
            Premium Support
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground">
            Zero switching cost <em className="not-italic text-gradient">promise</em>
          </h2>
          <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
            Unlike other platforms, we&apos;re honest — <strong className="text-foreground">switching is hard</strong>.
            That&apos;s why we built our process to eliminate disruption, member confusion,
            and extra work for your team.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-5 mb-5">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl border border-border bg-white p-6 md:p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              {cards[0].content.icons!.map((icon, i) => (
                <div key={i} className={`h-10 w-10 rounded-full bg-surface flex items-center justify-center text-lg ${
                  i > 0 ? "-ml-2 ring-2 ring-white" : ""
                }`}>
                  {icon}
                </div>
              ))}
              <span className="ml-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">One Night</span>
            </div>
            <h3 className="text-lg font-bold text-foreground">{cards[0].content.title}</h3>
            <p className="mt-2 text-sm text-muted leading-relaxed">{cards[0].content.desc}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-2xl border border-border bg-white overflow-hidden"
          >
            <div className="h-48 overflow-hidden">
              <ImagePlaceholder label="Photo: studio owners smiling / team meeting" />
            </div>
            <div className="p-6">
              <h3 className="text-lg font-bold text-foreground">{cards[1].content.title}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">{cards[1].content.desc}</p>
            </div>
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {cards.slice(2).map((card, i) => (
            <motion.div
              key={card.content.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="rounded-2xl border border-border bg-white overflow-hidden"
            >
              <div className="h-44 overflow-hidden">
                <ImagePlaceholder label={
                  i === 0
                    ? "Photo: support team on video call"
                    : i === 1
                    ? "Photo: MgicAI mascot or AI illustration"
                    : "Photo: person signing document / handshake"
                } />
              </div>
              <div className="p-5">
                <h3 className="text-base font-bold text-foreground">{card.content.title}</h3>
                <p className="mt-1.5 text-sm text-muted leading-relaxed">{card.content.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-12 text-center"
        >
          <div className="inline-flex items-center gap-3 sm:gap-6 text-sm sm:text-base font-semibold text-foreground">
            <span>Free trial</span>
            <span className="h-1 w-1 rounded-full bg-accent" />
            <span>Contract buyout</span>
            <span className="h-1 w-1 rounded-full bg-accent" />
            <span>One-night migration</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
