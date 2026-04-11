import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.WAIVER_TOKEN_SECRET || process.env.RATING_TOKEN_SECRET || "dev-waiver-secret-change-me!!"
);

export interface WaiverTokenPayload {
  userId: string;
  tenantId: string;
}

export async function createWaiverToken(params: {
  userId: string;
  tenantId: string;
  expiresInDays?: number;
}): Promise<string> {
  return new SignJWT({
    userId: params.userId,
    tenantId: params.tenantId,
    purpose: "waiver-sign",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${params.expiresInDays ?? 30}d`)
    .setIssuedAt()
    .sign(SECRET);
}

export async function verifyWaiverToken(
  token: string
): Promise<WaiverTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.purpose !== "waiver-sign") return null;
    return {
      userId: payload.userId as string,
      tenantId: payload.tenantId as string,
    };
  } catch {
    return null;
  }
}
