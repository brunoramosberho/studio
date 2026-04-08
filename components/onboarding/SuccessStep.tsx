"use client";

import { CheckCircle, ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface Props {
  studioName: string;
  slug: string;
  studioId: string;
}

export function SuccessStep({ studioName, slug, studioId }: Props) {
  const [copied, setCopied] = useState(false);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "mgic.app";
  const appUrl = `https://${slug}.${rootDomain}`;
  const adminUrl = `https://${slug}.${rootDomain}/admin`;

  const copyInviteLink = () => {
    navigator.clipboard.writeText(adminUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-md text-center">
      <CheckCircle className="mx-auto h-14 w-14 text-emerald-500" />
      <h3 className="mt-4 text-xl font-bold text-gray-900">
        ¡Tenant {studioName} creado!
      </h3>
      <p className="mt-2 text-sm text-gray-500">
        El estudio ya está disponible en <span className="font-mono font-medium text-indigo-600">{slug}.{rootDomain}</span>
      </p>

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
          {copied ? "¡Copiado!" : "Copiar link"}
        </Button>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Pendiente: añadir salas en cada estudio y configurar el horario semanal
      </p>
    </div>
  );
}
