// Generic "tell the Magic super-admins something needs their attention"
// notifier: email to ADMIN_EMAIL (Resend) + web-push to every isSuperAdmin
// user's devices. Best-effort — never throws into the caller.

import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

const FROM = process.env.EMAIL_FROM || "hola@magicpay.mx";

export async function notifySuperAdmins(args: {
  title: string;
  body: string;
  /** Extra monospace lines for the email (ids, amounts, accounts…). */
  details?: string[];
  /** Where the CTA button points. Defaults to the super-admin home. */
  url?: string;
  /** Push dedup tag. */
  tag?: string;
}) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "mgic.app";
  const url = args.url ?? `https://admin.${rootDomain}`;

  // Where operational notifications land. ADMIN_EMAIL doubles as the
  // super-admin LOGIN credential and may not be a real mailbox — set
  // SUPER_ADMIN_NOTIFY_EMAIL to a monitored inbox without touching the login.
  const adminEmail = process.env.SUPER_ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL;
  if (adminEmail && process.env.RESEND_API_KEY) {
    try {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: FROM,
        to: adminEmail,
        subject: args.title,
        html: `<div style="font-family:Helvetica,Arial,sans-serif;max-width:440px;margin:0 auto;padding:24px;">
          <h2 style="font-size:18px;margin:0 0 12px;">${args.title}</h2>
          <p style="font-size:14px;color:#444;line-height:1.5;margin:0 0 16px;">${args.body}</p>
          ${
            args.details?.length
              ? `<div style="background:#f6f6f4;border-radius:12px;padding:14px 16px;margin:0 0 20px;">
                  ${args.details
                    .map(
                      (d) =>
                        `<p style="font-size:13px;color:#333;font-family:ui-monospace,Menlo,monospace;margin:0 0 6px;">${d}</p>`,
                    )
                    .join("")}
                </div>`
              : ""
          }
          <a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px;">Abrir super-admin</a>
        </div>`,
      });
    } catch (err) {
      console.error("[super-admin-notify] email failed", err);
    }
  }

  try {
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true },
      select: { id: true },
    });
    await Promise.allSettled(
      superAdmins.map((u) =>
        sendPushToUser(u.id, { title: args.title, body: args.body, url, tag: args.tag }),
      ),
    );
  } catch (err) {
    console.error("[super-admin-notify] push failed", err);
  }
}
