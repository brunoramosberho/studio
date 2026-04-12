"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { PosCustomer } from "@/store/pos-store";

interface CustomerPreviewProps {
  customer: PosCustomer;
  onClose: () => void;
}

export function CustomerPreview({ customer, onClose }: CustomerPreviewProps) {
  const initials = (customer.name ?? customer.email[0])
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold pr-6">
        Cliente: {customer.name ?? "Sin nombre"}
      </h3>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted">Nombre del cliente</p>
          <p className="text-sm font-medium">{customer.name ?? "Sin nombre"}</p>
        </div>

        <div>
          <p className="text-xs text-muted">Email del cliente</p>
          <a
            href={`mailto:${customer.email}`}
            className="text-sm font-medium text-admin hover:underline"
          >
            {customer.email}
          </a>
        </div>

        {customer.phone && (
          <div>
            <p className="text-xs text-muted">Número de contacto</p>
            <a
              href={`tel:${customer.phone}`}
              className="text-sm font-medium text-admin hover:underline"
            >
              {customer.phone}
            </a>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/clients/${customer.id}`}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Abrir perfil del cliente
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
