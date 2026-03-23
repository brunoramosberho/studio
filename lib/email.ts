import { Resend } from "resend";
import { formatDate, formatTime } from "./utils";
import { getServerBranding } from "./branding";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}
const FROM = process.env.EMAIL_FROM || "hola@magicpay.mx";

export async function sendBookingConfirmation({
  to,
  name,
  className,
  coachName,
  date,
  startTime,
  location,
}: {
  to: string;
  name: string;
  className: string;
  coachName: string;
  date: Date;
  startTime: Date;
  location?: string;
}) {
  try {
    const b = await getServerBranding();
    const studioFull = `${b.studioName} Studio`;
    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: `Confirmación: ${className} — ${formatDate(date)}`,
      html: `
        <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
          <h1 style="color: ${b.colorFg}; font-size: 24px; margin-bottom: 8px;">¡Reserva confirmada!</h1>
          <p style="color: ${b.colorMuted}; margin-bottom: 24px;">Hola ${name}, tu clase está lista.</p>
          
          <div style="background: ${b.colorBg}; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
            <h2 style="color: ${b.colorAccent}; font-size: 18px; margin: 0 0 16px;">${className}</h2>
            <p style="color: ${b.colorFg}; margin: 4px 0;"><strong>Fecha:</strong> ${formatDate(date)}</p>
            <p style="color: ${b.colorFg}; margin: 4px 0;"><strong>Hora:</strong> ${formatTime(startTime)}</p>
            <p style="color: ${b.colorFg}; margin: 4px 0;"><strong>Coach:</strong> ${coachName}</p>
            ${location ? `<p style="color: ${b.colorFg}; margin: 4px 0;"><strong>Ubicación:</strong> ${location}</p>` : ""}
          </div>
          
          <p style="color: ${b.colorMuted}; font-size: 13px;">
            Recuerda que puedes cancelar hasta 12 horas antes de tu clase para recuperar tu crédito.
          </p>
          
          <hr style="border: none; border-top: 1px solid ${b.colorAccentSoft}; margin: 24px 0;" />
          <p style="color: ${b.colorAccent}; font-size: 12px; text-align: center;">${studioFull} — ${b.slogan}</p>
        </div>
      `,
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
}: {
  to: string;
  name: string;
  className: string;
  startTime: Date;
}) {
  try {
    const b = await getServerBranding();
    const studioFull = `${b.studioName} Studio`;
    await getResend().emails.send({
      from: `${studioFull} <${FROM}>`,
      to,
      subject: `Recordatorio: ${className} hoy a las ${formatTime(startTime)}`,
      html: `
        <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
          <h1 style="color: ${b.colorFg}; font-size: 24px; margin-bottom: 8px;">Tu clase es hoy 🧘‍♀️</h1>
          <p style="color: ${b.colorMuted}; margin-bottom: 16px;">Hola ${name}, te esperamos.</p>
          <div style="background: ${b.colorBg}; border-radius: 16px; padding: 24px;">
            <h2 style="color: ${b.colorAccent}; font-size: 18px; margin: 0 0 8px;">${className}</h2>
            <p style="color: ${b.colorFg};"><strong>Hora:</strong> ${formatTime(startTime)}</p>
          </div>
          <hr style="border: none; border-top: 1px solid ${b.colorAccentSoft}; margin: 24px 0;" />
          <p style="color: ${b.colorAccent}; font-size: 12px; text-align: center;">${studioFull} — ${b.slogan}</p>
        </div>
      `,
    });
  } catch (error) {
    console.error("Failed to send class reminder:", error);
  }
}
