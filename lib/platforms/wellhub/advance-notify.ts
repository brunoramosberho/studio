// Notify the Magic super-admins when Wellhub-advance activity needs their
// action: a new draw to approve/pay, or a tenant requesting feature access.
// Delegates to the generic super-admin notifier (email + push); best-effort —
// callers must never fail on notification errors.

import { notifySuperAdmins } from "@/lib/super-admin-notify";

export async function notifySuperAdminsOfAdvance(args: {
  kind: "draw" | "access_request";
  tenantName: string;
  tenantSlug: string;
  /** Preformatted amount ("€3,685.71") — only for kind=draw. */
  amountLabel?: string;
  /** Extra lines for the email body (amount breakdown, destination account…). */
  details?: string[];
}) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "mgic.app";

  const title =
    args.kind === "draw"
      ? `Adelanto Wellhub solicitado — ${args.tenantName}`
      : `Solicitud de acceso a adelantos — ${args.tenantName}`;
  const body =
    args.kind === "draw"
      ? `${args.tenantName} solicitó un adelanto de ${args.amountLabel ?? ""}. Revísalo en el super-admin para aprobar y transferir.`
      : `${args.tenantName} pidió acceso al adelanto de pagos Wellhub. Habilítalo desde su página en el super-admin.`;

  await notifySuperAdmins({
    title,
    body,
    details: args.details,
    url: `https://admin.${rootDomain}/tenants`,
    tag: `wellhub-advance-${args.tenantSlug}`,
  });
}
