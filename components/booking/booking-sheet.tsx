"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Check,
  ChevronLeft,
  Ticket,
  Sparkles,
  CreditCard,
  LogIn,
  UserCheck,
  ArrowRight,
  Mail,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput, isValidPhoneNumber } from "@/components/ui/phone-input";
import { cn, formatTime } from "@/lib/utils";
import type { Package } from "@prisma/client";

function GuestLoginPrompt({ email, classId }: { email: string; classId: string }) {
  const t = useTranslations("bookingSheet");
  const [magicSent, setMagicSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleMagicLink() {
    setSending(true);
    await signIn("resend", { email, callbackUrl: "/my/bookings", redirect: false });
    setMagicSent(true);
    setSending(false);
  }

  if (magicSent) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
          <Mail className="h-5 w-5 text-accent" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">
          {t("checkYourEmail")}
        </p>
        <p className="mt-1 text-xs text-muted">
          {t("sentLinkTo")} <span className="font-medium text-foreground">{email}</span> {t("toAccessAccount")}
        </p>
      </motion.div>
    );
  }

  return (
    <>
      <p className="mt-5 text-sm text-muted">
        {t("accessAccountDesc")}
      </p>
      <Button
        onClick={() => signIn("google", { callbackUrl: "/my/bookings" })}
        className="mt-4 w-full gap-2 rounded-full bg-foreground text-background hover:bg-foreground/90"
        size="lg"
      >
        <LogIn className="h-4 w-4" />
        {t("continueWithGoogle")}
      </Button>
      <Button
        variant="outline"
        onClick={handleMagicLink}
        disabled={sending}
        className="mt-2 w-full gap-2 rounded-full"
        size="lg"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {t("sendLinkTo")} {email}
      </Button>
    </>
  );
}

// Logged-in: package → booking → done
// Guest: info → package → booking → done
type Step = "info" | "package" | "booking" | "done";

interface BookingSheetProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  spotNumber?: number | null;
  className: string;
  classTime: string;
  privacy: "PUBLIC" | "PRIVATE";
  onSuccess: (guestEmail?: string) => void;
  classTypeId?: string;
}

interface EmailCheckResult {
  exists: boolean;
  hasCredits: boolean;
  credits: number;
  name: string | null;
}

