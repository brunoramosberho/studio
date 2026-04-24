"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";

const brands = ["Peloton's", "SoulCycle's", "ClassPass'", "Mindbody's", "Barry's", "Equinox's"];

const tabContent: Record<string, { phone: React.ReactNode; floater: React.ReactNode }> = {
  social: {
    phone: (
      <div className="space-y-3">
        <div className="text-center pt-2 pb-1">
          <p className="text-base font-bold text-foreground">Community</p>
        </div>
        <div className="rounded-xl border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-accent/20 overflow-hidden">
              <div className="w-full h-full bg-gradient-to-br from-accent/30 to-accent/10" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-foreground">Sarah M.</p>
              <p className="text-[9px] text-muted-foreground">Just finished · Power HIIT</p>
            </div>
          </div>
          <div className="rounded-lg bg-surface p-2 flex items-center gap-3 text-[10px]">
            <div className="text-center">
              <p className="font-bold text-foreground">45m</p>
              <p className="text-muted-foreground">Duration</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="text-center">
              <p className="font-bold text-foreground">156</p>
              <p className="text-muted-foreground">Avg HR</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="text-center">
              <p className="font-bold text-foreground">420</p>
              <p className="text-muted-foreground">Calories</p>
            </div>
          </div>
          <p className="text-[10px] text-foreground">Best session this week 💪</p>
          <div className="flex gap-3 text-[9px] text-muted">
            <span>🔥 12 kudos</span>
            <span>💬 3 comments</span>
          </div>
        </div>
        <div className="rounded-xl border border-violet/20 bg-violet/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-full bg-violet/20 overflow-hidden">
              <div className="w-full h-full bg-gradient-to-br from-violet/30 to-violet/10" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-foreground">
                Jake R. <span className="font-normal text-muted">earned a badge</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-white border border-violet/20 p-2">
            <div className="h-9 w-9 rounded-full bg-violet flex items-center justify-center text-white text-sm">★</div>
            <div>
              <p className="text-[10px] font-bold text-violet">Century Club</p>
              <p className="text-[8px] text-muted-foreground">100 classes completed!</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-3">
          <p className="text-[10px] text-foreground">
            <strong>Emma W.</strong> just booked <strong>Yoga Flow</strong> — Tomorrow 8 AM
          </p>
          <p className="text-[9px] text-muted-foreground mt-0.5">2 friends are going</p>
          <button className="mt-2 rounded-full bg-accent/10 px-3 py-1 text-[9px] font-semibold text-accent">
            Join this class →
          </button>
        </div>
      </div>
    ),
    floater: (
      <div className="rounded-xl bg-white border border-border shadow-lg p-3 w-48">
        <p className="text-[10px] font-semibold text-foreground mb-2">Friends this week</p>
        <div className="space-y-2">
          {[
            { name: "Emma W.", classes: 5, streak: "🔥 12" },
            { name: "Jake R.", classes: 4, streak: "🔥 8" },
            { name: "Mia T.", classes: 3, streak: "🔥 15" },
          ].map((f) => (
            <div key={f.name} className="flex items-center justify-between text-[9px]">
              <span className="font-medium text-foreground">{f.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{f.classes} classes</span>
                <span>{f.streak}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  achievements: {
    phone: (
      <div className="space-y-3">
        <div className="text-center pt-2 pb-1">
          <p className="text-base font-bold text-foreground">Achievements</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-violet/10 to-accent/5 border border-violet/20 p-4 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-violet flex items-center justify-center text-white text-2xl mb-2">★</div>
          <p className="text-sm font-bold text-violet">Level 3 — Committed</p>
          <p className="text-[10px] text-muted-foreground mt-1">4 more classes to Level 4</p>
          <div className="mt-3 h-2 rounded-full bg-violet/10 overflow-hidden">
            <div className="h-full w-3/4 rounded-full bg-violet" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: "🔥", name: "Fire Starter", desc: "10 classes", unlocked: true },
            { icon: "⚡", name: "Warrior", desc: "25 classes", unlocked: true },
            { icon: "💎", name: "Century", desc: "100 classes", unlocked: false },
            { icon: "🌅", name: "Early Bird", desc: "20 AM classes", unlocked: true },
            { icon: "🎯", name: "Consistent", desc: "4 wk streak", unlocked: true },
            { icon: "👥", name: "Social", desc: "10 friends", unlocked: false },
          ].map((b) => (
            <div
              key={b.name}
              className={`rounded-xl p-2 text-center ${
                b.unlocked ? "bg-white border border-border" : "bg-surface/50 opacity-40"
              }`}
            >
              <span className="text-lg">{b.icon}</span>
              <p className="text-[8px] font-semibold text-foreground mt-1">{b.name}</p>
              <p className="text-[7px] text-muted-foreground">{b.desc}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
          <p className="text-[10px] font-semibold text-accent mb-1">🎁 Reward Unlocked!</p>
          <p className="text-[9px] text-foreground">Free class pass for reaching Level 3</p>
        </div>
      </div>
    ),
    floater: (
      <div className="rounded-xl bg-white border border-violet/20 shadow-lg p-3 w-44">
        <p className="text-[10px] font-semibold text-violet mb-1">🎉 New Badge!</p>
        <p className="text-[9px] text-foreground">You just unlocked <strong>Early Bird</strong></p>
        <p className="text-[8px] text-muted-foreground mt-1">Completed 20 morning classes</p>
      </div>
    ),
  },
  booking: {
    phone: (
      <div className="space-y-3">
        <div className="text-center pt-2 pb-1">
          <p className="text-base font-bold text-foreground">Power HIIT</p>
          <p className="text-[10px] text-muted-foreground">Tomorrow, 7:00 AM · Coach Maria</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-[10px] font-semibold text-foreground mb-2 text-center">Pick your spot</p>
          <div className="text-center mb-2">
            <div className="inline-block rounded-md bg-foreground px-6 py-0.5 text-[8px] text-white font-medium">COACH</div>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: 20 }).map((_, i) => {
              const taken = [2, 5, 7, 11, 14, 16].includes(i);
              const selected = i === 8;
              return (
                <div
                  key={i}
                  className={`h-7 rounded-md flex items-center justify-center text-[8px] font-medium ${
                    selected
                      ? "bg-accent text-white"
                      : taken
                      ? "bg-foreground/10 text-muted-foreground"
                      : "bg-surface border border-border text-foreground hover:border-accent"
                  }`}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>
          <div className="flex justify-center gap-4 mt-2 text-[8px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded bg-surface border border-border" /> Available
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded bg-accent" /> Selected
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded bg-foreground/10" /> Taken
            </span>
          </div>
        </div>
        <div className="rounded-xl bg-surface p-3 space-y-1.5">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Spots left</span>
            <span className="font-semibold text-foreground">6 / 20</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Using</span>
            <span className="font-semibold text-foreground">1 credit</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Friends going</span>
            <span className="font-semibold text-foreground">Emma, Jake</span>
          </div>
        </div>
        <button className="w-full rounded-xl bg-accent text-white text-xs font-semibold py-3">
          Confirm Booking — Spot #9
        </button>
      </div>
    ),
    floater: (
      <div className="rounded-xl bg-white border border-border shadow-lg p-3 w-44">
        <p className="text-[10px] font-semibold text-foreground">🎵 Song Request</p>
        <p className="text-[9px] text-muted-foreground mt-1">Request a song for class</p>
        <div className="mt-2 rounded-md bg-surface border border-border px-2 py-1.5 text-[9px] text-muted-foreground">
          Search songs...
        </div>
      </div>
    ),
  },
  referrals: {
    phone: (
      <div className="space-y-3">
        <div className="text-center pt-2 pb-1">
          <p className="text-base font-bold text-foreground">Refer & Earn</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 p-4 text-center">
          <p className="text-[10px] text-muted-foreground mb-1">Your referral code</p>
          <p className="text-xl font-extrabold text-accent tracking-wider">SARAH2024</p>
          <button className="mt-2 rounded-full bg-accent px-4 py-1.5 text-[10px] font-semibold text-white">
            Share Link →
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: "8", l: "Referred" },
            { v: "5", l: "Converted" },
            { v: "3", l: "Rewards" },
          ].map((s) => (
            <div key={s.l} className="rounded-xl bg-surface p-2 text-center">
              <p className="text-lg font-bold text-foreground">{s.v}</p>
              <p className="text-[8px] text-muted-foreground">{s.l}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-foreground">Your referrals</p>
          {[
            { name: "Maria L.", status: "Booked first class", stage: "🟢" },
            { name: "Tom K.", status: "Installed app", stage: "🟡" },
            { name: "Anna S.", status: "Reward pending", stage: "🎁" },
          ].map((r) => (
            <div key={r.name} className="flex items-center justify-between rounded-lg bg-surface p-2 text-[10px]">
              <span className="font-medium text-foreground">{r.name}</span>
              <span className="text-muted-foreground">{r.stage} {r.status}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    floater: (
      <div className="rounded-xl bg-white border border-accent/20 shadow-lg p-3 w-44">
        <p className="text-[10px] font-semibold text-accent">🎁 Reward Ready!</p>
        <p className="text-[9px] text-foreground mt-1">Anna signed up! You earned a free class.</p>
      </div>
    ),
  },
};

export function MemberApp() {
  const t = useTranslations("marketing");
  const tabLabels = t.raw("memberApp.tabs") as Record<string, string>;
  const tabOrder = ["social", "achievements", "booking", "referrals"] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabOrder)[number]>(tabOrder[0]);
  const [brandIndex, setBrandIndex] = useState(0);
  const active = tabContent[activeTab];

  useEffect(() => {
    const interval = setInterval(() => {
      setBrandIndex((prev) => (prev + 1) % brands.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="member-app" className="py-20 md:py-28 bg-surface/50 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center mb-6"
        >
          <div className="inline-flex items-center rounded-full border border-border bg-white px-4 py-1.5 text-sm font-medium text-muted mb-6">
            {t("memberApp.badge")}
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15]">
            {t("memberApp.titleStart")}
            <span className="block sm:inline">
              {t("memberApp.titleBetterThan")}
              <span className="inline-block relative overflow-hidden align-bottom py-1" style={{ height: "1.2em" }}>
                <AnimatePresence mode="wait">
                  <motion.em
                    key={brands[brandIndex]}
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    exit={{ y: "-100%", opacity: 0 }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    className="not-italic text-gradient block"
                  >
                    {brands[brandIndex]}
                  </motion.em>
                </AnimatePresence>
              </span>
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted max-w-xl mx-auto">
            {t("memberApp.subtitle")}
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-2 sm:gap-6 mb-10">
          {tabOrder.map((id) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`text-sm sm:text-base font-medium transition-all pb-2 border-b-2 ${
                activeTab === id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tabLabels[id]}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35 }}
          >
            <div className="relative rounded-3xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-surface via-accent/5 to-surface" />

              <div className="relative flex items-center justify-center py-12 md:py-16 px-4">
                <div className="relative w-[280px] shrink-0">
                  <div className="rounded-[2.5rem] border-[6px] border-foreground/90 bg-white shadow-2xl overflow-hidden">
                    <div className="mx-auto mt-2 h-5 w-28 rounded-full bg-foreground/90" />
                    <div className="px-4 pt-3 pb-6">
                      {active.phone}
                    </div>
                  </div>
                  <div className="absolute -inset-6 -z-10 rounded-[3.5rem] bg-accent/8 blur-3xl" />

                  <motion.div
                    initial={{ opacity: 0, x: 30, y: 10 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="absolute -right-4 sm:-right-24 bottom-12 sm:bottom-20 z-10"
                  >
                    {active.floater}
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mt-8"
        >
          <p className="text-sm font-semibold text-foreground mb-2">
            {t("memberApp.tryCta")}
          </p>
          <p className="text-xs text-muted">
            {t("memberApp.pwaNote")}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
