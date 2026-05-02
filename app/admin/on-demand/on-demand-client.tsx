"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Video, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { OnDemandLibraryTab } from "./tabs/library-tab";
import { OnDemandConfigTab } from "./tabs/config-tab";

type TabKey = "library" | "config";

export function OnDemandAdminClient() {
  const t = useTranslations("admin.onDemand");
  const [tab, setTab] = useState<TabKey>("library");

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
      </header>

      <div className="flex items-center gap-1 border-b border-border/60">
        <TabButton
          active={tab === "library"}
          onClick={() => setTab("library")}
          icon={<Video className="h-4 w-4" />}
          label={t("tabLibrary")}
        />
        <TabButton
          active={tab === "config"}
          onClick={() => setTab("config")}
          icon={<SettingsIcon className="h-4 w-4" />}
          label={t("tabConfig")}
        />
      </div>

      {tab === "library" ? <OnDemandLibraryTab /> : <OnDemandConfigTab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-b-2 border-admin text-admin"
          : "text-muted hover:text-foreground",
      )}
      style={{ marginBottom: -1 }}
    >
      {icon}
      {label}
    </button>
  );
}
