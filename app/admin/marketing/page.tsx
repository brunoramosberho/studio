"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { QRCodeCanvas } from "qrcode.react";
import {
  Link2,
  Search,
  Copy,
  Check,
  QrCode,
  Download,
  CalendarDays,
  Package,
  ShoppingBag,
  MousePointerClick,
  ArrowRightLeft,
  TrendingUp,
  DollarSign,
  ExternalLink,
  Instagram,
  Globe,
  Mail,
  MessageCircle,
  Megaphone,
  ScanLine,
  Info,
  CalendarRange,
  Lightbulb,
  BarChart3,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────

interface LinkItem {
  id: string;
  name: string;
  slug: string;
  url: string;
  clicks: number;
  conversions: number;
  revenue: number;
  description?: string | null;
  price?: number;
  currency?: string;
  totalClasses?: number;
  type?: string;
  isPromo?: boolean;
}

interface ClassInstanceLink extends LinkItem {
  day: string;
  time: string;
  date: string;
  coachName: string | null;
  spotsLeft: number;
  capacity: number;
  color: string;
}

interface LinksData {
  disciplines: LinkItem[];
  classInstances: ClassInstanceLink[];
  schedule: LinkItem;
  memberships: LinkItem[];
  products: LinkItem[];
  tenantSlug: string;
  totals: {
    clicks: number;
    conversions: number;
    revenue: number;
    conversionRate: number;
  };
}

interface AnalyticsConfig {
  ga4MeasurementId: string | null;
  ga4ApiSecret: string | null;
  metaPixelId: string | null;
  gtmContainerId: string | null;
  ga4EventPurchase: boolean;
  ga4EventBeginCheckout: boolean;
  ga4EventViewItem: boolean;
  ga4EventSignUp: boolean;
  metaEventPurchase: boolean;
  metaEventInitiateCheckout: boolean;
  metaEventCompleteRegistration: boolean;
  metaEventViewContent: boolean;
}

// ─── Hooks ──────────────────────────────────────────────

function useLinks() {
  return useQuery<LinksData>({
    queryKey: ["marketing-links"],
    queryFn: () => fetch("/api/admin/marketing/links").then((r) => r.json()),
  });
}

function useAnalyticsConfig() {
  return useQuery<AnalyticsConfig>({
    queryKey: ["analytics-config"],
    queryFn: () =>
      fetch("/api/admin/marketing/analytics-config").then((r) => r.json()),
  });
}

function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AnalyticsConfig>) =>
      fetch("/api/admin/marketing/analytics-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["analytics-config"] }),
  });
}

// ─── Shared Small Components ────────────────────────────

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/60 bg-amber-50/50 px-4 py-3">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p className="text-xs leading-relaxed text-amber-800">{children}</p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-stone-400 first:mt-0">
      {children}
    </p>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  hint?: string;
}) {
  return (
    <div className="group relative rounded-xl bg-stone-100 p-3 text-center">
      <Icon className="mx-auto mb-1 h-4 w-4 text-stone-400" />
      <p className="text-lg font-bold text-stone-900">{value}</p>
      <p className="text-[11px] text-stone-500">{label}</p>
      {hint && (
        <span className="absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 rounded-lg bg-stone-800 px-2.5 py-1 text-[10px] text-white whitespace-nowrap shadow-lg group-hover:block">
          {hint}
        </span>
      )}
    </div>
  );
}

