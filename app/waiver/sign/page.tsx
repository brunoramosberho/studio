"use client";

import { Suspense, useState, useRef, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useBranding } from "@/components/branding-provider";
import { useTenant } from "@/components/tenant-provider";
import { SignatureCanvas } from "@/components/waiver/signature-canvas";
import { Check, ChevronRight, Loader2, X } from "lucide-react";
import { FileCheckIcon, type FileCheckIconHandle } from "lucide-animated";
import Image from "next/image";

type Step = "intro" | "read" | "sign" | "done";

interface WaiverData {
  id: string;
  version: number;
  title: string;
  content: string;
  requirePhone: boolean;
  requireBirthDate: boolean;
  requireScrollRead: boolean;
}

export default function WaiverSignPage() {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center bg-stone-50"><Loader2 size={24} className="animate-spin text-muted/80" /></div>}>
      <WaiverSignContent />
    </Suspense>
  );
}

function WaiverSignContent() {
  const { data: session } = useSession();
  const brandingCtx = useBranding();
  const { tenantId } = useTenant();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [step, setStep] = useState<Step>("intro");
  const [waiver, setWaiver] = useState<WaiverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);

  // Branding overrides (from token verify response when no session)
  const [tokenBranding, setTokenBranding] = useState<{ studioName: string; logoUrl: string | null } | null>(null);
  const studioName = tokenBranding?.studioName || brandingCtx.studioName;
  const logoUrl = tokenBranding?.logoUrl || brandingCtx.logoUrl;

  // Read step
  const [hasScrolled, setHasScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sign step
  const [name, setName] = useState(session?.user?.name ?? "");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);

  // Done step — animated icon
  const fileCheckRef = useRef<FileCheckIconHandle>(null);
  useEffect(() => {
    if (step === "done") {
      const timer = setTimeout(() => fileCheckRef.current?.startAnimation(), 300);
      return () => clearTimeout(timer);
    }
  }, [step]);

  useEffect(() => {
    if (session?.user?.name && !name) {
      setName(session.user.name);
    }
  }, [session?.user?.name, name]);

  useEffect(() => {
    if (token) {
      fetch(`/api/waiver/verify-token?token=${encodeURIComponent(token)}`)
        .then((r) => {
          if (r.status === 401) { setTokenExpired(true); return null; }
          return r.ok ? r.json() : null;
        })
        .then((data) => {
          if (!data) return;
          setTokenBranding({ studioName: data.studioName, logoUrl: data.logoUrl });
          if (data.userName && !name) setName(data.userName);
          if (data.waiver) setWaiver(data.waiver);
        })
        .catch(() => setError("No se pudo cargar el waiver"))
        .finally(() => setLoading(false));
      return;
    }

    if (!tenantId) return;
    fetch(`/api/waiver/${tenantId}/active`)
      .then((r) => r.json())
      .then((data) => {
        if (data.waiver) {
          setWaiver(data.waiver);
        }
      })
      .catch(() => setError("No se pudo cargar el waiver"))
      .finally(() => setLoading(false));
  }, [tenantId, token]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 20;
    if (atBottom) setHasScrolled(true);
  }, []);

  const handleSignatureAccept = (dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
    setShowCanvas(false);
  };

  const canSubmit =
    name.trim().length > 0 &&
    signatureDataUrl &&
    accepted &&
    (!waiver?.requirePhone || phone.trim().length > 0) &&
    (!waiver?.requireBirthDate || birthDate.length > 0);

  const handleSubmit = async () => {
    if (!canSubmit || !waiver || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/waiver/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waiverId: waiver.id,
          signatureData: signatureDataUrl,
          method: "drawn",
          participantName: name.trim(),
          participantPhone: phone.trim() || undefined,
          participantBirthDate: birthDate || undefined,
          ...(token ? { token } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al firmar");
      }

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al firmar");
    } finally {
      setSubmitting(false);
    }
  };

  if (tokenExpired) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-stone-50 px-6 text-center">
        <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <X size={28} className="text-amber-600" />
        </div>
        <p className="text-base font-medium text-stone-700">
          Link expirado
        </p>
        <p className="max-w-xs text-sm text-stone-500">
          Este enlace ya no es válido. Abre la app para firmar el acuerdo desde ahí.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-stone-50">
        <Loader2 size={24} className="animate-spin text-muted/80" />
      </div>
    );
  }

  if (!waiver) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-stone-50 px-6 text-center">
        <Check size={40} className="text-emerald-500" />
        <p className="text-base font-medium text-stone-700">
          No hay waiver pendiente
        </p>
        <a href="/my" className="text-sm text-stone-500 underline">
          Ir al inicio
        </a>
      </div>
    );
  }

  const waiverHtml = waiver.content.replace(
    /\{\{nombre_cliente\}\}/g,
    name,
  );

  // ─── STEP: Intro ────────────────────────────────────────
  if (step === "intro") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-stone-50 px-6 text-center">
        <div className="mb-8">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={studioName}
              width={120}
              height={40}
              className="mx-auto h-10 w-auto"
            />
          ) : (
            <span className="text-2xl font-bold text-stone-800">
              {studioName}
            </span>
          )}
        </div>

        <h1 className="mb-3 text-xl font-semibold text-stone-800">
          Antes de continuar
        </h1>
        <p className="mb-10 max-w-xs text-sm leading-relaxed text-stone-500">
          Para seguir usando {studioName}, necesitas leer y firmar nuestro
          acuerdo de responsabilidad. Solo lo harás una vez. ¡Muchas gracias!
        </p>

        <button
          onClick={() => setStep("read")}
          className="flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-[#1C2340] py-4 text-base font-medium text-white active:opacity-90"
        >
          Leer y firmar
          <ChevronRight size={18} />
        </button>
      </div>
    );
  }

  // ─── STEP: Read ─────────────────────────────────────────
  if (step === "read") {
    const skipScroll = !waiver.requireScrollRead;
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-stone-50">
        {/* Fixed header */}
        <div className="shrink-0 border-b border-border/60 bg-card/90 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-stone-800">
              {studioName}
            </span>
            <span className="text-xs text-muted/80">1 de 2</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-6"
        >
          <h2 className="mb-4 text-lg font-semibold text-stone-800">
            {waiver.title}
          </h2>
          <div
            className="prose prose-sm prose-stone max-w-none text-justify text-sm leading-relaxed text-stone-700"
            dangerouslySetInnerHTML={{ __html: waiverHtml }}
          />
        </div>

        {/* Fixed footer */}
        <div className="shrink-0 border-t border-border/60 bg-card px-5 py-4 safe-bottom">
          {!skipScroll && !hasScrolled && (
            <p className="mb-2 text-center text-xs text-muted/80">
              Desliza para leer todo el documento
            </p>
          )}
          <button
            onClick={() => setStep("sign")}
            disabled={!skipScroll && !hasScrolled}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1C2340] py-4 text-base font-medium text-white disabled:opacity-40 active:opacity-90"
          >
            Continuar
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  // ─── STEP: Sign ─────────────────────────────────────────
  if (step === "sign") {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-stone-50">
        {/* Fixed header */}
        <div className="shrink-0 border-b border-border/60 bg-card/90 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep("read")}
              className="text-sm text-stone-500"
            >
              ← Volver
            </button>
            <span className="text-xs text-muted/80">
              2 de 2 · Firma el acuerdo
            </span>
            <div className="w-12" />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          {/* Name */}
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Nombre completo <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-5 w-full rounded-xl border border-border p-3 text-base text-stone-800 outline-none focus:border-stone-400"
            placeholder="Tu nombre"
          />

          {/* Phone */}
          {waiver.requirePhone && (
            <>
              <label className="mb-1 block text-sm font-medium text-stone-700">
                Teléfono <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mb-5 w-full rounded-xl border border-border p-3 text-base text-stone-800 outline-none focus:border-stone-400"
                placeholder="+52 555 123 4567"
              />
            </>
          )}

          {/* Birth date */}
          {waiver.requireBirthDate && (
            <>
              <label className="mb-1 block text-sm font-medium text-stone-700">
                Fecha de nacimiento <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="mb-5 w-full rounded-xl border border-border p-3 text-base text-stone-800 outline-none focus:border-stone-400"
              />
            </>
          )}

          {/* Signature area */}
          <div className="mb-5 rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium text-stone-700">
              Firma del participante{" "}
              <span className="text-red-400">*</span>
            </p>

            {signatureDataUrl ? (
              <div className="relative">
                <img
                  src={signatureDataUrl}
                  alt="Firma"
                  className="h-20 w-auto rounded-lg border border-border/60 bg-stone-50 p-2"
                />
                <button
                  onClick={() => setSignatureDataUrl(null)}
                  className="mt-2 flex items-center gap-1 text-xs text-stone-500 active:text-stone-700"
                >
                  <X size={12} />
                  Borrar y repetir
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCanvas(true)}
                className="flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 text-sm text-muted/80 active:bg-stone-100"
              >
                Toca aquí para firmar
              </button>
            )}
          </div>

          {/* Consent checkbox */}
          <label className="mb-6 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-stone-300 text-[#1C2340] accent-[#1C2340]"
            />
            <span className="text-xs leading-relaxed text-stone-500">
              Al marcar esta casilla acepto que mi firma electrónica tenga la
              misma validez que una firma manuscrita, conforme al Reglamento
              eIDAS (UE) 910/2014.
            </span>
          </label>

          {error && (
            <p className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">
              {error}
            </p>
          )}
        </div>

        {/* Fixed footer */}
        <div className="shrink-0 border-t border-border/60 bg-card px-5 py-4 safe-bottom">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1C2340] py-4 text-base font-medium text-white disabled:opacity-40 active:opacity-90"
          >
            {submitting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              "Firmar acuerdo"
            )}
          </button>
        </div>

        {/* Signature bottom sheet */}
        {showCanvas && (
          <SignatureCanvas
            onAccept={handleSignatureAccept}
            onClose={() => setShowCanvas(false)}
          />
        )}
      </div>
    );
  }

  // ─── STEP: Done ─────────────────────────────────────────
  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-stone-50 px-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
        <FileCheckIcon ref={fileCheckRef} size={32} className="text-emerald-600" />
      </div>

      <h1 className="mb-2 text-xl font-semibold text-stone-800">
        ¡Acuerdo firmado!
      </h1>
      <p className="mb-10 max-w-xs text-sm leading-relaxed text-stone-500">
        Hemos enviado una copia del documento firmado a tu email.
      </p>

      <a
        href="/my"
        className="flex w-full max-w-xs items-center justify-center rounded-2xl bg-[#1C2340] py-4 text-base font-medium text-white active:opacity-90"
      >
        Volver al inicio
      </a>
    </div>
  );
}
