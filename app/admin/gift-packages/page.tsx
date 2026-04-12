"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Gift,
  Package,
  User,
  ShieldCheck,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface GiftData {
  id: string;
  tenantId: string;
  recipientId: string;
  packageId: string;
  userPackageId: string | null;
  giftedById: string;
  reason: string | null;
  notes: string | null;
  createdAt: string;
  recipient: { id: string; name: string | null; email: string; image: string | null } | null;
  package: { id: string; name: string; price: number; currency: string; credits: number | null } | null;
  giftedBy: { id: string; name: string | null; email: string; image: string | null } | null;
}

const REASON_LABELS: Record<string, string> = {
  cortesia: "Cortesia",
  compensacion: "Compensacion",
  promocion: "Promocion",
  fidelidad: "Fidelidad",
  cumpleanos: "Cumpleanos",
  referido: "Referido",
  otro: "Otro",
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function GiftPackagesPage() {
  const t = useTranslations("gifts");

  const { data: gifts, isLoading } = useQuery<GiftData[]>({
    queryKey: ["admin-gift-packages"],
    queryFn: () => fetch("/api/admin/gift-packages").then((r) => r.json()),
  });

  // Compute stats
  const totalValue = gifts?.reduce(
    (sum, g) => sum + (g.package?.price || 0),
    0,
  ) ?? 0;
  const uniqueRecipients = new Set(gifts?.map((g) => g.recipientId)).size;
  const reasonCounts = gifts?.reduce(
    (acc, g) => {
      const key = g.reason || "otro";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  ) ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Gift className="h-6 w-6" />
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>

      {/* Stats */}
      {gifts && gifts.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{gifts.length}</div>
              <div className="text-xs text-muted-foreground">{t("totalGifted")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{uniqueRecipients}</div>
              <div className="text-xs text-muted-foreground">{t("uniqueRecipients")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">
                {formatCurrency(totalValue, "EUR")}
              </div>
              <div className="text-xs text-muted-foreground">{t("totalValue")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">
                {Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
                  ? REASON_LABELS[Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0][0]] || "—"
                  : "—"}
              </div>
              <div className="text-xs text-muted-foreground">{t("topReason")}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!gifts || gifts.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Gift className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold">{t("emptyTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("emptyDescription")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Gift audit log */}
      {gifts && gifts.length > 0 && (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="space-y-3"
        >
          {gifts.map((g) => (
            <motion.div key={g.id} variants={fadeUp}>
              <Card>
                <CardContent className="flex items-center gap-4 p-4">
                  {/* Recipient avatar */}
                  <Link href={`/admin/clients/${g.recipientId}`}>
                    <Avatar className="h-10 w-10">
                      {g.recipient?.image && (
                        <AvatarImage src={g.recipient.image} />
                      )}
                      <AvatarFallback>
                        {(g.recipient?.name || g.recipient?.email || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Link>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/admin/clients/${g.recipientId}`}
                        className="font-medium hover:underline"
                      >
                        {g.recipient?.name || g.recipient?.email || "—"}
                      </Link>
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Package className="h-3 w-3" />
                        {g.package?.name || "—"}
                      </Badge>
                      {g.reason && (
                        <Badge variant="secondary" className="text-xs">
                          {REASON_LABELS[g.reason] || g.reason}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        {g.giftedBy?.name || g.giftedBy?.email || "Admin"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(g.createdAt).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {g.package && (
                        <span>
                          {t("valueLabel")}: {formatCurrency(g.package.price, g.package.currency)}
                        </span>
                      )}
                    </div>
                    {g.notes && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground/70 italic">
                        {g.notes}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Fraud notice */}
      {gifts && gifts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <h4 className="text-sm font-medium text-amber-800">
                {t("auditNotice")}
              </h4>
              <p className="mt-0.5 text-xs text-amber-700">
                {t("auditNoticeDescription")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
