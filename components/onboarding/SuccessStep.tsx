"use client";

import { CheckCircle, ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface Summary {
  classTypes: number;
  coaches: number;
  rooms: number;
  pastClasses: number;
  futureClasses: number;
  demoUsers: number;
  bookings: number;
  feedEvents: number;
}

interface Props {
  studioName: string;
  slug: string;
  studioId: string;
  summary?: Summary | null;
}

export function SuccessStep({ studioName, slug, summary }: Props) {
  const [copied, setCopied] = useState(false);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "mgic.app";
  const appUrl = `https://${slug}.${rootDomain}`;
  const adminUrl = `https://${slug}.${rootDomain}/admin`;

  const copyInviteLink = () => {
    navigator.clipboard.writeText(appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-lg text-center">
      <CheckCircle className="mx-auto h-14 w-14 text-emerald-500" />
      <h3 className="mt-4 text-xl font-bold text-gray-900">
        {studioName} creado!
      </h3>
      <p className="mt-2 text-sm text-gray-500">
        El estudio ya está disponible en{" "}
        <span className="font-mono font-medium text-indigo-600">
          {slug}.{rootDomain}
        </span>
      </p>

      {summary && (
        <div className="mt-6 grid grid-cols-4 gap-3 rounded-xl bg-gray-50 p-4">
          <div>
            <p className="text-2xl font-bold text-gray-900">{summary.classTypes}</p>
            <p className="text-xs text-gray-500">Disciplinas</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{summary.coaches}</p>
            <p className="text-xs text-gray-500">Coaches</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {summary.pastClasses + summary.futureClasses}
            </p>
            <p className="text-xs text-gray-500">Clases</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{summary.feedEvents}</p>
            <p className="text-xs text-gray-500">Posts en feed</p>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Button asChild variant="outline" className="gap-2">
          <a href={adminUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir admin
          </a>
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <a href={appUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Ver app
          </a>
        </Button>
        <Button variant="outline" className="gap-2" onClick={copyInviteLink}>
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copiado!" : "Copiar link"}
        </Button>
      </div>

      {summary && (
        <p className="mt-4 text-xs text-gray-400">
          {summary.demoUsers} usuarios demo, {summary.bookings} reservas y {summary.feedEvents} eventos
          de feed fueron generados para que la cuenta se vea activa.
        </p>
      )}
    </div>
  );
}
