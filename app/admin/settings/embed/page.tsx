"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Code2, Check, Copy, Loader2, ExternalLink, Monitor } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function EmbedSettingsPage() {
  const t = useTranslations("embed.admin");
  const [origin, setOrigin] = useState<string>("");
  const [copied, setCopied] = useState<"script" | "iframe" | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  // Derive the tenant subdomain origin from the current admin session.
  // Both admin and public pages share the same host, so this is safe.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOrigin(window.location.origin);
  }, []);

  const scriptSnippet = useMemo(() => {
    if (!origin) return "";
    return [
      `<div id="magicstudio-schedule"></div>`,
      `<script`,
      `  src="${origin}/api/embed/loader.js"`,
      `  data-magicstudio-embed="schedule"`,
      `  data-target="#magicstudio-schedule"`,
      `  async></script>`,
    ].join("\n");
  }, [origin]);

  const iframeSnippet = useMemo(() => {
    if (!origin) return "";
    return `<iframe src="${origin}/embed/schedule" title="Schedule" style="width:100%;min-height:720px;border:0" loading="lazy"></iframe>`;
  }, [origin]);

  async function copy(snippet: string, kind: "script" | "iframe") {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(kind);
      toast.success(t("copied"));
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error(t("copyError"));
    }
  }

  if (!origin) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      {/* Recommended: script */}
      <section className="space-y-4 rounded-xl border border-border/50 bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-admin/10">
            <Code2 className="h-5 w-5 text-admin" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">{t("scriptTitle")}</h2>
            <p className="text-sm text-muted">{t("scriptDesc")}</p>
          </div>
        </div>

        <pre className="overflow-x-auto rounded-lg border border-border/50 bg-surface/80 p-4 text-[12px] leading-relaxed text-foreground/90">
          <code>{scriptSnippet}</code>
        </pre>

        <Button
          onClick={() => copy(scriptSnippet, "script")}
          className="gap-2 bg-admin hover:bg-admin/90"
        >
          {copied === "script" ? (
            <>
              <Check className="h-4 w-4" />
              {t("copied")}
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              {t("copyScript")}
            </>
          )}
        </Button>

        <ul className="space-y-1.5 rounded-lg bg-surface/60 px-4 py-3 text-[13px] text-muted">
          <li>• {t("bulletAutoResize")}</li>
          <li>• {t("bulletNoCookies")}</li>
          <li>• {t("bulletAnyDomain")}</li>
        </ul>
      </section>

      {/* Alternative: iframe */}
      <section className="space-y-4 rounded-xl border border-border/50 bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
            <Monitor className="h-5 w-5 text-muted" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">{t("iframeTitle")}</h2>
            <p className="text-sm text-muted">{t("iframeDesc")}</p>
          </div>
        </div>

        <pre className="overflow-x-auto rounded-lg border border-border/50 bg-surface/80 p-4 text-[12px] leading-relaxed text-foreground/90">
          <code>{iframeSnippet}</code>
        </pre>

        <Button
          variant="outline"
          onClick={() => copy(iframeSnippet, "iframe")}
          className="gap-2"
        >
          {copied === "iframe" ? (
            <>
              <Check className="h-4 w-4" />
              {t("copied")}
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              {t("copyIframe")}
            </>
          )}
        </Button>
      </section>

      {/* Preview */}
      <section className="space-y-4 rounded-xl border border-border/50 bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">{t("previewTitle")}</h2>
            <p className="text-sm text-muted">{t("previewDesc")}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`${origin}/embed/schedule`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("openInNewTab")}
            </a>
            <button
              onClick={() => setPreviewKey((k) => k + 1)}
              className="rounded-sm border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface"
            >
              {t("refresh")}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border/50 bg-surface">
          <iframe
            key={previewKey}
            src={`${origin}/embed/schedule`}
            title="Schedule preview"
            className="block h-[720px] w-full border-0"
          />
        </div>
      </section>
    </div>
  );
}
