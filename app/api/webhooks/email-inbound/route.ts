import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { parseInboundEmail } from "@/lib/platforms/email";
import { parsePlatformEmail } from "@/lib/platforms/parser";
import { processInboundEmail } from "@/lib/platforms/actions";

function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string,
): boolean {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!signingKey) return false;

  const hmac = crypto.createHmac("sha256", signingKey);
  hmac.update(timestamp + token);
  const expected = hmac.digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex"),
  );
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const timestamp = formData.get("timestamp") as string | null;
    const token = formData.get("token") as string | null;
    const signature = formData.get("signature") as string | null;

    if (!timestamp || !token || !signature) {
      return NextResponse.json({ received: true });
    }

    if (!verifyMailgunSignature(timestamp, token, signature)) {
      console.error("POST /api/webhooks/email-inbound: HMAC verification failed");
      return NextResponse.json({ received: true });
    }

    const recipient = formData.get("recipient") as string | null;
    const to = recipient || (formData.get("To") as string | null);
    if (!to) {
      return NextResponse.json({ received: true });
    }

    const parsed = parseInboundEmail(to);
    if (!parsed) {
      console.error("POST /api/webhooks/email-inbound: unrecognized recipient", to);
      return NextResponse.json({ received: true });
    }

    const config = await prisma.studioPlatformConfig.findFirst({
      where: {
        inboundEmail: to.toLowerCase(),
        isActive: true,
      },
      include: { tenant: true },
    });

    if (!config) {
      console.error("POST /api/webhooks/email-inbound: no active config for", to);
      return NextResponse.json({ received: true });
    }

    const subject = formData.get("subject") as string | null;
    const bodyPlain = formData.get("body-plain") as string | null;
    const bodyHtml = formData.get("body-html") as string | null;
    const emailBody = bodyPlain || bodyHtml || subject || "";

    processEmailAsync(emailBody, config.tenantId, parsed.platform, subject).catch(
      (err) => console.error("POST /api/webhooks/email-inbound: async processing error", err),
    );

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("POST /api/webhooks/email-inbound error:", error);
    return NextResponse.json({ received: true });
  }
}

// After the Wellhub API migration only ClassPass uses email-driven inbound
// reservations. Wellhub bookings now arrive via /api/webhooks/wellhub/*.
async function processEmailAsync(
  emailBody: string,
  tenantId: string,
  platform: "classpass",
  subject: string | null,
) {
  const fullText = subject ? `Subject: ${subject}\n\n${emailBody}` : emailBody;
  const parsed = await parsePlatformEmail(fullText, platform);
  await processInboundEmail(parsed, tenantId, platform, fullText);
}