function ConversionBadge({ rate }: { rate: number }) {
  if (isNaN(rate)) {
    return (
      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-400">
        Sin datos
      </span>
    );
  }
  const pct = rate * 100;
  if (pct >= 15)
    return (
      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
        Alta
      </span>
    );
  if (pct >= 5)
    return (
      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        Media
      </span>
    );
  return (
    <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-400">
      Baja
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      title="Copiar link"
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
        copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-stone-200 text-stone-500 hover:bg-stone-50"
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function EntityIcon({ type, color }: { type: string; color?: string }) {
  const config: Record<string, { icon: React.ElementType; bg: string }> = {
    discipline: { icon: CalendarDays, bg: "bg-blue-50 text-blue-500" },
    "class-instance": { icon: CalendarDays, bg: "bg-blue-50 text-blue-500" },
    schedule: { icon: CalendarRange, bg: "bg-violet-50 text-violet-500" },
    membership: { icon: Package, bg: "bg-emerald-50 text-emerald-500" },
    product: { icon: ShoppingBag, bg: "bg-orange-50 text-orange-500" },
  };
  const c = config[type] || { icon: Link2, bg: "bg-stone-100 text-stone-500" };
  const Icon = c.icon;
  return (
    <div
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg",
        color ? "" : c.bg
      )}
      style={
        color
          ? { backgroundColor: `${color}15`, color }
          : undefined
      }
    >
      <Icon className="h-4 w-4" />
    </div>
  );
}

// ─── QR Modal ───────────────────────────────────────────

