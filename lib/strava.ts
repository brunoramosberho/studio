import { prisma } from "./db";
import { encrypt, decrypt } from "./encryption";

const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_OAUTH = "https://www.strava.com/oauth";

export function getStravaClientId() {
  return (process.env.STRAVA_CLIENT_ID || "").trim();
}

function getStravaClientSecret() {
  return (process.env.STRAVA_CLIENT_SECRET || "").trim();
}

export function buildStravaAuthUrl(userId: string, redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    client_id: getStravaClientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read",
    state: state || userId,
  });
  return `${STRAVA_OAUTH}/authorize?${params}`;
}

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: { id: number };
}

export async function exchangeStravaCode(code: string): Promise<StravaTokenResponse> {
  const body = new URLSearchParams({
    client_id: getStravaClientId(),
    client_secret: getStravaClientSecret(),
    code,
    grant_type: "authorization_code",
  });

  const res = await fetch(`${STRAVA_OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token exchange failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function refreshStravaToken(refreshTokenEnc: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const refreshToken = decrypt(refreshTokenEnc);

  const body = new URLSearchParams({
    client_id: getStravaClientId(),
    client_secret: getStravaClientSecret(),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(`${STRAVA_OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Strava refresh failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000),
  };
}

export async function getValidAccessToken(connectionId: string): Promise<string> {
  const conn = await prisma.userWearableConnection.findUniqueOrThrow({
    where: { id: connectionId },
  });

  if (conn.tokenExpiresAt && conn.tokenExpiresAt > new Date(Date.now() + 60_000)) {
    return decrypt(conn.accessTokenEnc);
  }

  const refreshed = await refreshStravaToken(conn.refreshTokenEnc);

  await prisma.userWearableConnection.update({
    where: { id: connectionId },
    data: {
      accessTokenEnc: encrypt(refreshed.accessToken),
      refreshTokenEnc: encrypt(refreshed.refreshToken),
      tokenExpiresAt: refreshed.expiresAt,
    },
  });

  return refreshed.accessToken;
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  start_date: string;
  elapsed_time: number;
  calories: number;
  average_heartrate?: number;
  max_heartrate?: number;
  has_heartrate: boolean;
  [key: string]: unknown;
}

export async function fetchStravaActivity(
  accessToken: string,
  activityId: string | number,
): Promise<StravaActivity> {
  const res = await fetch(`${STRAVA_API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Strava activity fetch failed: ${res.status}`);
  }

  return res.json();
}
