import { Resend } from "resend";
import { getTranslations } from "next-intl/server";
import { formatDate, formatTime, formatCurrency } from "./utils";
import { getServerBranding, getBrandingForTenantId } from "./branding.server";
import { type StudioBranding } from "./branding";
import { createRatingToken } from "./ratings/token";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}
const FROM = process.env.EMAIL_FROM || "hola@magicpay.mx";

function emailShell(b: Awaited<ReturnType<typeof getServerBranding>>, content: string) {
  const studioFull = `${b.studioName} Studio`;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${b.colorBg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorBg};padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;">
        <tr><td align="center" style="padding-bottom:32px;">
          ${b.logoUrl
            ? `<img src="${b.logoUrl}" alt="${b.studioName}" height="40" style="height:40px;" />`
            : `<span style="font-size:28px;font-weight:700;color:${b.colorFg};letter-spacing:-0.5px;">${b.studioName}</span>`}
        </td></tr>
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;">
            <tr><td style="padding:40px 32px;">
              ${content}
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:11px;color:${b.colorMuted};opacity:0.7;">
            ${studioFull} &mdash; ${b.slogan}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendBookingConfirmation({
  to,
  name,
  className,
  coachName,
  date,
  startTime,
  location,
  timezone,
  classUrl,
  locale,
}: {
  to: string;
  name: string;
  className: string;
  coachName: string | null;
  date: Date;
  startTime: Date;
  location?: string;
  timezone?: string;
  classUrl?: string;
  locale?: string;
}) {
  try {
    const b = await getServerBranding();
    const studioFull = `${b.studioName} Studio`;
    const loc = locale || "es";
    const t = await getTranslations({ locale: loc, namespace: "email" });
    const tb = await getTranslations({ locale: loc, namespace: "booking" });

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:#dcfce7;line-height:56px;font-size:28px;">&#10003;</div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${b.colorFg};">
          ${t("bookingConfirmTitle")}
        </h1>
        <p style="margin:0;font-size:14px;color:${b.colorMuted};">
          ${t("hello", { name })}, ${t("classReady")}
        </p>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorBg};border-radius:14px;margin-bottom:24px;">
        <tr><td style="padding:20px 24px;">
          <h2 style="margin:0 0 12px;font-size:18px;font-weight:700;color:${b.colorAccent};">${className}</h2>
          <table cellpadding="0" cellspacing="0" style="font-size:14px;color:${b.colorFg};">
            <tr>
              <td style="padding:3px 0;"><strong>${t("date")}</strong></td>
              <td style="padding:3px 0 3px 16px;">${formatDate(date, loc)}</td>
            </tr>
            <tr>
              <td style="padding:3px 0;"><strong>${t("time")}</strong></td>
              <td style="padding:3px 0 3px 16px;">${formatTime(startTime, timezone)}</td>
            </tr>
            ${coachName ? `<tr>
              <td style="padding:3px 0;"><strong>${t("coach")}</strong></td>
              <td style="padding:3px 0 3px 16px;">${coachName}</td>
            </tr>` : ""}
            ${location ? `<tr>
              <td style="padding:3px 0;"><strong>${t("location")}</strong></td>
              <td style="padding:3px 0 3px 16px;">${location}</td>
            </tr>` : ""}
          </table>
        </td></tr>
      </table>

      ${classUrl ? `
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${classUrl}" target="_blank" style="display:inline-block;background:${b.colorFg};color:${b.colorBg};text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:50px;letter-spacing:0.3px;">
          ${t("viewBooking")}
        </a>
      </div>
      ` : ""}

      <p style="margin:0;font-size:12px;color:${b.colorMuted};text-align:center;line-height:1.5;">
        ${t("cancellationPolicy")}
      </p>`;

    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: tb("confirmationSubject", { className, date: formatDate(date, loc) }),
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send booking confirmation:", error);
  }
}

export async function sendClassCancelled({
  to,
  name,
  className,
  coachName,
  date,
  startTime,
  location,
  timezone,
  creditRefunded,
  locale,
}: {
  to: string;
  name: string;
  className: string;
  coachName: string | null;
  date: Date;
  startTime: Date;
  location?: string;
  timezone?: string;
  creditRefunded: boolean;
  locale?: string;
}) {
  try {
    const b = await getServerBranding();
    const studioFull = `${b.studioName} Studio`;
    const loc = locale || "es";
    const t = await getTranslations({ locale: loc, namespace: "email" });

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:#fef2f2;line-height:56px;font-size:28px;">&#10007;</div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${b.colorFg};">
          ${t("classCancelledTitle")}
        </h1>
        <p style="margin:0;font-size:14px;color:${b.colorMuted};">
          ${t("hello", { name })}, ${t("classCancelledMsg")}
        </p>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorBg};border-radius:14px;margin-bottom:24px;">
        <tr><td style="padding:20px 24px;">
          <h2 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#dc2626;">${className}</h2>
          <table cellpadding="0" cellspacing="0" style="font-size:14px;color:${b.colorFg};">
            <tr>
              <td style="padding:3px 0;"><strong>${t("date")}</strong></td>
              <td style="padding:3px 0 3px 16px;">${formatDate(date, loc)}</td>
            </tr>
            <tr>
              <td style="padding:3px 0;"><strong>${t("time")}</strong></td>
              <td style="padding:3px 0 3px 16px;">${formatTime(startTime, timezone)}</td>
            </tr>
            ${coachName ? `<tr>
              <td style="padding:3px 0;"><strong>${t("coach")}</strong></td>
              <td style="padding:3px 0 3px 16px;">${coachName}</td>
            </tr>` : ""}
            ${location ? `<tr>
              <td style="padding:3px 0;"><strong>${t("location")}</strong></td>
              <td style="padding:3px 0 3px 16px;">${location}</td>
            </tr>` : ""}
          </table>
        </td></tr>
      </table>

      <div style="text-align:center;padding:16px;background:${creditRefunded ? "#dcfce7" : "#fef9c3"};border-radius:12px;margin-bottom:16px;">
        <p style="margin:0;font-size:13px;font-weight:600;color:${creditRefunded ? "#15803d" : "#a16207"};">
          ${creditRefunded ? t("creditRefundedMsg") : t("creditNotRefundedMsg")}
        </p>
      </div>`;

    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: t("classCancelledSubject", { className }),
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send class cancelled email:", error);
  }
}

