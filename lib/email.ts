import { Resend } from "resend";
import { formatDate, formatTime } from "./utils";
import { getServerBranding } from "./branding.server";

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
}: {
  to: string;
  name: string;
  className: string;
  coachName: string;
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
        <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:#dcfce7;line-height:56px;font-size:28px;">&#10003;</div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${b.colorFg};">
          ¡Reserva confirmada!
        </h1>
        <p style="margin:0;font-size:14px;color:${b.colorMuted};">
          Hola ${name}, tu clase está lista.
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
            <tr>
              <td style="padding:3px 0;"><strong>Coach</strong></td>
              <td style="padding:3px 0 3px 16px;">${coachName}</td>
            </tr>
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
      subject: `Confirmación: ${className} — ${formatDate(date)}`,
      html: emailShell(b, content),
    });
  } catch (error) {
    console.error("Failed to send booking confirmation:", error);
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
  coachName: string;
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
            <tr>
              <td style="padding:3px 0;"><strong>Coach</strong></td>
              <td style="padding:3px 0 3px 16px;">${coachName}</td>
            </tr>
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

export async function sendRoleInvitation({
  to,
  role,
  invitedBy,
  loginUrl,
}: {
  to: string;
  role: "ADMIN" | "COACH";
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
}: {
  to: string;
  name: string;
  achievementName: string;
  achievementIcon: string;
  achievementDescription: string;
  rewardText: string | null;
}) {
  try {
    const b = await getServerBranding();
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
}: {
  to: string;
  name: string;
  levelName: string;
  levelIcon: string;
  rewardText: string | null;
}) {
  try {
    const b = await getServerBranding();
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
