"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Check, Unplug, ChevronRight, Watch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface WearableStatus {
  connected: boolean;
  providerUserId?: string;
  connectedAt?: string;
}

type WearablesMap = Record<string, WearableStatus>;

const STRAVA_ORANGE = "#FC4C02";

function StravaLogo({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116zm-3.08-8.399l2.086 4.116h3.065L12.304 3.614v.001l-5.154 10.172h3.066l2.091-4.242z" />
    </svg>
  );
}

export function WearableConnections({ grouped }: { grouped?: boolean } = {}) {
  const t = useTranslations("wearables");
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);

  const { data: wearables, isLoading } = useQuery<WearablesMap>({
    queryKey: ["wearables", "status"],
    queryFn: async () => {
      const res = await fetch("/api/wearables/status");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/strava/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wearables", "status"] });
      toast.success(t("stravaDisconnected"));
    },
    onError: () => {
      toast.error(t("stravaDisconnectError"));
    },
  });

  useEffect(() => {
    const stravaParam = searchParams.get("strava");
    if (stravaParam === "connected") {
      toast.success(t("stravaConnected"));
      queryClient.invalidateQueries({ queryKey: ["wearables", "status"] });
      setExpanded(true);
    } else if (stravaParam === "denied") {
      toast.error(t("stravaDenied"));
    } else if (stravaParam === "error") {
      toast.error(t("stravaError"));
    }
  }, [searchParams, queryClient]);

  const stravaStatus = wearables?.STRAVA;
  const isConnected = stravaStatus?.connected === true;

  return (
    <>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center gap-3 px-4 text-left transition-colors",
          grouped ? "py-3 active:bg-surface/50" : "rounded-xl py-3.5 active:bg-surface",
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface">
          <Watch className="h-4 w-4 text-foreground" />
        </div>
        <span className="flex-1 text-[15px] font-medium text-foreground">
          {t("connectedApps")}
        </span>
        {isConnected && (
          <span className="mr-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-100 px-1.5 text-[11px] font-semibold text-green-700">
            1
          </span>
        )}
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted transition-transform",
            expanded && "rotate-90",
          )}
        />
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="px-4 pb-2 pt-1">
            <div className="rounded-xl border border-border/50 bg-white p-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${STRAVA_ORANGE}15` }}
                >
                  <StravaLogo className="h-5 w-5" style={{ color: STRAVA_ORANGE }} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-foreground">Strava</p>
                  {isLoading ? (
                    <Loader2 className="mt-0.5 h-3 w-3 animate-spin text-muted" />
                  ) : isConnected ? (
                    <p className="text-[11px] text-green-600 font-medium flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      {t("connected")}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted">
                      {t("syncActivity")}
                    </p>
                  )}
                </div>

                {isLoading ? null : isConnected ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full text-[12px] text-muted hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      disconnectMutation.mutate();
                    }}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Unplug className="mr-1 h-3 w-3" />
                        {t("disconnect")}
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 rounded-full text-[12px]"
                    style={{ backgroundColor: STRAVA_ORANGE }}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.href = "/api/auth/strava";
                    }}
                  >
                    {t("connect")}
                  </Button>
                )}
              </div>

              {isConnected && (
                <p className="mt-2 text-[10px] text-muted pl-[52px]">
                  {t("syncDescription")}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
}
