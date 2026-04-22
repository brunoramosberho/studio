"use client";

import { motion } from "framer-motion";

export function SocialCommunity() {
  return (
    <section id="community" className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-2xl text-center mb-14"
        >
          <p className="text-sm font-semibold text-accent mb-3">Social & Community</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            Strava meets your studio — <em className="not-italic text-gradient">built in</em>
          </h2>
          <p className="mt-4 text-lg text-muted">
            The social layer that turns solo workouts into shared experiences.
            Friends, kudos, achievements, and a feed that keeps members coming
            back.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-2 rounded-2xl border border-border bg-white shadow-lg overflow-hidden"
          >
            <div className="border-b border-border px-5 py-3 bg-surface/50">
              <p className="text-sm font-semibold text-foreground">Community Feed</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-9 w-9 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-sm">S</div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Sarah M.</p>
                    <p className="text-[10px] text-muted-foreground">2 hours ago · Power HIIT with Coach Maria</p>
                  </div>
                </div>
                <div className="rounded-lg bg-surface p-3 mb-3">
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground">Duration</span>
                      <p className="font-bold text-foreground">45 min</p>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div>
                      <span className="text-muted-foreground">Avg HR</span>
                      <p className="font-bold text-foreground">156 bpm</p>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div>
                      <span className="text-muted-foreground">Calories</span>
                      <p className="font-bold text-foreground">420</p>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div>
                      <span className="text-muted-foreground">Class #</span>
                      <p className="font-bold text-foreground">48</p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-foreground mb-3">
                  Best session this week! That last round hit different 💪
                </p>
                <div className="flex items-center gap-4 text-xs text-muted">
                  <button className="flex items-center gap-1 hover:text-accent transition-colors">
                    <span>🔥</span> <span className="font-medium">12 kudos</span>
                  </button>
                  <button className="flex items-center gap-1 hover:text-accent transition-colors">
                    <span>💬</span> <span className="font-medium">3 comments</span>
                  </button>
                  <button className="flex items-center gap-1 hover:text-accent transition-colors">
                    <span>↗</span> <span className="font-medium">Share</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-violet/20 bg-violet/5 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-9 w-9 rounded-full bg-violet/10 flex items-center justify-center text-violet font-bold text-sm">J</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      Jake R. <span className="font-normal text-muted">unlocked an achievement</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">5 hours ago</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-lg bg-white border border-violet/20 p-3">
                  <div className="h-12 w-12 rounded-full bg-violet flex items-center justify-center text-white text-xl">★</div>
                  <div>
                    <p className="text-sm font-bold text-violet">Century Club</p>
                    <p className="text-xs text-muted-foreground">Completed 100 classes — incredible dedication!</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                  <button className="flex items-center gap-1 hover:text-violet transition-colors">
                    <span>🎉</span> <span className="font-medium">24 kudos</span>
                  </button>
                  <button className="flex items-center gap-1 hover:text-violet transition-colors">
                    <span>💬</span> <span className="font-medium">8 comments</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm">E</div>
                  <div>
                    <p className="text-sm text-foreground">
                      <strong>Emma W.</strong> booked <strong>Yoga Flow</strong> — Tomorrow, 8:00 AM
                    </p>
                    <p className="text-[10px] text-muted-foreground">3 of your friends are going</p>
                  </div>
                </div>
                <div className="mt-3">
                  <button className="rounded-full bg-accent/10 px-4 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors">
                    Book this class too →
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="space-y-4"
          >
            {[
              { icon: "👥", title: "Friend Discovery", desc: "Suggest friends based on shared classes. Members who train together, stay together." },
              { icon: "🔥", title: "Kudos & Reactions", desc: "Celebrate wins with fire reactions, comments, and shout-outs — just like Strava." },
              { icon: "🏆", title: "Gamification Engine", desc: "Tiers, badges, and auto-rewards that drive real retention. Configure levels, triggers, and prizes." },
              { icon: "⌚", title: "Wearable Connect", desc: "Apple Watch & Strava integration — share real workout data directly in the feed." },
              { icon: "🎁", title: "Referral Program", desc: "Personal codes, tracking dashboard, reward queue — turn your best members into ambassadors." },
              { icon: "📢", title: "Notify Me", desc: "Members get instant alerts when a spot opens in a full class — no more manual checking." },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="rounded-xl border border-border bg-white p-4 hover:shadow-md transition-shadow"
              >
                <span className="text-xl">{f.icon}</span>
                <p className="mt-2 text-sm font-semibold text-foreground">{f.title}</p>
                <p className="mt-1 text-xs text-muted leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
