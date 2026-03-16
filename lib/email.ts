import { Resend } from "resend";
import { formatDate, formatTime } from "./utils";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}
const FROM = process.env.EMAIL_FROM || "hola@flostudio.mx";

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
    await getResend().emails.send({
      from: `Flō Studio <${FROM}>`,
      to,
      subject: `Confirmación: ${className} — ${formatDate(date)}`,
      html: `
        <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
          <h1 style="color: #1C1917; font-size: 24px; margin-bottom: 8px;">¡Reserva confirmada!</h1>
          <p style="color: #8C8279; margin-bottom: 24px;">Hola ${name}, tu clase está lista.</p>
          
          <div style="background: #FAF9F6; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
            <h2 style="color: #C9A96E; font-size: 18px; margin: 0 0 16px;">${className}</h2>
            <p style="color: #1C1917; margin: 4px 0;"><strong>Fecha:</strong> ${formatDate(date)}</p>
            <p style="color: #1C1917; margin: 4px 0;"><strong>Hora:</strong> ${formatTime(startTime)}</p>
            <p style="color: #1C1917; margin: 4px 0;"><strong>Coach:</strong> ${coachName}</p>
            ${location ? `<p style="color: #1C1917; margin: 4px 0;"><strong>Ubicación:</strong> ${location}</p>` : ""}
          </div>
          
          <p style="color: #8C8279; font-size: 13px;">
            Recuerda que puedes cancelar hasta 12 horas antes de tu clase para recuperar tu crédito.
          </p>
          
          <hr style="border: none; border-top: 1px solid #E8D9BF; margin: 24px 0;" />
          <p style="color: #C9A96E; font-size: 12px; text-align: center;">Flō Studio — Muévete. Respira. Floréce.</p>
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
    await getResend().emails.send({
      from: `Flō Studio <${FROM}>`,
      to,
      subject: `Recordatorio: ${className} hoy a las ${formatTime(startTime)}`,
      html: `
        <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
          <h1 style="color: #1C1917; font-size: 24px; margin-bottom: 8px;">Tu clase es hoy 🧘‍♀️</h1>
          <p style="color: #8C8279; margin-bottom: 16px;">Hola ${name}, te esperamos.</p>
          <div style="background: #FAF9F6; border-radius: 16px; padding: 24px;">
            <h2 style="color: #C9A96E; font-size: 18px; margin: 0 0 8px;">${className}</h2>
            <p style="color: #1C1917;"><strong>Hora:</strong> ${formatTime(startTime)}</p>
          </div>
          <hr style="border: none; border-top: 1px solid #E8D9BF; margin: 24px 0;" />
          <p style="color: #C9A96E; font-size: 12px; text-align: center;">Flō Studio — Muévete. Respira. Floréce.</p>
        </div>
      `,
    });
  } catch (error) {
    console.error("Failed to send class reminder:", error);
  }
}
