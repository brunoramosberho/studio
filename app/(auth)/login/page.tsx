"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SessionProvider, signIn, useSession } from "next-auth/react";
import {
  Mail,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Asterisk,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageTransition } from "@/components/shared/page-transition";
import { useBranding } from "@/components/branding-provider";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

const COOKIE_CLIENT = "authjs.session-token";
const COOKIE_ADMIN = "authjs.session-token.admin";

function useIsAdminSubdomain() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const rootDomain =
      process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(":")[0] || "localhost";
    const hostname = window.location.hostname;
    setIsAdmin(hostname === `admin.${rootDomain}`);
  }, []);
  return isAdmin;
}

/* ── Super-admin login (admin.mgic.app subdomain) ── */

function SuperAdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const t = useTranslations("auth");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("loginError"));
        return;
      }

      router.replace(callbackUrl);
    } catch {
      setError(t("connectionError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-foreground" />
          <h1 className="mt-6 font-display text-2xl font-bold text-foreground">
            {t("adminPanel")}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {t("superAdminCredentials")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            type="password"
            placeholder={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Button
            type="submit"
            variant="secondary"
            size="lg"
            className="w-full justify-center"
            disabled={loading || !email.trim() || !password}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Lock className="mr-2 h-4 w-4" />
            )}
            {t("login")}
          </Button>
        </form>
      </div>
    </div>
  );
}

/* ── Tenant login / registration ── */

type LoginStep = "email" | "register" | "magic-link-sent";

function LoginForm({ isAdminPortal = false }: { isAdminPortal?: boolean }) {
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const { studioName, logoUrl } = useBranding();
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();

  const defaultCallback = isAdminPortal ? "/admin" : "/my";
  const callbackUrl = searchParams.get("callbackUrl") || defaultCallback;
  const sessionCookie = isAdminPortal ? COOKIE_ADMIN : COOKIE_CLIENT;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (session?.user && !authenticated) {
      setAuthenticated(true);
      router.replace(callbackUrl);
    }
  }, [session, callbackUrl, router, authenticated]);

  useEffect(() => {
    if (step !== "magic-link-sent" || !pendingTokenRef.current) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const token = pendingTokenRef.current;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/pending-login?token=${token}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.approved && data.sessionToken) {
          if (pollRef.current) clearInterval(pollRef.current);
          document.cookie = `${sessionCookie}=${data.sessionToken}; path=/; max-age=${30 * 24 * 60 * 60}; samesite=lax`;
          setAuthenticated(true);
          setTimeout(() => router.replace(callbackUrl), 500);
        }
      } catch {}
    }, 2500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [step, callbackUrl, router, sessionCookie]);

  async function handleGoogleSignIn() {
    await signIn("google", { callbackUrl });
  }

  async function sendMagicLink() {
    const pendingRes = await fetch("/api/auth/pending-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    if (pendingRes.ok) {
      const { token } = await pendingRes.json();
      pendingTokenRef.current = token;
    }

    await signIn("resend", {
      email: email.trim(),
      callbackUrl,
      redirect: false,
    });
    setStep("magic-link-sent");
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (data.exists) {
        if (data.name) setName(data.name);
        await sendMagicLink();
      } else {
        setStep("register");
      }
    } catch {
      await sendMagicLink();
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          phone: phone.trim(),
        }),
      });
      await sendMagicLink();
    } finally {
      setLoading(false);
    }
  }

  const heading = isAdminPortal ? t("adminAccess") : t("welcomeTo", { studioName });
  const subheading = isAdminPortal
    ? t("adminLoginSubheading")
    : t("loginOrRegister");

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="mb-10 text-center">
            <Link href="/">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={studioName}
                  className="mx-auto h-12 object-contain"
                />
              ) : (
                <span className="font-display text-4xl font-bold text-foreground">
                  {studioName}
                </span>
              )}
            </Link>
            {isAdminPortal && (
              <span className="mt-3 inline-block rounded-md bg-admin/10 px-2.5 py-1 text-xs font-semibold text-admin">
                Admin Portal
              </span>
            )}
            {step === "email" && (
              <>
                <h1 className="mt-6 font-display text-2xl font-bold text-foreground">
                  {heading}
                </h1>
                <p className="mt-2 text-sm text-muted">{subheading}</p>
              </>
            )}
            {step === "register" && (
              <>
                <h1 className="mt-6 font-display text-2xl font-bold text-foreground">
                  {t("createYourAccount")}
                </h1>
                <p className="mt-2 text-sm text-muted">
                  {t("completeYourDetails")}
                </p>
              </>
            )}
          </div>

          {/* Step: email entry */}
          {step === "email" && (
            <div className="space-y-4">
              <Button
                variant="surface"
                size="lg"
                className="w-full justify-center gap-3 border border-border"
                onClick={handleGoogleSignIn}
              >
                <GoogleIcon className="h-5 w-5" />
                {t("continueWithGoogle")}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-4 text-muted">{tc("or")}</span>
                </div>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <Input
                  type="email"
                  inputMode="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="lg"
                  className="w-full justify-center"
                  disabled={loading || !email.trim()}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  {t("continueWithEmail")}
                  {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </form>
            </div>
          )}

          {/* Step: registration (new user) */}
          {step === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="rounded-lg border border-border bg-surface/50 px-3 py-2.5 text-sm text-muted">
                {email}
              </div>
              <Input
                type="text"
                placeholder={t("yourName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                autoFocus
              />
              <Input
                type="tel"
                inputMode="tel"
                placeholder={t("phonePlaceholder")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
              />
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                className="w-full justify-center"
                disabled={loading || !name.trim() || !phone.trim()}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                {t("createAccount")}
              </Button>
              <button
                type="button"
                onClick={() => setStep("email")}
                className="flex w-full items-center justify-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" />
                {t("useOtherEmail")}
              </button>
            </form>
          )}

          {/* Step: magic link sent */}
          {step === "magic-link-sent" && (
            <div className="rounded-2xl bg-accent/5 p-6 text-center">
              {authenticated ? (
                <>
                  <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
                  <h3 className="mt-4 font-display text-lg font-bold text-foreground">
                    {t("sessionStarted")}
                  </h3>
                  <p className="mt-2 text-sm text-muted">{t("redirecting")}</p>
                </>
              ) : (
                <>
                  <Mail className="mx-auto h-10 w-10 text-accent" />
                  <h3 className="mt-4 font-display text-lg font-bold text-foreground">
                    {t("checkYourEmail")}
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    {t("magicLinkSent", { email })}
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted/60">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("waitingApproval")}
                  </div>
                  <button
                    onClick={() => {
                      setStep("email");
                      pendingTokenRef.current = null;
                    }}
                    className="mt-4 text-xs text-accent hover:text-accent/80"
                  >
                    {t("useOtherEmail")}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Terms (hidden on magic-link-sent) */}
          {step !== "magic-link-sent" && (
            <p className="mt-8 text-center text-[11px] leading-relaxed text-muted/60">
              {t.rich("termsNotice", {
                terms: (chunks) => (
                  <a href="/terms" className="underline underline-offset-2 hover:text-muted">{t("termsOfService")}</a>
                ),
                privacy: (chunks) => (
                  <a href="/privacy" className="underline underline-offset-2 hover:text-muted">{t("privacyPolicy")}</a>
                ),
              })}
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-1 pb-6 text-[10px] text-muted/40">
        {tc("developedBy")}
        <a
          href="https://mgic.app"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-muted/50 transition-colors hover:text-muted"
        >
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] bg-current">
            <Asterisk className="h-2.5 w-2.5 text-white" strokeWidth={3} />
          </span>
          Magic Studio
        </a>
      </div>
    </div>
  );
}

function LoginRouter() {
  const isSuperAdminSubdomain = useIsAdminSubdomain();
  const searchParams = useSearchParams();
  const isAdminPortal = searchParams.get("portal") === "admin";

  if (isSuperAdminSubdomain) return <SuperAdminLoginForm />;

  if (isAdminPortal) {
    return (
      <SessionProvider basePath="/api/auth-admin">
        <LoginForm isAdminPortal />
      </SessionProvider>
    );
  }

  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <PageTransition>
      <Suspense>
        <LoginRouter />
      </Suspense>
    </PageTransition>
  );
}
