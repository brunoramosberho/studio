import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.RATING_TOKEN_SECRET || "dev-rating-secret-change-me-in-prod!!"
);

export interface RatingTokenPayload {
  userId: string;
  classId: string;
  tenantId: string;
  rating: number;
}

export async function createRatingToken(params: {
  userId: string;
  classId: string;
  tenantId: string;
  rating: number;
  expiresInDays?: number;
}): Promise<string> {
  return new SignJWT({
    userId: params.userId,
    classId: params.classId,
    tenantId: params.tenantId,
    rating: params.rating,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${params.expiresInDays ?? 7}d`)
    .setIssuedAt()
    .sign(SECRET);
}

export async function verifyRatingToken(
  token: string
): Promise<RatingTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as RatingTokenPayload;
  } catch {
    return null;
  }
}
