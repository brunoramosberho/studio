"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { use } from "react";
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  Globe2,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/components/tenant-provider";
import { WellhubApiSetup } from "./wellhub-api-setup";

type Platform = "classpass" | "wellhub";

interface PlatformConfig {
  id: string;
  platform: Platform;
  inboundEmail: string;
  platformPartnerId: string | null;
  locationMappings: Record<string, string> | null;
  portalUrl: string | null;
  ratePerVisit: number | null;
  isActive: boolean;
}

export default function PlatformSetupPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = use(params);
  const isValidPlatform = platform === "classpass" || platform === "wellhub";

  if (!isValidPlatform) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-muted">Plataforma no válida</p>
        <Link href="/admin/platforms" className="mt-2 text-sm text-admin underline">
          Volver
        </Link>
      </div>
    );
  }

  return <SetupFlow platform={platform as Platform} />;
}

function SetupFlow({ platform }: { platform: Platform }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isCP = platform === "classpass";
  const label = isCP ? "ClassPass" : "Wellhub";
  const color = isCP ? "#5B5EA6" : "#E4572E";

  const [partnerId, setPartnerId] = useState("");
  const [portalUrl, setPortalUrl] = useState("");
  const [rate, setRate] = useState("");
  const [locations, setLocations] = useState<Array<{ name: string; gymId: string }>>([
    { name: "Sede principal", gymId: "" },
  ]);
  const [copied, setCopied] = useState(false);

  const { data: config, isLoading } = useQuery<PlatformConfig | null>({
    queryKey: ["platform-config", platform],
    queryFn: async () => {
      const res = await fetch("/api/platforms/config");
      if (!res.ok) return null;
      const configs: PlatformConfig[] = await res.json();
      return configs.find((c) => c.platform === platform) ?? null;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/platforms/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-config"] });
      queryClient.invalidateQueries({ queryKey: ["platform-configs"] });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      const data: Record<string, unknown> = {
        platform,
        isActive: true,
      };
      if (isCP && partnerId) data.platformPartnerId = partnerId;
      if (portalUrl) data.portalUrl = portalUrl;
      if (rate) data.ratePerVisit = parseFloat(rate);

      if (!isCP && locations.some((l) => l.gymId)) {
        const mappings: Record<string, string> = {};
        locations.forEach((l, i) => {
          if (l.gymId) mappings[`sede_${i}`] = l.gymId;
        });
        data.locationMappings = mappings;
      }

      const res = await fetch("/api/platforms/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-config"] });
      queryClient.invalidateQueries({ queryKey: ["platform-configs"] });
      toast.success(`${label} activado`);
      router.push("/admin/platforms");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Auto-create config if it doesn't exist
  const needsCreate = !isLoading && !config;

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copiado");
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface" />
        <div className="h-96 animate-pulse rounded-2xl bg-surface" />
      </div>
    );
  }

  const inboundEmail = config?.inboundEmail ?? `${platform}.tu-estudio@in.mgic.app`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Link
          href="/admin/platforms"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Plataformas
        </Link>
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${color}15` }}
          >
            <Globe2 className="h-5 w-5" style={{ color }} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Configurar {label}</h1>
            <p className="text-sm text-muted">
              Sigue estos pasos para conectar tu cuenta
            </p>
          </div>
        </div>
      </motion.div>

      {needsCreate && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted">Primero, crea la configuración para {label}</p>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="gap-1.5 bg-admin hover:bg-admin/90"
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear configuración
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Wellhub: use the API-driven flow instead of the legacy email steps. */}
      {!isCP && config && <WellhubApiSetup />}

      {isCP && config && !config.isActive && (
        <div className="space-y-4">
          <ClassPassSteps
            inboundEmail={inboundEmail}
            partnerId={partnerId}
            setPartnerId={setPartnerId}
            portalUrl={portalUrl}
            setPortalUrl={setPortalUrl}
            rate={rate}
            setRate={setRate}
            onCopy={handleCopy}
            copied={copied}
          />

          <Button
            onClick={() => activateMutation.mutate()}
            disabled={activateMutation.isPending}
            className="w-full gap-2 bg-admin hover:bg-admin/90"
            size="lg"
          >
            {activateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Activar {label}
          </Button>
        </div>
      )}

      {isCP && config?.isActive && (
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="flex items-center gap-3 p-4">
            <Check className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-800">{label} está activo</p>
              <p className="text-xs text-green-700/70">
                Las reservas llegarán automáticamente a {inboundEmail}
              </p>
            </div>
            <Link href="/admin/platforms" className="ml-auto">
              <Button variant="outline" size="sm">Ir a Plataformas</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── ClassPass Steps ────────────────────────────────────

function ClassPassSteps({
  inboundEmail,
  partnerId,
  setPartnerId,
  portalUrl,
  setPortalUrl,
  rate,
  setRate,
  onCopy,
  copied,
}: {
  inboundEmail: string;
  partnerId: string;
  setPartnerId: (v: string) => void;
  portalUrl: string;
  setPortalUrl: (v: string) => void;
  rate: string;
  setRate: (v: string) => void;
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  const currency = useCurrency();
  return (
    <div className="space-y-3">
      <Step number={1} title="Crea tu cuenta en ClassPass Partner Portal">
        <a
          href="https://partners.classpass.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" size="sm" className="gap-1.5">
            Abrir ClassPass Partner Portal
            <ExternalLink className="h-3 w-3" />
          </Button>
        </a>
      </Step>

      <Step number={2} title="Envía un email a ClassPass solicitando la integración">
        <p className="text-xs text-muted">
          Incluye tu nombre de estudio y solicita que activen la integración con Mgic Studio.
        </p>
      </Step>

      <Step number={3} title="ClassPass te responderá con tu partnerId">
        <Input
          placeholder="Pegar partnerId aquí..."
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
        />
      </Step>

      <Step number={4} title="Configura notificaciones de reservas">
        <p className="text-xs text-muted">
          Añade este email en ClassPass → Settings → Notifications:
        </p>
        <CopyField value={inboundEmail} onCopy={onCopy} copied={copied} />
      </Step>

      <Step number={5} title="Tarifa estimada por visita">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted">{currency.symbol}</span>
          <Input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-28"
          />
        </div>
        <p className="mt-1 text-xs text-muted/70">
          Para calcular liquidaciones — la tarifa real la determina ClassPass
        </p>
      </Step>

      <Step number={6} title="URL de tu perfil en ClassPass">
        <Input
          placeholder="https://classpass.com/studios/..."
          value={portalUrl}
          onChange={(e) => setPortalUrl(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted/70">Para links directos desde las alertas</p>
      </Step>
    </div>
  );
}

// Note: the legacy email-based WellhubSteps component was removed when the
// Wellhub flow migrated to the API integration in `wellhub-api-setup.tsx`.

// ─── Shared components ──────────────────────────────────

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-admin/10 text-xs font-bold text-admin">
            {number}
          </span>
          <p className="text-sm font-semibold text-foreground">{title}</p>
        </div>
        <div className="pl-9">{children}</div>
      </CardContent>
    </Card>
  );
}

function CopyField({
  value,
  onCopy,
  copied,
}: {
  value: string;
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
      <code className="flex-1 text-sm font-medium text-foreground">{value}</code>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2"
        onClick={() => onCopy(value)}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
