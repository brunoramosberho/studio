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
    <div className="mx-auto w-full max-w-3xl space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-display text-xl font-bold sm:text-2xl">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      {/* Recommended: script */}
      <section className="space-y-4 rounded-xl border border-border/50 bg-card p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-admin/10">
            <Code2 className="h-5 w-5 text-admin" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold sm:text-lg">
              {t("scriptTitle")}
            </h2>
            <p className="text-sm text-muted">{t("scriptDesc")}</p>
          </div>
        </div>

        <pre className="max-w-full overflow-x-auto rounded-lg border border-border/50 bg-surface/80 p-3 text-[11px] leading-relaxed text-foreground/90 sm:p-4 sm:text-[12px]">
          <code className="whitespace-pre">{scriptSnippet}</code>
        </pre>

        <Button
          onClick={() => copy(scriptSnippet, "script")}
          className="w-full gap-2 bg-admin hover:bg-admin/90 sm:w-auto"
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

        <ul className="space-y-1.5 rounded-lg bg-surface/60 px-3 py-3 text-[12px] text-muted sm:px-4 sm:text-[13px]">
          <li>• {t("bulletAutoResize")}</li>
          <li>• {t("bulletNoCookies")}</li>
          <li>• {t("bulletAnyDomain")}</li>
        </ul>
      </section>

      {/* Alternative: iframe */}
      <section className="space-y-4 rounded-xl border border-border/50 bg-card p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface">
            <Monitor className="h-5 w-5 text-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold sm:text-lg">
              {t("iframeTitle")}
            </h2>
            <p className="text-sm text-muted">{t("iframeDesc")}</p>
          </div>
        </div>

        <pre className="max-w-full overflow-x-auto rounded-lg border border-border/50 bg-surface/80 p-3 text-[11px] leading-relaxed text-foreground/90 sm:p-4 sm:text-[12px]">
          <code className="whitespace-pre">{iframeSnippet}</code>
        </pre>

        <Button
          variant="outline"
          onClick={() => copy(iframeSnippet, "iframe")}
          className="w-full gap-2 sm:w-auto"
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
      <section className="space-y-4 rounded-xl border border-border/50 bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold sm:text-lg">
              {t("previewTitle")}
            </h2>
            <p className="text-sm text-muted">{t("previewDesc")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            className="block h-[560px] w-full border-0 sm:h-[720px]"
          />
        </div>
      </section>
    </div>
  );
}
