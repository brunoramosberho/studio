"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Store, Loader2, CheckCircle2, Link2Off, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";

interface ShopifyStatus {
  connected: boolean;
  shopDomain?: string;
  isActive?: boolean;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}

export function ShopifyConnectionCard() {
  const t = useTranslations("admin");
  const qc = useQueryClient();

  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery<ShopifyStatus>({
    queryKey: ["admin-shopify"],
    queryFn: async () => {
      const res = await fetch("/api/admin/shop/shopify");
      if (!res.ok) throw new Error("Failed to load Shopify status");
      return res.json();
    },
  });

  const connectMut = useMutation({
    mutationFn: async (payload: { shopDomain: string; storefrontAccessToken: string }) => {
      const res = await fetch("/api/admin/shop/shopify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      return data;
    },
    onSuccess: () => {
      setError(null);
      setToken("");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["admin-shopify"] });
      qc.invalidateQueries({ queryKey: ["admin-shop-products"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async (isActive: boolean) => {
      const res = await fetch("/api/admin/shop/shopify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopDomain: status?.shopDomain,
          storefrontAccessToken: "",
          isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-shopify"] }),
    onError: (e: Error) => setError(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/shop/shopify", { method: "DELETE" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["admin-shopify"] });
      qc.invalidateQueries({ queryKey: ["admin-shop-products"] });
    },
  });

  const connected = !!status?.connected;
  const active = connected && status?.isActive;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Store className="h-4 w-4 text-admin" />
              {t("shopifyTitle")}
              {active && (
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  <CheckCircle2 className="mr-0.5 h-2.5 w-2.5 text-green-500" />
                  {t("shopifyConnected")}
                </Badge>
              )}
            </div>
            {connected && !editing && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    setDomain(status?.shopDomain || "");
                    setToken("");
                    setError(null);
                    setEditing(true);
                  }}
                >
                  {t("shopifyEditCredentials")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-red-500 hover:text-red-600"
                  onClick={() => {
                    if (confirm(t("shopifyDisconnectConfirm"))) disconnectMut.mutate();
                  }}
                  disabled={disconnectMut.isPending}
                >
                  {disconnectMut.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Link2Off className="mr-1 h-3 w-3" />
                  )}
                  {t("shopifyDisconnect")}
                </Button>
              </div>
            )}
          </div>

          <p className="mt-1 text-xs text-muted">{t("shopifyDesc")}</p>

          {isLoading ? (
            <div className="mt-4 h-8 animate-pulse rounded-lg bg-surface" />
          ) : connected && !editing ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-border bg-surface/50 p-3 text-sm">
                <p className="font-medium">{status?.shopDomain}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {active ? t("shopifyActiveBanner") : t("shopifyPausedBanner")}
                </p>
              </div>

              {status?.lastError && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{t("shopifyLastError", { error: status.lastError })}</span>
                </div>
              )}

              <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                <button
                  type="button"
                  onClick={() => toggleMut.mutate(!active)}
                  disabled={toggleMut.isPending}
                  className={
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors " +
                    (active ? "bg-admin" : "bg-border")
                  }
                >
                  <span
                    className={
                      "inline-block h-4 w-4 rounded-full bg-card transition-transform " +
                      (active ? "translate-x-6" : "translate-x-1")
                    }
                  />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {active ? t("shopifyActiveLabel") : t("shopifyPausedLabel")}
                  </p>
                  <p className="text-[11px] text-muted">{t("shopifyToggleHint")}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  {t("shopifyDomainLabel")}
                </label>
                <Input
                  placeholder={t("shopifyDomainPlaceholder")}
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  {t("shopifyTokenLabel")}
                </label>
                <Input
                  placeholder={editing ? t("shopifyTokenKeepPlaceholder") : "shpat_..."}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted">{t("shopifyTokenHint")}</p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-300/60 bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setError(null);
                    connectMut.mutate({
                      shopDomain: domain,
                      storefrontAccessToken: token,
                    });
                  }}
                  disabled={!domain.trim() || (!editing && !token.trim()) || connectMut.isPending}
                >
                  {connectMut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {editing ? t("shopifySave") : t("shopifyConnect")}
                </Button>
                {editing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(false);
                      setError(null);
                    }}
                  >
                    {t("shopifyCancel")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
