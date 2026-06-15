"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateOfBirthPicker } from "@/components/shared/date-of-birth-picker";
import { capitalizeName, splitName } from "@/lib/utils";

type ProfileResponse = {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  birthday: string | null;
  profileComplete: boolean;
};

/**
 * Blocking gate that captures the fields we need for a complete member profile
 * (first name, last name, date of birth) the first time a signed-in client
 * lands on the member portal without them. This is the catch-all for users who
 * signed up via Google straight from /install — they arrive with only an email
 * (and maybe a full name) and never went through the email registration step.
 *
 * Mounted inside the authenticated `/my` layout, so it only renders for a
 * logged-in client.
 */
export function CompleteProfileGate() {
  const { data: session, update } = useSession();
  const queryClient = useQueryClient();
  const t = useTranslations("completeProfile");

  const [show, setShow] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthday, setBirthday] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;

    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ProfileResponse | null) => {
        if (cancelled || !data || data.profileComplete) return;
        // Pre-fill from whatever we already have (e.g. Google full name).
        const fallback = splitName(data.name);
        setFirstName(data.firstName || fallback.firstName || "");
        setLastName(data.lastName || fallback.lastName || "");
        setBirthday(data.birthday ?? null);
        setShow(true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !birthday) return;
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthday,
        }),
      });
      if (!res.ok) throw new Error("save failed");

      // Reflect the new name in the session + any cached profile query.
      await update?.({ name: `${firstName.trim()} ${lastName.trim()}` });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setShow(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 backdrop-blur-sm sm:items-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-[var(--shadow-warm-lg)] safe-bottom sm:rounded-3xl"
          >
            <div className="mb-5 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                <PartyPopper className="h-6 w-6" />
              </div>
              <h2 className="font-display text-xl font-bold text-foreground">
                {t("title")}
              </h2>
              <p className="mt-1.5 text-sm text-muted">{t("subtitle")}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted">
                    {t("firstName")}
                  </label>
                  <Input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(capitalizeName(e.target.value))}
                    required
                    autoComplete="given-name"
                    autoCapitalize="words"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted">
                    {t("lastName")}
                  </label>
                  <Input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(capitalizeName(e.target.value))}
                    required
                    autoComplete="family-name"
                    autoCapitalize="words"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted">
                  {t("dateOfBirth")}
                </label>
                <DateOfBirthPicker value={birthday} onChange={setBirthday} />
              </div>

              {error && (
                <p className="rounded-xl bg-red-50 px-4 py-2.5 text-center text-sm text-red-600">
                  {t("error")}
                </p>
              )}

              <Button
                type="submit"
                variant="secondary"
                size="lg"
                className="w-full justify-center"
                disabled={
                  saving || !firstName.trim() || !lastName.trim() || !birthday
                }
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("save")}
              </Button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