export function BookingSheet({
  open,
  onClose,
  classId,
  spotNumber,
  className,
  classTime,
  privacy,
  onSuccess,
  classTypeId,
}: BookingSheetProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const t = useTranslations("bookingSheet");
  const isLoggedIn = !!session?.user;

  const initialStep: Step = isLoggedIn ? "package" : "info";

  const [step, setStep] = useState<Step>(initialStep);
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bookingId: string;
    spotNumber: number;
    packageName: string;
  } | null>(null);

  const [emailCheck, setEmailCheck] = useState<EmailCheckResult | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const emailCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookingInFlight = useRef(false);

  const { data: allPackages = [] } = useQuery<Package[]>({
    queryKey: ["packages-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/packages");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const { data: myPackages = [] } = useQuery<{ id: string }[]>({
    queryKey: ["packages", "mine"],
    queryFn: async () => {
      const res = await fetch("/api/packages/mine");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && isLoggedIn,
  });

  const isReturningUser = isLoggedIn && myPackages.length > 0;
  const guestIsReturning = emailCheck?.exists && !emailCheck.hasCredits;
  const packages = allPackages.filter((p) => {
    if (p.isPromo && (isReturningUser || guestIsReturning)) return false;
    if (classTypeId && (p as any).classTypes?.length > 0) {
      return (p as any).classTypes.some((ct: { id: string }) => ct.id === classTypeId);
    }
    return true;
  });

  const checkEmail = useCallback(async (email: string) => {
    if (!email || !email.includes("@")) {
      setEmailCheck(null);
      return;
    }
    setCheckingEmail(true);
    try {
      const res = await fetch("/api/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setEmailCheck(data);
      if (data.name && !guestName) setGuestName(toTitleCase(data.name));
    } catch {
      setEmailCheck(null);
    } finally {
      setCheckingEmail(false);
    }
  }, [guestName]);

  function toTitleCase(str: string) {
    return str.replace(
      /\S+/g,
      (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    );
  }

  function handleNameChange(raw: string) {
    setGuestName(toTitleCase(raw));
  }

  function handleEmailChange(raw: string) {
    const email = raw.toLowerCase();
    setGuestEmail(email);
    setEmailCheck(null);
    if (emailCheckTimerRef.current) clearTimeout(emailCheckTimerRef.current);
    if (email.includes("@") && email.includes(".")) {
      emailCheckTimerRef.current = setTimeout(() => checkEmail(email), 600);
    }
  }

  useEffect(() => {
    if (step === "done" && !isLoggedIn) {
      const timer = setTimeout(() => onClose(), 1500);
      return () => clearTimeout(timer);
    }
  }, [step, isLoggedIn, onClose]);

  useEffect(() => {
    if (open) {
      setStep(isLoggedIn ? "package" : "info");
      setSelectedPkg(null);
      setGuestName("");
      setGuestEmail("");
      setGuestPhone("");
      setError(null);
      setResult(null);
      setLoading(false);
      setEmailCheck(null);
      bookingInFlight.current = false;
    }
  }, [open, isLoggedIn]);

  function handleInfoContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim() || !guestEmail.trim()) return;
    if (showPhoneField && guestPhone && !isValidPhoneNumber(guestPhone)) return;
    setStep("package");
  }

  const showPhoneField = !emailCheck?.exists;

  function handleSelectPackage(pkg: Package) {
    if (bookingInFlight.current) return;
    setSelectedPkg(pkg);
    setError(null);
    executeBooking(pkg);
  }

  async function executeBooking(pkg: Package) {
    if (bookingInFlight.current) return;
    bookingInFlight.current = true;
    setLoading(true);
    setError(null);
    setStep("booking");

    try {
      const payload: Record<string, unknown> = {
        classId,
        packageId: pkg.id,
        privacy,
        ...(spotNumber != null && { spotNumber }),
      };

      if (!isLoggedIn) {
        payload.email = guestEmail;
        payload.name = guestName;
        if (guestPhone) payload.phone = guestPhone;
      }

      const res = await fetch("/api/book-and-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("bookingError"));
        setStep("package");
        setLoading(false);
        return;
      }

      // Fire conversion tracking immediately, before state updates
      try {
        const conversionBody = JSON.stringify({
          entityType: "class-instance",
          entityId: classId,
          conversionType: "booking",
          revenue: pkg.price || 0,
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/marketing/track/conversion",
            new Blob([conversionBody], { type: "application/json" }),
          );
        } else {
          fetch("/api/marketing/track/conversion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: conversionBody,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // never block the booking flow
      }

      setResult({
        bookingId: data.bookingId,
        spotNumber: data.spotNumber,
        packageName: data.packageName,
      });
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["packages", "mine"] });
      onSuccess(isLoggedIn ? undefined : guestEmail);
    } catch {
      setError(t("connectionError"));
      setStep("package");
    } finally {
      setLoading(false);
      bookingInFlight.current = false;
    }
  }

  function formatPrice(pkg: Package) {
    return new Intl.NumberFormat("es", {
      style: "currency",
      currency: pkg.currency,
      minimumFractionDigits: 0,
    }).format(pkg.price);
  }

  const canGoBack =
    (step === "package" && !isLoggedIn);
  const canClose = step !== "booking";

  const recommendedPkgId = (() => {
    const sub = packages.find((p) => (p as any).type === "SUBSCRIPTION");
    if (sub) return sub.id;
    const bestValue = [...packages]
      .filter((p) => p.credits && p.credits > 1 && !p.isPromo)
      .sort((a, b) => (a.price / (a.credits ?? 1)) - (b.price / (b.credits ?? 1)))[0];
    return bestValue?.id ?? null;
  })();

  if (!open) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm"
        onClick={step !== "booking" ? onClose : undefined}
      />

      <motion.div
        initial={{ y: "-100%" }}
        animate={{ y: 0 }}
        exit={{ y: "-100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 top-0 z-50 max-h-[90dvh] overflow-y-auto rounded-b-3xl bg-white pt-safe shadow-warm-lg sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
      >
        {/* Header */}
        <div className="px-6 pb-2 pt-4">
          <div className="flex items-center justify-between">
            {canGoBack ? (
              <button
                onClick={() => setStep("info")}
                className="flex w-8 items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : canClose ? (
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <div className="w-8" />
            )}
            <p className="flex-1 text-center text-xs text-muted">
              {className} · {formatTime(classTime)}{spotNumber ? ` · ${t("spot")} #${spotNumber}` : ""}
            </p>
            <div className="w-8" />
          </div>
        </div>

        <div className="px-6 pb-8">
          <AnimatePresence mode="wait">
            {/* ── Step 1 (guest): Info ── */}
            {step === "info" && (
              <motion.div
                key="info"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="mb-1 font-display text-xl font-bold text-foreground">
                  {t("yourInfo")}
                </h2>
                <p className="mb-5 text-sm text-muted">
                  {t("enterInfoToBook")}
                </p>

                <form onSubmit={handleInfoContinue} className="space-y-3">
                  <div>
                    <label htmlFor="guest-email" className="mb-1.5 block text-xs font-medium text-muted">Email</label>
                    <Input
                      id="guest-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="tu@correo.com"
                      value={guestEmail}
                      onChange={(e) => handleEmailChange(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  {checkingEmail && (
                    <div className="flex items-center gap-2 py-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
                      <span className="text-xs text-muted">{t("verifying")}</span>
                    </div>
                  )}

                  {/* User has credits — suggest login */}
                  {emailCheck?.exists && emailCheck.hasCredits && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-green-200 bg-green-50 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <UserCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-green-800">
                            {emailCheck.credits === -1 ? t("hasUnlimitedCredits") : t("hasCredits", { count: emailCheck.credits })}
                          </p>
                          <p className="mt-0.5 text-xs text-green-700">
                            {t("loginToBook")}
                          </p>
                          <div className="mt-3 flex flex-col gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => signIn("google", { callbackUrl: `/class/${classId}` })}
                              className="w-full gap-1.5 rounded-full bg-green-700 text-white hover:bg-green-800"
                            >
                              <LogIn className="h-3.5 w-3.5" />
                              {t("loginWithGoogle")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => signIn("resend", { email: guestEmail, callbackUrl: `/class/${classId}`, redirect: false })}
                              className="w-full text-xs text-green-700 hover:text-green-800"
                            >
                              {t("sendEmailLink")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* User exists but no credits — autofill name, continue to buy */}
                  {emailCheck?.exists && !emailCheck.hasCredits && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl bg-accent/5 px-4 py-3"
                    >
                      <p className="text-xs text-muted">
                        {t("existingAccountNeedPackage")}
                      </p>
                    </motion.div>
                  )}

                  {/* Show name + phone + continue only when NOT showing "you have credits" */}
                  {!(emailCheck?.exists && emailCheck?.hasCredits) && (
                    <>
                      <div>
                        <label htmlFor="guest-name" className="mb-1.5 block text-xs font-medium text-muted">{t("name")}</label>
                        <Input
                          id="guest-name"
                          name="name"
                          autoComplete="name"
                          placeholder={t("yourName")}
                          value={guestName}
                          onChange={(e) => handleNameChange(e.target.value)}
                          required
                        />
                      </div>

                      {showPhoneField && (
                        <div>
                          <label htmlFor="guest-phone" className="mb-1.5 block text-xs font-medium text-muted">
                            {t("phone")}
                          </label>
                          <PhoneInput
                            value={guestPhone}
                            onChange={setGuestPhone}
                            defaultCountry="ES"
                            placeholder="612 345 678"
                          />
                          {guestPhone && !isValidPhoneNumber(guestPhone) && (
                            <p className="mt-1 text-[11px] text-destructive">
                              {t("invalidNumber")}
                            </p>
                          )}
                        </div>
                      )}

                      <Button
                        type="submit"
                        size="lg"
                        disabled={checkingEmail || !guestName.trim() || !guestEmail.trim() || (showPhoneField && (!guestPhone || !isValidPhoneNumber(guestPhone)))}
                        className="mt-4 w-full gap-2 rounded-full bg-foreground text-background hover:bg-foreground/90"
                      >
                        {t("choosePackage")}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </>
                  )}

                  {/* Login link for users who just want to log in */}
                  {!(emailCheck?.exists && emailCheck?.hasCredits) && (
                    <div className="mt-3 text-center">
                      <button
                        type="button"
                        onClick={() => signIn("google", { callbackUrl: `/class/${classId}` })}
                        className="inline-flex items-center gap-1.5 text-xs text-accent transition-colors hover:text-accent/80"
                      >
                        <LogIn className="h-3.5 w-3.5" />
                        {t("alreadyHaveAccount")}
                      </button>
                    </div>
                  )}
                </form>
              </motion.div>
            )}

            {/* ── Step 2: Package select ── */}
            {step === "package" && (
              <motion.div
                key="package"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="mb-1 font-display text-xl font-bold text-foreground">
                  {t("chooseYourPackage")}
                </h2>
                <p className="mb-5 text-sm text-muted">
                  {!isLoggedIn && guestEmail
                    ? t("forEmail", { email: guestEmail })
                    : t("selectPackageToBook")}
                </p>

                {error && (
                  <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="space-y-2.5">
                  {packages.map((pkg) => {
                    const isRecommended = !pkg.isPromo && pkg.id === recommendedPkgId;
                    return (
                      <button
                        key={pkg.id}
                        onClick={() => handleSelectPackage(pkg)}
                        disabled={loading}
                        className={cn(
                          "group relative w-full rounded-2xl border p-4 text-left transition-all",
                          isRecommended
                            ? "border-accent bg-accent/5 hover:border-accent hover:shadow-md"
                            : "border-border hover:border-foreground/20 hover:shadow-md",
                        )}
                      >
                        {isRecommended && (
                          <div className="absolute -top-2.5 right-3 flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold text-white">
                            <Sparkles className="h-3 w-3" />
                            {t("recommended")}
                          </div>
                        )}
                        {pkg.isPromo && (
                          <div className="absolute -top-2.5 right-3 flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold text-white">
                            <Sparkles className="h-3 w-3" />
                            {t("firstTime")}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-display text-base font-bold text-foreground">
                              {pkg.name}
                            </p>
                            {pkg.description && (
                              <p className="mt-0.5 text-xs text-muted line-clamp-1">
                                {pkg.description}
                              </p>
                            )}
                            <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                              <span className="flex items-center gap-1">
                                <Ticket className="h-3 w-3" />
                                {pkg.credits === null ? t("unlimited") : t("classesCount", { count: pkg.credits })}
                              </span>
                              <span>{t("validDays", { days: pkg.validDays })}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-display text-lg font-bold text-foreground">
                              {formatPrice(pkg)}
                            </p>
                            {pkg.credits && pkg.credits > 1 && (
                              <p className="text-[10px] text-muted">
                                {formatPrice({ ...pkg, price: pkg.price / pkg.credits } as Package)}/{t("perClass")}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {!isLoggedIn && (
                  <p className="mt-4 text-center text-[10px] text-muted/60">
                    {t("securePayment")}
                  </p>
                )}
              </motion.div>
            )}

            {/* ── Step 3: Booking in progress ── */}
            {step === "booking" && (
              <motion.div
                key="booking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
                <p className="mt-4 text-sm font-medium text-muted">
                  {t("bookingInProgress")}
                </p>
              </motion.div>
            )}

            {/* ── Step 4: Done ── */}
            {step === "done" && result && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center py-8 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.1, damping: 12 }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100"
                >
                  <Check className="h-8 w-8 text-green-600" />
                </motion.div>

                <h2 className="mt-5 font-display text-xl font-bold text-foreground">
                  {t("spotReserved")}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {result.spotNumber ? `${t("spot")} #${result.spotNumber} · ` : ""}{className}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {formatTime(classTime)}
                </p>

                <div className="mt-6 flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2">
                  <Ticket className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium text-accent">
                    {result.packageName}
                  </span>
                </div>

                {isLoggedIn && (
                  <Button
                    onClick={() => router.push("/my/bookings")}
                    className="mt-8 w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                    size="lg"
                  >
                    {t("viewMyBookings")}
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex justify-center pb-3 pt-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>
      </motion.div>
    </>
  );
}