export function getTenantBaseUrl(tenantSlug: string) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
  const protocol = rootDomain.includes("localhost") ? "http" : "https";
  return `${protocol}://${tenantSlug}.${rootDomain}`;
}

export async function sendWaiverReminder({
  to,
  name,
  signUrl,
  branding,
}: {
  to: string;
  name: string;
  signUrl: string;
  branding: StudioBranding;
}) {
  try {
    const b = branding;
    const studioFull = `${b.studioName} Studio`;
    const firstName = name?.split(" ")[0] || "";

    const content = `
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${b.colorFg};">
        Firma pendiente
      </h1>
      <p style="margin:0 0 24px;font-size:14px;color:${b.colorMuted};line-height:1.6;">
        ${firstName ? `Hola ${firstName}, tienes` : "Tienes"} una reserva próxima en ${b.studioName}. 
        Para asistir necesitas firmar el acuerdo de responsabilidad. Solo toma un minuto.
      </p>

      <div style="text-align:center;margin-bottom:24px;">
        <a href="${signUrl}" target="_blank" style="display:inline-block;background:${b.colorFg};color:${b.colorBg};text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:50px;letter-spacing:0.3px;">
          Firmar ahora
        </a>
      </div>

      <p style="margin:0;font-size:12px;color:${b.colorMuted};text-align:center;line-height:1.5;">
        Si ya firmaste, puedes ignorar este correo.
      </p>`;

    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: `Firma pendiente — ${b.studioName}`,
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send waiver reminder:", error);
  }
}

