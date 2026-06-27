"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  Loader2,
  CheckCircle2,
  Link2Off,
  AlertTriangle,
  MapPin,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";

interface ShopifyStatus {
  connected: boolean;
  adminConnected?: boolean;
  adminShopDomain?: string | null;
  posLocationId?: string | null;
  posLocationName?: string | null;
}

interface ShopifyLocation {
  id: string;
  name: string;
  isActive: boolean;
}

export function ShopifyPosCard() {
  const t = useTranslations("admin");
  const qc = useQueryClient();

  const [shopDomain, setShopDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [editingToken, setEditingToken] = useState(false);
  // null until the admin actively picks one; falls back to the saved location.
  const [pickedLocation, setPickedLocation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery<ShopifyStatus>({
    queryKey: ["admin-shopify"],
    queryFn: async () => {
      const res = await fetch("/api/admin/shop/shopify");
      if (!res.ok) throw new Error("Failed to load Shopify status");
      return res.json();
    },
  });

  const connected = !!status?.connected;
  const adminConnected = !!status?.adminConnected;

  const { data: locationsData } = useQuery<{ locations: ShopifyLocation[] }>({
    queryKey: ["admin-shopify-locations"],
    queryFn: async () => {
      const res = await fetch("/api/admin/shop/shopify/locations");
      if (!res.ok) return { locations: [] };
      return res.json();
    },
    enabled: connected && adminConnected,
    staleTime: 5 * 60 * 1000,
  });

  // Effective selection: the admin's pick, else whatever is already saved.
  const selectedLocation = pickedLocation ?? status?.posLocationId ?? "";

  const saveMut = useMutation({
    mutationFn: async (payload: {
      adminShopDomain?: string;
      adminClientId?: string;
      adminClientSecret?: string;
      posLocationId?: string;
    }) => {
      const res = await fetch("/api/admin/shop/shopify/admin", {
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
      setShopDomain("");
      setClientId("");
      setClientSecret("");
      setEditingToken(false);
      qc.invalidateQueries({ queryKey: ["admin-shopify"] });
      qc.invalidateQueries({ queryKey: ["admin-shopify-locations"] });
      qc.invalidateQueries({ queryKey: ["pos-products"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/shop/shopify/admin", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    onSuccess: () => {
      setEditingToken(false);
      qc.invalidateQueries({ queryKey: ["admin-shopify"] });
      qc.invalidateQueries({ queryKey: ["pos-products"] });
    },
  });

  // The POS integration sits on top of the Storefront connection.
  if (!isLoading && !connected) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShoppingCart className="h-4 w-4 text-admin" />
              {t("shopifyPosTitle")}
              {adminConnected && (
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  <CheckCircle2 className="mr-0.5 h-2.5 w-2.5 text-green-500" />
                  {t("shopifyConnected")}
                </Badge>
              )}
            </div>
            {adminConnected && !editingToken && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-red-500 hover:text-red-600"
                onClick={() => {
                  if (confirm(t("shopifyPosDisconnectConfirm")))
                    disconnectMut.mutate();
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
            )}
          </div>

          <p className="mt-1 text-xs text-muted">{t("shopifyPosDesc")}</p>

          {isLoading ? (
            <div className="mt-4 h-8 animate-pulse rounded-lg bg-surface" />
          ) : !adminConnected || editingToken ? (
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  {t("shopifyPosDomainLabel")}
                </label>
                <Input
                  placeholder={
                    editingToken && status?.adminShopDomain
                      ? status.adminShopDomain
                      : "tu-tienda.myshopify.com"
                  }
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted">
                  {t("shopifyPosDomainHint")}
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  {t("shopifyClientIdLabel")}
                </label>
                <Input
                  placeholder={
                    editingToken ? t("shopifyTokenKeepPlaceholder") : "a1b2c3..."
                  }
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  {t("shopifyClientSecretLabel")}
                </label>
                <Input
                  type="password"
                  placeholder={
                    editingToken ? t("shopifyTokenKeepPlaceholder") : "••••••••"
                  }
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted">
                  {t("shopifyAdminTokenHint")}
                </p>
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
                    saveMut.mutate({
                      adminShopDomain: shopDomain,
                      adminClientId: clientId,
                      adminClientSecret: clientSecret,
                    });
                  }}
                  disabled={
                    (!editingToken &&
                      (!shopDomain.trim() ||
                        !clientId.trim() ||
                        !clientSecret.trim())) ||
                    saveMut.isPending
                  }
                >
                  {saveMut.isPending && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  {editingToken ? t("shopifySave") : t("shopifyConnect")}
                </Button>
                {editingToken && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingToken(false);
                      setError(null);
                      setShopDomain("");
                      setClientId("");
                      setClientSecret("");
                    }}
                  >
                    {t("shopifyCancel")}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
                  <MapPin className="h-3.5 w-3.5" />
                  {t("shopifyPosLocationLabel")}
                </label>
                <div className="space-y-1.5">
                  {(locationsData?.locations ?? []).map((loc) => {
                    const isSel = selectedLocation === loc.id;
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => setPickedLocation(loc.id)}
                        className={
                          "flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm transition-colors " +
                          (isSel
                            ? "border-admin bg-admin/5"
                            : "border-border hover:bg-surface/50")
                        }
                      >
                        <span className="font-medium">{loc.name}</span>
                        {isSel && (
                          <CheckCircle2 className="h-4 w-4 text-admin" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-muted">
                  {t("shopifyPosLocationHint")}
                </p>
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
                    saveMut.mutate({ posLocationId: selectedLocation });
                  }}
                  disabled={
                    !selectedLocation ||
                    selectedLocation === status?.posLocationId ||
                    saveMut.isPending
                  }
                >
                  {saveMut.isPending && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  {t("shopifyPosLocationSave")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => {
                    setEditingToken(true);
                    setError(null);
                  }}
                >
                  {t("shopifyEditCredentials")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
