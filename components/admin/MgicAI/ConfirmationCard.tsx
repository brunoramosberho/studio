"use client";

import { motion } from "framer-motion";
import { ShieldCheck, X } from "lucide-react";
import { useBranding } from "@/components/branding-provider";

const TOOL_LABELS: Record<string, string> = {
  create_class: "Crear clase",
  cancel_class: "Cancelar clase",
  send_announcement: "Enviar anuncio",
  create_studio: "Crear estudio",
  create_room: "Crear sala",
  invite_coach: "Invitar coach",
  create_client: "Crear cliente",
  create_class_type: "Crear disciplina",
  create_post: "Crear post",
};

function formatParamValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const HIDDEN_PARAMS = new Set(["tenant_id", "tenantId"]);

interface ConfirmationCardProps {
  tools: { name: string; input: Record<string, unknown> }[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationCard({ tools, onConfirm, onCancel }: ConfirmationCardProps) {
  const { colorAdmin } = useBranding();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50"
    >
      <div className="flex items-center gap-2.5 border-b border-amber-200/60 px-4 py-3">
        <ShieldCheck className="h-4 w-4 text-amber-600" />
        <span className="text-[13px] font-semibold text-amber-900">
          Confirmar acción
        </span>
      </div>

      <div className="space-y-3 p-4">
        {tools.map((tool, idx) => (
          <div key={idx}>
            <p className="mb-1.5 text-[13px] font-semibold text-foreground">
              {TOOL_LABELS[tool.name] ?? tool.name}
            </p>
            <div className="space-y-1">
              {Object.entries(tool.input)
                .filter(([key]) => !HIDDEN_PARAMS.has(key))
                .map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-[12px]">
                    <span className="shrink-0 font-medium text-muted">
                      {key.replace(/_/g, " ")}:
                    </span>
                    <span className="text-foreground">
                      {formatParamValue(value)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-t border-amber-200/60 px-4 py-3">
        <button
          onClick={onConfirm}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: colorAdmin }}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Confirmar
        </button>
        <button
          onClick={onCancel}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Cancelar
        </button>
      </div>
    </motion.div>
  );
}