export async function sendWelcomeEmail({
  to,
  name,
  appUrl,
}: {
  to: string;
  name: string;
  appUrl: string;
}) {
  try {
    const b = await getServerBranding();
    const studioFull = `${b.studioName} Studio`;
    const firstName = name.split(" ")[0];

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:${b.colorAccent}15;line-height:56px;font-size:28px;">&#128075;</div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${b.colorFg};">
          ¡Bienvenido/a, ${firstName}!
        </h1>
        <p style="margin:0;font-size:14px;color:${b.colorMuted};line-height:1.5;">
          Ya eres parte de <strong style="color:${b.colorFg};">${studioFull}</strong>. Tu primera clase ya está reservada.
        </p>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorBg};border-radius:14px;margin-bottom:24px;">
        <tr><td style="padding:24px;text-align:center;">
          <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:${b.colorFg};">
            &#128241; Instala la app en tu celular
          </p>
          <p style="margin:0;font-size:13px;color:${b.colorMuted};line-height:1.5;">
            Abre el enlace de abajo en Safari o Chrome, toca <strong>Compartir</strong> y luego <strong>"Agregar a pantalla de inicio"</strong> para tenerla siempre a la mano.
          </p>
        </td></tr>
      </table>

      <div style="text-align:center;margin-bottom:24px;">
        <a href="${appUrl}" target="_blank" style="display:inline-block;background:${b.colorFg};color:${b.colorBg};text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:50px;letter-spacing:0.3px;">
          Abrir mi espacio
        </a>
      </div>

      <p style="margin:0;font-size:12px;color:${b.colorMuted};text-align:center;line-height:1.5;">
        Inicia sesión con este correo (${to}) usando Google o el enlace mágico.
      </p>`;

    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: `¡Bienvenido/a a ${studioFull}! 🎉`,
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send welcome email:", error);
  }
}

export async function sendClassReminder({
  to,
  name,
  className,
  startTime,
  timezone,
}: {
  to: string;
  name: string;
  className: string;
  startTime: Date;
  timezone?: string;
}) {
  try {
    const b = await getServerBranding();
    const studioFull = `${b.studioName} Studio`;

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:${b.colorAccent}15;line-height:56px;font-size:28px;">&#128170;</div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${b.colorFg};">
          Tu clase es hoy
        </h1>
        <p style="margin:0;font-size:14px;color:${b.colorMuted};">
          Hola ${name}, te esperamos.
        </p>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorBg};border-radius:14px;">
        <tr><td style="padding:20px 24px;text-align:center;">
          <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;color:${b.colorAccent};">${className}</h2>
          <p style="margin:0;font-size:15px;color:${b.colorFg};font-weight:600;">
            ${formatTime(startTime, timezone)}
          </p>
        </td></tr>
      </table>`;

    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: `Recordatorio: ${className} hoy a las ${formatTime(startTime, timezone)}`,
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send class reminder:", error);
  }
}

