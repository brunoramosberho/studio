"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Mail, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
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

function LoginForm() {
  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const { studioName, logoUrl } = useBranding();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();
  const callbackUrl = searchParams.get("callbackUrl") || "/my";
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (session?.user && !authenticated) {
      setAuthenticated(true);
      router.replace(callbackUrl);
    }
  }, [session, callbackUrl, router, authenticated]);

  useEffect(() => {
    if (!magicLinkSent) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      const updated = await updateSession();
      if (updated?.user) {
        setAuthenticated(true);
        if (pollRef.current) clearInterval(pollRef.current);
        router.replace(callbackUrl);
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [magicLinkSent, updateSession, callbackUrl, router]);

  async function handleGoogleSignIn() {
    await signIn("google", { callbackUrl });
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      await signIn("resend", {
        email,
        callbackUrl,
        redirect: false,
      });
      setMagicLinkSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <Link href="/">
            {logoUrl ? (
              <img src={logoUrl} alt={studioName} className="mx-auto h-12 object-contain" />
            ) : (
              <span className="font-display text-4xl font-bold text-foreground">
                {studioName}
              </span>
            )}
          </Link>
          <h1 className="mt-6 font-display text-2xl font-bold text-foreground">
            Bienvenida a {studioName}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Inicia sesión para reservar tus clases
          </p>
        </div>

        <div className="space-y-4">
          <Button
            variant="surface"
            size="lg"
            className="w-full justify-center gap-3 border border-border"
            onClick={handleGoogleSignIn}
          >
            <GoogleIcon className="h-5 w-5" />
            Continuar con Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-4 text-muted">o</span>
            </div>
          </div>

          {magicLinkSent ? (
            <div className="rounded-2xl bg-accent/5 p-6 text-center">
              {authenticated ? (
                <>
                  <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
                  <h3 className="mt-4 font-display text-lg font-bold text-foreground">
                    ¡Sesión iniciada!
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    Redirigiendo...
                  </p>
                </>
              ) : (
                <>
                  <Mail className="mx-auto h-10 w-10 text-accent" />
                  <h3 className="mt-4 font-display text-lg font-bold text-foreground">
                    Revisa tu correo
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    Te enviamos un enlace mágico a{" "}
                    <span className="font-medium text-foreground">{email}</span>.
                    Haz clic en el enlace para iniciar sesión.
                  </p>
                  <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted/60">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Esperando verificación...
                  </div>
                  <button
                    onClick={() => setMagicLinkSent(false)}
                    className="mt-4 text-xs text-accent hover:text-accent/80"
                  >
                    Usar otro correo
                  </button>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div>
                <Input
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
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
                Enviar enlace mágico
                {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-muted/60">
          Al continuar, aceptas nuestros{" "}
          <a href="#" className="underline underline-offset-2 hover:text-muted">
            términos de servicio
          </a>{" "}
          y{" "}
          <a href="#" className="underline underline-offset-2 hover:text-muted">
            política de privacidad
          </a>
          .
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <PageTransition>
      <Suspense>
        <LoginForm />
      </Suspense>
    </PageTransition>
  );
}
