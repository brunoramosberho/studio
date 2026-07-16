// Notify the Magic super-admins when Wellhub-advance activity needs their
// action: a new draw to approve/pay, or a tenant requesting feature access.
// Channels: email to ADMIN_EMAIL (Resend) + web-push to every isSuperAdmin
// user's devices. Best-effort — callers must never fail on notification errors.

import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

const FROM = process.env.EMAIL_FROM || "hola@magicpay.mx";

export async function notifySuperAdminsOfAdvance(args: {
  kind: "draw" | "access_request";
  tenantName: string;
  tenantSlug: string;
  /** Preformatted amount ("€3,685.71") — only for kind=draw. */
  amountLabel?: string;
}) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "mgic.app";
  const url = `https://admin.${rootDomain}/tenants`;

  const title =
    args.kind === "draw"
      ? `Adelanto Wellhub solicitado — ${args.tenantName}`
      : `Solicitud de acceso a adelantos — ${args.tenantName}`;
  const body =
    args.kind === "draw"
      ? `${args.tenantName} solicitó un adelanto de ${args.amountLabel ?? ""}. Revísalo en el super-admin para aprobar y transferir.`
      : `${args.tenantName} pidió acceso al adelanto de pagos Wellhub. Habilítalo desde su página en el super-admin.`;

  // Email → the super-admin login address.
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail && process.env.RESEND_API_KEY) {
    try {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: FROM,
        to: adminEmail,
        subject: title,
        html: `<div style="font-family:Helvetica,Arial,sans-serif;max-width:440px;margin:0 auto;padding:24px;">
          <h2 style="font-size:18px;margin:0 0 12px;">${title}</h2>
          <p style="font-size:14px;color:#444;line-height:1.5;margin:0 0 20px;">${body}</p>
          <a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px;">Abrir super-admin</a>
        </div>`,
      });
    } catch (err) {
      console.error("[wellhub-advance] super-admin email failed", err);
    }
  }

  // Push → every super-admin user's registered devices (any tenant).
  try {
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true },
      select: { id: true },
    });
    await Promise.allSettled(
      superAdmins.map((u) =>
        sendPushToUser(u.id, { title, body, url, tag: `wellhub-advance-${args.tenantSlug}` }),
      ),
    );
  } catch (err) {
    console.error("[wellhub-advance] super-admin push failed", err);
  }
}