export async function sendWaitlistPromotion({
  to,
  name,
  className,
  coachName,
  date,
  startTime,
  location,
  timezone,
}: {
  to: string;
  name: string;
  className: string;
  coachName: string | null;
  date: Date;
  startTime: Date;
  location?: string;
  timezone?: string;
}) {
  try {
    const b = await getServerBranding();
    const studioFull = `${b.studioName} Studio`;

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:#dcfce7;line-height:56px;font-size:28px;">&#127881;</div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${b.colorFg};">
          ¡Entraste a la clase!
        </h1>
        <p style="margin:0;font-size:14px;color:${b.colorMuted};">
          Hola ${name}, se liberó un lugar y ya tienes tu reserva confirmada.
        </p>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorBg};border-radius:14px;margin-bottom:24px;">
        <tr><td style="padding:20px 24px;">
          <h2 style="margin:0 0 12px;font-size:18px;font-weight:700;color:${b.colorAccent};">${className}</h2>
          <table cellpadding="0" cellspacing="0" style="font-size:14px;color:${b.colorFg};">
            <tr>
              <td style="padding:3px 0;"><strong>Fecha</strong></td>
              <td style="padding:3px 0 3px 16px;">${formatDate(date)}</td>
            </tr>
            <tr>
              <td style="padding:3px 0;"><strong>Hora</strong></td>
              <td style="padding:3px 0 3px 16px;">${formatTime(startTime, timezone)}</td>
            </tr>
            ${coachName ? `<tr>
              <td style="padding:3px 0;"><strong>Coach</strong></td>
              <td style="padding:3px 0 3px 16px;">${coachName}</td>
            </tr>` : ""}
            ${location ? `<tr>
              <td style="padding:3px 0;"><strong>Estudio</strong></td>
              <td style="padding:3px 0 3px 16px;">${location}</td>
            </tr>` : ""}
          </table>
        </td></tr>
      </table>

      <p style="margin:0;font-size:12px;color:${b.colorMuted};text-align:center;line-height:1.5;">
        Puedes cancelar hasta 12 horas antes de tu clase para recuperar tu crédito.
      </p>`;

    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: `¡Entraste a la clase! ${className} — ${formatDate(date)}`,
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send waitlist promotion email:", error);
  }
}

export async function sendSpotAvailable({
  to,
  name,
  className,
  coachName,
  date,
  startTime,
  location,
  timezone,
  classUrl,
}: {
  to: string;
  name: string;
  className: string;
  coachName: string | null;
  date: Date;
  startTime: Date;
  location?: string;
  timezone?: string;
  classUrl: string;
}) {
  try {
    const b = await getServerBranding();
    const studioFull = `${b.studioName} Studio`;

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:${b.colorAccent}15;line-height:56px;font-size:28px;">&#128276;</div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${b.colorFg};">
          ¡Se abrió un lugar!
        </h1>
        <p style="margin:0;font-size:14px;color:${b.colorMuted};line-height:1.5;">
          Hola ${name}, se liberó un espacio en la clase que te interesaba.
        </p>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorBg};border-radius:14px;margin-bottom:24px;">
        <tr><td style="padding:20px 24px;">
          <h2 style="margin:0 0 12px;font-size:18px;font-weight:700;color:${b.colorAccent};">${className}</h2>
          <table cellpadding="0" cellspacing="0" style="font-size:14px;color:${b.colorFg};">
            <tr>
              <td style="padding:3px 0;"><strong>Fecha</strong></td>
              <td style="padding:3px 0 3px 16px;">${formatDate(date)}</td>
            </tr>
            <tr>
              <td style="padding:3px 0;"><strong>Hora</strong></td>
              <td style="padding:3px 0 3px 16px;">${formatTime(startTime, timezone)}</td>
            </tr>
            ${coachName ? `<tr>
              <td style="padding:3px 0;"><strong>Coach</strong></td>
              <td style="padding:3px 0 3px 16px;">${coachName}</td>
            </tr>` : ""}
            ${location ? `<tr>
              <td style="padding:3px 0;"><strong>Estudio</strong></td>
              <td style="padding:3px 0 3px 16px;">${location}</td>
            </tr>` : ""}
          </table>
        </td></tr>
      </table>

      <div style="text-align:center;margin-bottom:16px;">
        <a href="${classUrl}" target="_blank" style="display:inline-block;background:${b.colorFg};color:${b.colorBg};text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:50px;letter-spacing:0.3px;">
          Reservar mi lugar
        </a>
      </div>

      <p style="margin:0;font-size:12px;color:${b.colorMuted};text-align:center;line-height:1.5;">
        ¡Date prisa! Resérvalo antes de que alguien más lo tome.
      </p>`;

    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: `¡Se abrió un lugar en ${className}! — ${formatDate(date)}`,
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send spot available email:", error);
  }
}

