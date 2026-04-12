"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { PosCustomer } from "@/store/pos-store";
import { useTranslations } from "next-intl";

interface CustomerPreviewProps {
  customer: PosCustomer;
  onClose: () => void;
}

export function CustomerPreview({ customer, onClose }: CustomerPreviewProps) {
  const t = useTranslations("pos");
  const tc = useTranslations("common");
  const initials = (customer.name ?? customer.email[0])
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold pr-6">
        {t("customer")}: {customer.name ?? t("noName")}
      </h3>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted">{t("customerName")}</p>
          <p className="text-sm font-medium">{customer.name ?? t("noName")}</p>
        </div>

        <div>
          <p className="text-xs text-muted">{t("customerEmailLabel")}</p>
          <a
            href={`mailto:${customer.email}`}
            className="text-sm font-medium text-admin hover:underline"
          >
            {customer.email}
          </a>
        </div>

        {customer.phone && (
          <div>
            <p className="text-xs text-muted">{t("contactNumber")}</p>
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
            {t("openClientProfile")}
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {tc("close")}
        </Button>
      </div>
    </div>
  );
}