function QRModal({
  open,
  onOpenChange,
  url,
  name,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  url: string;
  name: string;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);

  function handleDownload() {
    const canvas = canvasRef.current?.querySelector("canvas");
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `qr-${name.toLowerCase().replace(/\s+/g, "-")}.png`;
      a.click();
      URL.revokeObjectURL(href);
    });
  }

  const cleanUrl = (() => {
    try {
      const u = new URL(url);
      u.search = "";
      return u.toString();
    } catch {
      return url;
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Código QR</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <div ref={canvasRef} className="flex justify-center py-4">
          <QRCodeCanvas value={cleanUrl} size={180} level="M" />
        </div>
        <p className="break-all text-center font-mono text-[11px] text-stone-400">
          {cleanUrl}
        </p>
        <p className="text-center text-[11px] text-stone-400">
          Imprime este QR en tu estudio, flyers o tarjetas para que tus clientes
          accedan directo.
        </p>
        <button
          onClick={handleDownload}
          className="flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
        >
          <Download className="h-4 w-4" />
          Descargar PNG
        </button>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab 1: Links ───────────────────────────────────────

function LinkRow({
  item,
  onQR,
  onUTM,
}: {
  item: LinkItem & { _type: string; subtitle?: string; color?: string };
  onQR: (url: string, name: string) => void;
  onUTM?: (url: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-stone-50">
      <EntityIcon type={item._type} color={item.color} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-stone-900">
          {item.name}
          {item.subtitle && (
            <span className="ml-1.5 text-xs font-normal text-stone-400">
              {item.subtitle}
            </span>
          )}
        </p>
        <p className="truncate font-mono text-xs text-stone-400">{item.url}</p>
      </div>
      <span className="hidden whitespace-nowrap text-xs text-stone-500 sm:inline">
        {item.clicks} clicks · {item.conversions} conv.
      </span>
      <ConversionBadge
        rate={item.clicks > 0 ? item.conversions / item.clicks : NaN}
      />
      <CopyButton text={item.url} />
      {onUTM && (
        <button
          onClick={() => onUTM(item.url)}
          title="Crear link con UTM"
          className="flex h-8 items-center gap-1 rounded-lg border border-stone-200 px-2 text-[11px] font-medium text-stone-500 transition-colors hover:bg-stone-50"
        >
          <MousePointerClick className="h-3 w-3" />
          <span className="hidden sm:inline">UTM</span>
        </button>
      )}
      <button
        onClick={() => onQR(item.url, item.name)}
        title="Generar QR"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500 transition-colors hover:bg-stone-50"
      >
        <QrCode className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="border-b border-stone-100 bg-stone-50/50 px-4 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
        {label}
      </p>
    </div>
  );
}

function LinksTab({ onGoToUTM }: { onGoToUTM: (url: string) => void }) {
  const { data, isLoading } = useLinks();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    "all" | "class" | "membership" | "product"
  >("all");
  const [qrModal, setQrModal] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [showAllClasses, setShowAllClasses] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-10 rounded-xl" />
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data || !data.disciplines) return null;

  const q = search.toLowerCase();
  const matchQ = (item: LinkItem) =>
    !q || item.name.toLowerCase().includes(q) || item.url.toLowerCase().includes(q);

  const disciplines = data.disciplines || [];
  const classInstances = data.classInstances || [];
  const memberships = data.memberships || [];
  const products = data.products || [];

  const hasAnyLinks =
    disciplines.length > 0 ||
    classInstances.length > 0 ||
    memberships.length > 0 ||
    products.length > 0;

  const showClasses = filter === "all" || filter === "class";
  const showMemberships = filter === "all" || filter === "membership";
  const showProducts = filter === "all" || filter === "product";

  function openQR(url: string, name: string) {
    setQrModal({ url, name });
  }

  const filterButtons = [
    { key: "all" as const, label: "Todos" },
    { key: "class" as const, label: "Clases" },
    { key: "membership" as const, label: "Paquetes" },
    { key: "product" as const, label: "Productos" },
  ];

  return (
    <div className="space-y-5">
      {/* Explainer */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3730B8]/10">
            <Link2 className="h-4.5 w-4.5 text-[#3730B8]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-900">
              Tus links públicos
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
              Cada disciplina, clase, paquete y producto tiene un link único que
              puedes compartir en redes sociales, WhatsApp, email o imprimir
              como QR. Copia el link, mándalo a tus clientes y mide cuántas
              visitas y reservas genera cada uno.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Clicks este mes"
          value={data.totals.clicks.toLocaleString()}
          icon={MousePointerClick}
          hint="Visitas a tus links en los últimos 30 días"
        />
        <StatCard
          label="Conversiones"
          value={data.totals.conversions.toLocaleString()}
          icon={ArrowRightLeft}
          hint="Reservas o compras que vinieron de un link"
        />
        <StatCard
          label="Tasa conversión"
          value={`${data.totals.conversionRate}%`}
          icon={TrendingUp}
          hint="% de clicks que terminaron en reserva/compra"
        />
        <StatCard
          label="Revenue atribuido"
          value={`€${data.totals.revenue.toLocaleString()}`}
          icon={DollarSign}
          hint="Ingresos generados a través de links"
        />
      </div>

      {data.totals.clicks === 0 && (
        <Tip>
          Aún no tienes clicks registrados. Comparte alguno de estos links en
          Instagram, WhatsApp o imprímelo como QR y verás las estadísticas aquí.
        </Tip>
      )}

      {/* Search + Filters */}
      {hasAnyLinks && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar clase, paquete o producto..."
              className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400 focus:ring-1 focus:ring-stone-300"
            />
          </div>
          <div className="flex gap-1">
            {filterButtons.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === f.key
                    ? "bg-stone-900 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Link List */}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {!hasAnyLinks ? (
          <div className="px-4 py-12 text-center">
            <Link2 className="mx-auto mb-2 h-8 w-8 text-stone-300" />
            <p className="text-sm font-medium text-stone-500">
              No se encontraron links
            </p>
            <p className="mt-1 text-xs text-stone-400">
              Crea disciplinas, paquetes o productos y aparecerán aquí
              automáticamente.
            </p>
          </div>
        ) : (
          <>
            {/* Schedule & Disciplines */}
            {showClasses && (
              <>
                <SectionHeader label="Horario y Disciplinas" />
                {matchQ(data.schedule) && (
                  <LinkRow
                    item={{ ...data.schedule, _type: "schedule" }}
                    onQR={openQR}
                    onUTM={onGoToUTM}
                  />
                )}
                {disciplines.filter(matchQ).map((d) => (
                  <LinkRow
                    key={d.id}
                    item={{
                      ...d,
                      _type: "discipline",
                      subtitle: `${d.totalClasses || 0} clases`,
                    }}
                    onQR={openQR}
                    onUTM={onGoToUTM}
                  />
                ))}
              </>
            )}

            {/* Individual upcoming classes */}
            {showClasses && classInstances.filter(matchQ).length > 0 && (
              <>
                <SectionHeader label={`Próximas clases (${classInstances.filter(matchQ).length})`} />
                {(showAllClasses
                  ? classInstances.filter(matchQ)
                  : classInstances.filter(matchQ).slice(0, 5)
                ).map((c) => (
                  <LinkRow
                    key={c.id}
                    item={{
                      ...c,
                      _type: "class-instance",
                      color: c.color,
                      subtitle: `${c.day} ${c.date} · ${c.time}${c.coachName ? ` · ${c.coachName}` : ""} · ${c.spotsLeft}/${c.capacity} lugares`,
                    }}
                    onQR={openQR}
                    onUTM={onGoToUTM}
                  />
                ))}
                {classInstances.filter(matchQ).length > 5 && (
                  <button
                    onClick={() => setShowAllClasses(!showAllClasses)}
                    className="flex w-full items-center justify-center gap-1 border-b border-stone-100 py-2.5 text-xs font-medium text-[#3730B8] transition-colors hover:bg-stone-50"
                  >
                    {showAllClasses
                      ? "Mostrar menos"
                      : `Ver todas (${classInstances.filter(matchQ).length - 5} más)`}
                  </button>
                )}
              </>
            )}

            {/* Packages */}
            {showMemberships && memberships.filter(matchQ).length > 0 && (
              <>
                <SectionHeader label="Paquetes y Membresías" />
                {memberships.filter(matchQ).map((m) => (
                  <LinkRow
                    key={m.id}
                    item={{
                      ...m,
                      _type: "membership",
                      subtitle: m.price
                        ? `${m.currency === "MXN" ? "$" : "€"}${m.price}${m.isPromo ? " · Oferta" : ""}`
                        : undefined,
                    }}
                    onQR={openQR}
                    onUTM={onGoToUTM}
                  />
                ))}
              </>
            )}

            {/* Products */}
            {showProducts && products.filter(matchQ).length > 0 && (
              <>
                <SectionHeader label="Productos" />
                {products.filter(matchQ).map((p) => (
                  <LinkRow
                    key={p.id}
                    item={{
                      ...p,
                      _type: "product",
                      subtitle: p.price
                        ? `${p.currency === "MXN" ? "$" : "€"}${p.price}`
                        : undefined,
                    }}
                    onQR={openQR}
                    onUTM={onGoToUTM}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {qrModal && (
        <QRModal
          open={!!qrModal}
          onOpenChange={() => setQrModal(null)}
          url={qrModal.url}
          name={qrModal.name}
        />
      )}
    </div>
  );
}

// ─── Tab 2: UTM Generator ───────────────────────────────

const UTM_SOURCES = [
  "instagram",
  "google",
  "facebook",
  "email",
  "whatsapp",
  "tiktok",
  "otro",
];
const UTM_MEDIUMS = [
  "cpc",
  "social",
  "email",
  "stories",
  "bio",
  "qr",
  "referral",
];

interface Template {
  label: string;
  description: string;
  source: string;
  medium: string;
  icon: React.ElementType;
}

const TEMPLATES: Template[] = [
  {
    label: "Instagram bio",
    description: "Link en tu perfil de Instagram",
    source: "instagram",
    medium: "bio",
    icon: Instagram,
  },
  {
    label: "Instagram Stories",
    description: 'Sticker de "link" en una story',
    source: "instagram",
    medium: "stories",
    icon: Instagram,
  },
  {
    label: "Instagram Ads",
    description: "Publicidad pagada en Instagram",
    source: "instagram",
    medium: "cpc",
    icon: Instagram,
  },
  {
    label: "Google Ads",
    description: "Publicidad pagada en Google",
    source: "google",
    medium: "cpc",
    icon: Globe,
  },
  {
    label: "Email / Newsletter",
    description: "Envío de email a tu lista",
    source: "email",
    medium: "email",
    icon: Mail,
  },
  {
    label: "WhatsApp",
    description: "Mensaje directo o grupo",
    source: "whatsapp",
    medium: "social",
    icon: MessageCircle,
  },
  {
    label: "TikTok",
    description: "Link en bio o video",
    source: "tiktok",
    medium: "social",
    icon: Megaphone,
  },
  {
    label: "QR físico",
    description: "Impreso en flyer, tarjeta o cartel",
    source: "qr",
    medium: "print",
    icon: ScanLine,
  },
];

function UtmGeneratorTab({ initialDestination }: { initialDestination?: string }) {
  const { data } = useLinks();
  const [destination, setDestination] = useState(initialDestination || "");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");
  const [qrModal, setQrModal] = useState<{
    url: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    if (initialDestination) setDestination(initialDestination);
  }, [initialDestination]);

  const scheduleItems = data?.schedule
    ? [{ value: data.schedule.url, label: "Horario completo" }]
    : [];
  const disciplineItems = (data?.disciplines || []).map((c) => ({
    value: c.url,
    label: c.name,
  }));
  const classItems = (data?.classInstances || []).map((c) => ({
    value: c.url,
    label: `${c.name} — ${c.day} ${c.date} ${c.time}`,
  }));
  const membershipItems = (data?.memberships || []).map((m) => ({
    value: m.url,
    label: m.name,
  }));
  const productItems = (data?.products || []).map((p) => ({
    value: p.url,
    label: p.name,
  }));

  const allDestinations = [
    ...scheduleItems,
    ...disciplineItems,
    ...classItems,
    ...membershipItems,
    ...productItems,
  ];

  const baseUrl = destination || allDestinations[0]?.value || "";
  const utmParts: string[] = [];
  if (source) utmParts.push(`utm_source=${encodeURIComponent(source)}`);
  if (medium) utmParts.push(`utm_medium=${encodeURIComponent(medium)}`);
  if (campaign) utmParts.push(`utm_campaign=${encodeURIComponent(campaign)}`);
  if (content) utmParts.push(`utm_content=${encodeURIComponent(content)}`);
  if (term) utmParts.push(`utm_term=${encodeURIComponent(term)}`);

  const utmString = utmParts.join("&");
  const fullUrl = utmString ? `${baseUrl}?${utmString}` : baseUrl;
  const selectedName =
    allDestinations.find((d) => d.value === baseUrl)?.label || "Link";

  function applyTemplate(t: Template) {
    setSource(t.source);
    setMedium(t.medium);
  }

  return (
    <div className="space-y-5">
      {/* Explainer */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3730B8]/10">
            <BarChart3 className="h-4.5 w-4.5 text-[#3730B8]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-900">
              ¿Qué son los parámetros UTM?
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
              Son etiquetas que se añaden al final de un link (como{" "}
              <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[10px] text-[#3730B8]">
                ?utm_source=instagram
              </code>
              ) para saber <strong>de dónde vienen tus visitas</strong>.
              Así puedes comparar qué canal te trae más reservas: ¿Instagram,
              WhatsApp, un flyer impreso? Selecciona un destino abajo, elige de
              dónde lo vas a compartir, y te generamos el link listo para copiar.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Form */}
        <div className="space-y-4 lg:col-span-3">
          <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">
                ¿A dónde quieres enviar a la gente?
              </label>
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar destino..." />
                </SelectTrigger>
                <SelectContent>
                  {scheduleItems.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Horario</SelectLabel>
                      {scheduleItems.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {disciplineItems.length > 0 && (
                    <SelectGroup>
                      <SelectSeparator />
                      <SelectLabel>Disciplinas</SelectLabel>
                      {disciplineItems.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {classItems.length > 0 && (
                    <SelectGroup>
                      <SelectSeparator />
                      <SelectLabel>Próximas clases</SelectLabel>
                      {classItems.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {membershipItems.length > 0 && (
                    <SelectGroup>
                      <SelectSeparator />
                      <SelectLabel>Paquetes</SelectLabel>
                      {membershipItems.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {productItems.length > 0 && (
                    <SelectGroup>
                      <SelectSeparator />
                      <SelectLabel>Productos</SelectLabel>
                      {productItems.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">
                  ¿Dónde lo vas a publicar?
                </label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Ej: Instagram, Google..." />
                  </SelectTrigger>
                  <SelectContent>
                    {UTM_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">
                  ¿Cómo lo compartes?
                </label>
                <Select value={medium} onValueChange={setMedium}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Ej: Stories, email..." />
                  </SelectTrigger>
                  <SelectContent>
                    {UTM_MEDIUMS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">
                Nombre de la campaña{" "}
                <span className="text-stone-400">(identifica esta acción)</span>
              </label>
              <input
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="Ej: promo-verano, lanzamiento-yoga, blackfriday"
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">
                  Contenido{" "}
                  <span className="text-stone-400">
                    opcional — diferencia variantes
                  </span>
                </label>
                <input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Ej: banner-verde, cta-superior"
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">
                  Término{" "}
                  <span className="text-stone-400">
                    opcional — keyword de ads
                  </span>
                </label>
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Ej: pilates-madrid"
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400"
                />
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-xl bg-stone-100 p-3">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-stone-400">
                Tu link generado
              </p>
              <p className="break-all font-mono text-xs">
                <span className="text-stone-500">{baseUrl}</span>
                {utmString && (
                  <>
                    <span className="text-stone-400">?</span>
                    <span className="font-medium text-[#3730B8]">
                      {utmString}
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <CopyButton text={fullUrl} />
              <button
                onClick={() =>
                  setQrModal({ url: fullUrl, name: selectedName })
                }
                className="flex h-8 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50"
              >
                <QrCode className="h-3.5 w-3.5" />
                QR
              </button>
              <a
                href={fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-8 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir
              </a>
            </div>
          </div>
        </div>

        {/* Templates */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-stone-900">
              Atajos rápidos
            </h3>
            <p className="mb-3 text-[11px] text-stone-400">
              Haz click para preconfigurar los campos
            </p>
            <div className="space-y-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => applyTemplate(t)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    source === t.source && medium === t.medium
                      ? "bg-[#3730B8]/5 ring-1 ring-[#3730B8]/20"
                      : "hover:bg-stone-50"
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100">
                    <t.icon className="h-4 w-4 text-stone-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900">
                      {t.label}
                    </p>
                    <p className="truncate text-[11px] text-stone-400">
                      {t.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {qrModal && (
        <QRModal
          open={!!qrModal}
          onOpenChange={() => setQrModal(null)}
          url={qrModal.url}
          name={qrModal.name}
        />
      )}
    </div>
  );
}

// ─── Tab 3: Pixels & Analytics ──────────────────────────

interface PixelEvent {
  label: string;
  trigger: string;
  key: keyof AnalyticsConfig;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-[#3730B8]" : "bg-stone-300"
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked && "translate-x-4"
        )}
      />
    </button>
  );
}

function PixelCard({
  logo,
  name,
  description,
  idLabel,
  idPlaceholder,
  idValue,
  secondaryIdLabel,
  secondaryIdPlaceholder,
  secondaryIdValue,
  onSave,
  events,
  eventValues,
  onToggleEvent,
}: {
  logo: string;
  name: string;
  description: string;
  idLabel: string;
  idPlaceholder: string;
  idValue: string | null;
  secondaryIdLabel?: string;
  secondaryIdPlaceholder?: string;
  secondaryIdValue?: string | null;
  onSave: (id: string, secondaryId?: string) => void;
  events?: PixelEvent[];
  eventValues?: AnalyticsConfig;
  onToggleEvent?: (key: keyof AnalyticsConfig, value: boolean) => void;
}) {
  const [value, setValue] = useState(idValue || "");
  const [secondaryValue, setSecondaryValue] = useState(
    secondaryIdValue || ""
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(idValue || "");
    setSecondaryValue(secondaryIdValue || "");
  }, [idValue, secondaryIdValue]);

  const isConnected = !!idValue;

  function handleSave() {
    onSave(value, secondaryValue || undefined);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-sm font-bold text-stone-600">
            {logo}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-900">{name}</h3>
            <p className="text-xs text-stone-400">{description}</p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[10px] font-medium",
            isConnected
              ? "bg-emerald-50 text-emerald-700"
              : "bg-stone-100 text-stone-400"
          )}
        >
          {isConnected ? "Conectado" : "Sin configurar"}
        </span>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-stone-600">
          {idLabel}
        </label>
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={idPlaceholder}
            className="flex-1 rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs outline-none transition-colors placeholder:text-stone-300 focus:border-stone-400"
          />
          <button
            onClick={handleSave}
            disabled={value === (idValue || "") && secondaryValue === (secondaryIdValue || "")}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-medium transition-colors",
              saved
                ? "bg-emerald-50 text-emerald-700"
                : "bg-stone-900 text-white hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400"
            )}
          >
            {saved ? "Guardado" : "Guardar"}
          </button>
        </div>
      </div>

      {secondaryIdLabel && (
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-stone-600">
            {secondaryIdLabel}
            <span className="group relative">
              <Info className="h-3 w-3 text-stone-400" />
              <span className="absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-stone-800 px-2.5 py-1 text-[10px] text-white whitespace-nowrap shadow-lg group-hover:block">
                GA4 → Admin → Data Streams → API Secrets
              </span>
            </span>
          </label>
          <input
            value={secondaryValue}
            onChange={(e) => setSecondaryValue(e.target.value)}
            placeholder={secondaryIdPlaceholder}
            className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs outline-none transition-colors placeholder:text-stone-300 focus:border-stone-400"
          />
        </div>
      )}

      {events && isConnected && eventValues && onToggleEvent && (
        <div className="space-y-2 border-t border-stone-100 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
            Eventos que se rastrean
          </p>
          {events.map((ev) => (
            <div
              key={ev.key}
              className="flex items-center justify-between rounded-lg px-1 py-1.5"
            >
              <div>
                <p className="text-xs font-medium text-stone-700">
                  {ev.label}
                </p>
                <p className="font-mono text-[10px] text-stone-400">
                  {ev.trigger}
                </p>
              </div>
              <Toggle
                checked={!!eventValues[ev.key]}
                onChange={(v) => onToggleEvent(ev.key, v)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PixelsTab() {
  const { data: config, isLoading } = useAnalyticsConfig();
  const updateConfig = useUpdateConfig();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!config) return null;

  const ga4Events: PixelEvent[] = [
    {
      label: "Reserva completada",
      trigger: "purchase",
      key: "ga4EventPurchase",
    },
    {
      label: "Inicio de checkout",
      trigger: "begin_checkout",
      key: "ga4EventBeginCheckout",
    },
    {
      label: "Ver clase/paquete",
      trigger: "view_item",
      key: "ga4EventViewItem",
    },
    {
      label: "Registro completado",
      trigger: "sign_up",
      key: "ga4EventSignUp",
    },
  ];

  const metaEvents: PixelEvent[] = [
    {
      label: "Reserva completada",
      trigger: "Purchase",
      key: "metaEventPurchase",
    },
    {
      label: "Inicio de checkout",
      trigger: "InitiateCheckout",
      key: "metaEventInitiateCheckout",
    },
    {
      label: "Registro completado",
      trigger: "CompleteRegistration",
      key: "metaEventCompleteRegistration",
    },
    {
      label: "Ver contenido",
      trigger: "ViewContent",
      key: "metaEventViewContent",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Explainer */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3730B8]/10">
            <TrendingUp className="h-4.5 w-4.5 text-[#3730B8]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-900">
              Conecta tus plataformas de analítica
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
              Los &quot;pixels&quot; son pequeños códigos que Google y Meta
              (Facebook/Instagram) usan para medir cuántas personas visitan tu
              página y cuántas terminan reservando. Al conectarlos, podrás ver
              exactamente cuántos clientes te trae cada anuncio o publicación, y
              crear públicos personalizados para tus campañas de ads.
            </p>
          </div>
        </div>
      </div>

      <Tip>
        Si nunca has usado esto, no te preocupes — tu estudio funciona
        perfectamente sin ello. Esto es útil cuando empieces a hacer publicidad
        pagada en Instagram o Google y quieras medir resultados.
      </Tip>

      <PixelCard
        logo="GA"
        name="Google Analytics 4"
        description="Mide tráfico y conversiones de tu web"
        idLabel="Measurement ID"
        idPlaceholder="G-XXXXXXXXXX"
        idValue={config.ga4MeasurementId}
        secondaryIdLabel="API Secret (para tracking server-side)"
        secondaryIdPlaceholder="xxxxxxxxxxxxxxxx"
        secondaryIdValue={config.ga4ApiSecret}
        onSave={(id, secret) =>
          updateConfig.mutate({
            ga4MeasurementId: id || null,
            ga4ApiSecret: secret || null,
          } as Partial<AnalyticsConfig>)
        }
        events={ga4Events}
        eventValues={config}
        onToggleEvent={(key, value) =>
          updateConfig.mutate({
            [key]: value,
          } as Partial<AnalyticsConfig>)
        }
      />

      <PixelCard
        logo="Meta"
        name="Meta Pixel"
        description="Mide conversiones de Facebook e Instagram Ads"
        idLabel="Pixel ID"
        idPlaceholder="1234567890123456"
        idValue={config.metaPixelId}
        onSave={(id) =>
          updateConfig.mutate({
            metaPixelId: id || null,
          } as Partial<AnalyticsConfig>)
        }
        events={metaEvents}
        eventValues={config}
        onToggleEvent={(key, value) =>
          updateConfig.mutate({
            [key]: value,
          } as Partial<AnalyticsConfig>)
        }
      />

      <PixelCard
        logo="GTM"
        name="Google Tag Manager"
        description="Un contenedor para gestionar todos tus tags sin tocar código"
        idLabel="Container ID"
        idPlaceholder="GTM-XXXXXXX"
        idValue={config.gtmContainerId}
        onSave={(id) =>
          updateConfig.mutate({
            gtmContainerId: id || null,
          } as Partial<AnalyticsConfig>)
        }
      />
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState("links");
  const [utmDestination, setUtmDestination] = useState<string | undefined>();

  function goToUTM(url: string) {
    setUtmDestination(url);
    setActiveTab("utm");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          Marketing
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Comparte links de tu estudio, mide de dónde vienen tus clientes y
          conecta tus herramientas de analítica.
        </p>
      </motion.div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="links">
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            Links
          </TabsTrigger>
          <TabsTrigger value="utm">
            <MousePointerClick className="mr-1.5 h-3.5 w-3.5" />
            Generador UTM
          </TabsTrigger>
          <TabsTrigger value="pixels">
            <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
            Pixels
          </TabsTrigger>
        </TabsList>

        <TabsContent value="links">
          <LinksTab onGoToUTM={goToUTM} />
        </TabsContent>
        <TabsContent value="utm">
          <UtmGeneratorTab initialDestination={utmDestination} />
        </TabsContent>
        <TabsContent value="pixels">
          <PixelsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