export async function sendRoleInvitation({
  to,
  role,
  invitedBy,
  loginUrl,
}: {
  to: string;
  role: "ADMIN" | "FRONT_DESK" | "COACH";
  invitedBy: string;
  loginUrl: string;
}) {
  try {
    const b = await getServerBranding();
    const studioFull = `${b.studioName} Studio`;

    const roleLabel = role === "ADMIN" ? "Administrador" : "Coach";
    const roleColor = role === "ADMIN" ? b.colorAdmin : b.colorCoach;
    const emoji = role === "ADMIN" ? "&#128272;" : "&#127947;";
    const description =
      role === "ADMIN"
        ? "gestionar el estudio, ver reportes y administrar el equipo"
        : "dar clases, ver tu agenda y conectar con tus alumnos";

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:${roleColor}15;line-height:56px;font-size:28px;">${emoji}</div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${b.colorFg};">
          ¡Estás invitado!
        </h1>
        <p style="margin:0;font-size:14px;color:${b.colorMuted};line-height:1.5;">
          <strong style="color:${b.colorFg};">${invitedBy}</strong> te ha invitado a unirte a
          <strong style="color:${b.colorFg};">${studioFull}</strong>
        </p>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorBg};border-radius:14px;margin-bottom:24px;">
        <tr><td style="padding:20px 24px;text-align:center;">
          <div style="display:inline-block;background:${roleColor}20;color:${roleColor};font-size:13px;font-weight:700;padding:6px 16px;border-radius:20px;letter-spacing:0.5px;">
            ${roleLabel}
          </div>
          <p style="margin:12px 0 0;font-size:14px;color:${b.colorFg};line-height:1.5;">
            Como ${roleLabel.toLowerCase()} podrás ${description}.
          </p>
        </td></tr>
      </table>

      <div style="text-align:center;margin-bottom:24px;">
        <a href="${loginUrl}" target="_blank" style="display:inline-block;background:${b.colorFg};color:${b.colorBg};text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:50px;letter-spacing:0.3px;">
          Acceder a la plataforma
        </a>
      </div>

      <p style="margin:0;font-size:12px;color:${b.colorMuted};text-align:center;line-height:1.5;">
        Inicia sesión con este correo electrónico (${to}) usando Google o el enlace mágico.
      </p>`;

    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: `Te invitaron como ${roleLabel} a ${studioFull}`,
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send role invitation:", error);
  }
}

export async function sendAchievementUnlocked({
  to,
  name,
  achievementName,
  achievementIcon,
  achievementDescription,
  rewardText,
  tenantId,
}: {
  to: string;
  name: string;
  achievementName: string;
  achievementIcon: string;
  achievementDescription: string;
  rewardText: string | null;
  tenantId?: string;
}) {
  try {
    const b = tenantId
      ? await getBrandingForTenantId(tenantId)
      : await getServerBranding();
    const studioFull = `${b.studioName} Studio`;

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:${b.colorAccent}15;line-height:64px;font-size:32px;">${achievementIcon}</div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${b.colorFg};">
          ¡Logro desbloqueado!
        </h1>
        <p style="margin:0;font-size:14px;color:${b.colorMuted};">
          Hola ${name}, acabas de conseguir un nuevo logro.
        </p>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorBg};border-radius:14px;margin-bottom:24px;">
        <tr><td style="padding:24px;text-align:center;">
          <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:${b.colorFg};">
            ${achievementIcon} ${achievementName}
          </p>
          <p style="margin:0;font-size:14px;color:${b.colorMuted};line-height:1.5;">
            ${achievementDescription}
          </p>
        </td></tr>
      </table>

      ${rewardText ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#dcfce7;border-radius:14px;margin-bottom:24px;">
        <tr><td style="padding:16px 24px;text-align:center;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#166534;">
            🎁 ${rewardText}
          </p>
        </td></tr>
      </table>
      ` : ""}

      <p style="margin:0;font-size:12px;color:${b.colorMuted};text-align:center;line-height:1.5;">
        Sigue así — cada clase te acerca a más logros y premios.
      </p>`;

    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: `${achievementIcon} ¡Logro: "${achievementName}"!`,
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send achievement email:", error);
  }
}

export async function sendLevelUp({
  to,
  name,
  levelName,
  levelIcon,
  rewardText,
  tenantId,
}: {
  to: string;
  name: string;
  levelName: string;
  levelIcon: string;
  rewardText: string | null;
  tenantId?: string;
}) {
  try {
    const b = tenantId
      ? await getBrandingForTenantId(tenantId)
      : await getServerBranding();
    const studioFull = `${b.studioName} Studio`;

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:${b.colorAccent}15;line-height:64px;font-size:36px;">${levelIcon}</div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${b.colorFg};">
          ¡Subiste a ${levelName}!
        </h1>
        <p style="margin:0;font-size:14px;color:${b.colorMuted};">
          Hola ${name}, tu dedicación ha dado frutos.
        </p>
      </div>

      ${rewardText ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#dcfce7;border-radius:14px;margin-bottom:24px;">
        <tr><td style="padding:16px 24px;text-align:center;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#166534;">
            🎁 ${rewardText}
          </p>
        </td></tr>
      </table>
      ` : ""}

      <p style="margin:0;font-size:12px;color:${b.colorMuted};text-align:center;line-height:1.5;">
        Sigue asistiendo para alcanzar el siguiente nivel.
      </p>`;

    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: `${levelIcon} ¡Subiste a ${levelName}!`,
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send level-up email:", error);
  }
}

export async function sendSavingsNudgeEmail({
  to,
  memberName,
  classesBought,
  totalSpent,
  membershipPrice,
  savingsAmount,
  currency,
  membershipUrl,
}: {
  to: string;
  memberName: string;
  classesBought: number;
  totalSpent: number;
  membershipPrice: number;
  savingsAmount: number;
  currency: string;
  membershipUrl: string;
}) {
  try {
    const b = await getServerBranding();
    const studioFull = `${b.studioName} Studio`;
    const firstName = memberName.split(" ")[0];

    const fmtTotal = formatCurrency(totalSpent, currency);
    const fmtMembership = formatCurrency(membershipPrice, currency);
    const fmtSavings = formatCurrency(savingsAmount, currency);

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:#dcfce7;line-height:56px;font-size:28px;">&#128176;</div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${b.colorFg};">
          ${firstName}, ¿sabías que podrías pagar menos?
        </h1>
        <p style="margin:0;font-size:14px;color:${b.colorMuted};line-height:1.5;">
          Este mes llevas ${classesBought} clases. Los números no mienten.
        </p>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorBg};border-radius:14px;margin-bottom:16px;">
        <tr><td style="padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:${b.colorFg};">
            <tr>
              <td style="padding:4px 0;"><strong>Clases este mes</strong></td>
              <td style="padding:4px 0;text-align:right;font-weight:600;">${classesBought}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;"><strong>Has pagado</strong></td>
              <td style="padding:4px 0;text-align:right;font-weight:600;">${fmtTotal}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;"><strong>Mensual costaría</strong></td>
              <td style="padding:4px 0;text-align:right;font-weight:600;">${fmtMembership}</td>
            </tr>
          </table>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#dcfce7;border-radius:14px;margin-bottom:24px;">
        <tr><td style="padding:16px 24px;text-align:center;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#166534;">
            Ahorrarías ${fmtSavings} al mes
          </p>
        </td></tr>
      </table>

      <div style="text-align:center;margin-bottom:24px;">
        <a href="${membershipUrl}" target="_blank" style="display:inline-block;background:${b.colorFg};color:${b.colorBg};text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:50px;letter-spacing:0.3px;">
          Ver membresía mensual
        </a>
      </div>

      <p style="margin:0;font-size:11px;color:${b.colorMuted};text-align:center;line-height:1.5;">
        Si no quieres recibir estos correos, puedes ignorar este mensaje.
      </p>`;

    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: `${firstName}, ¿sabías que podrías pagar menos?`,
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send savings nudge email:", error);
  }
}

export async function sendRatingRequestEmail({
  to,
  name,
  userId,
  classId,
  tenantId,
  className,
  coachName,
  coachPhotoUrl,
  startTime,
  timezone,
  tenantSlug,
}: {
  to: string;
  name: string;
  userId: string;
  classId: string;
  tenantId: string;
  className: string;
  coachName: string;
  coachPhotoUrl?: string | null;
  startTime: Date;
  timezone?: string;
  tenantSlug: string;
}) {
  try {
    const b = await getServerBranding();
    const studioFull = `${b.studioName} Studio`;
    const firstName = name.split(" ")[0];
    const baseUrl = getTenantBaseUrl(tenantSlug);

    const links = await Promise.all(
      [1, 2, 3, 4, 5].map(async (r) => ({
        rating: r,
        url: `${baseUrl}/rate?token=${await createRatingToken({
          userId,
          classId,
          tenantId,
          rating: r,
        })}`,
      }))
    );

    const starsHtml = links
      .map(
        (l) =>
          `<a href="${l.url}" target="_blank" style="display:inline-block;padding:8px 6px;font-size:36px;text-decoration:none;color:#F5A623;line-height:1;">&#9733;</a>`
      )
      .join("");

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${b.colorFg};">
          ${firstName}, ¿cómo te hicimos sentir?
        </h1>
        <p style="margin:0;font-size:14px;color:${b.colorMuted};">
          Tu opinión nos ayuda a mejorar cada clase.
        </p>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorBg};border-radius:14px;margin-bottom:24px;">
        <tr><td style="padding:12px 16px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:10px;">
              ${coachPhotoUrl
                ? `<img src="${coachPhotoUrl}" alt="${coachName}" width="36" height="36" style="width:36px;height:36px;border-radius:50%;object-fit:cover;" />`
                : `<div style="width:36px;height:36px;border-radius:50%;background:${b.colorAccent};color:#fff;font-size:14px;font-weight:600;text-align:center;line-height:36px;">${coachName.charAt(0)}</div>`}
            </td>
            <td style="vertical-align:middle;">
              <p style="margin:0;font-size:14px;font-weight:600;color:${b.colorFg};">${className}</p>
              <p style="margin:0;font-size:12px;color:${b.colorMuted};">${coachName} · ${formatTime(startTime, timezone)}</p>
            </td>
          </tr></table>
        </td></tr>
      </table>

      <div style="text-align:center;margin-bottom:24px;">
        ${starsHtml}
      </div>

      <p style="margin:0;font-size:11px;color:${b.colorMuted};text-align:center;line-height:1.5;">
        Al tocar una estrella guardamos tu opinión automáticamente. No necesitas abrir ninguna app.
      </p>`;

    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: `${firstName}, ¿cómo estuvo tu clase?`,
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send rating request email:", error);
  }
}

export async function sendPosReceiptEmail({
  to,
  customerName,
  items,
  total,
  currency,
  paymentMethod,
  studioUrl,
}: {
  to: string;
  customerName: string;
  items: { name: string; quantity: number; price: number; currency: string }[];
  total: number;
  currency: string;
  paymentMethod: "saved_card" | "terminal" | "cash";
  studioUrl: string;
}) {
  try {
    const b = await getServerBranding();
    const studioFull = `${b.studioName} Studio`;
    const firstName = customerName.split(" ")[0];

    const paymentLabels: Record<string, string> = {
      saved_card: "Tarjeta guardada",
      terminal: "Terminal bancaria",
      cash: "Efectivo",
    };

    const itemsHtml = items
      .map(
        (item) => `
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${b.colorFg};">
            ${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}
          </td>
          <td style="padding:6px 0;font-size:14px;color:${b.colorFg};text-align:right;font-weight:600;">
            ${item.price > 0 ? formatCurrency(item.price * item.quantity, item.currency) : "Gratis"}
          </td>
        </tr>`,
      )
      .join("");

    const content = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:#dcfce7;line-height:56px;font-size:28px;">&#9989;</div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${b.colorFg};">
          Recibo de compra
        </h1>
        <p style="margin:0;font-size:14px;color:${b.colorMuted};">
          Hola ${firstName}, aquí tienes el detalle de tu compra.
        </p>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorBg};border-radius:14px;margin-bottom:16px;">
        <tr><td style="padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${itemsHtml}
          </table>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.colorFg};border-radius:14px;margin-bottom:16px;">
        <tr><td style="padding:16px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:16px;font-weight:700;color:${b.colorBg};">Total</td>
              <td style="font-size:16px;font-weight:700;color:${b.colorBg};text-align:right;">
                ${total > 0 ? formatCurrency(total, currency) : "Gratis"}
              </td>
            </tr>
          </table>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="font-size:12px;color:${b.colorMuted};">Método de pago</td>
          <td style="font-size:12px;color:${b.colorFg};text-align:right;font-weight:600;">
            ${paymentLabels[paymentMethod] ?? paymentMethod}
          </td>
        </tr>
        <tr>
          <td style="padding-top:4px;font-size:12px;color:${b.colorMuted};">Fecha</td>
          <td style="padding-top:4px;font-size:12px;color:${b.colorFg};text-align:right;font-weight:600;">
            ${formatDate(new Date())}
          </td>
        </tr>
      </table>

      <div style="text-align:center;margin-bottom:24px;">
        <a href="${studioUrl}" target="_blank" style="display:inline-block;background:${b.colorFg};color:${b.colorBg};text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:50px;letter-spacing:0.3px;">
          Ir a ${b.studioName}
        </a>
      </div>

      <p style="margin:0;font-size:11px;color:${b.colorMuted};text-align:center;line-height:1.5;">
        Si tienes alguna pregunta sobre esta compra, contacta directamente al estudio.
      </p>`;

    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: `Recibo de compra — ${studioFull}`,
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send POS receipt email:", error);
  }
}
