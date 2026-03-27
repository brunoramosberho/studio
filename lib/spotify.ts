let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Spotify token error: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

export interface SpotifyTrack {
  trackId: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string | null;
  previewUrl: string | null;
  durationMs: number;
}

export async function searchTracks(query: string, limit = 10): Promise<SpotifyTrack[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: String(limit),
    market: "MX",
  });

  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error("Spotify search error:", res.status);
    return [];
  }

  const data = await res.json();
  const tracks = data.tracks?.items ?? [];

  return tracks.map((t: Record<string, unknown>) => {
    const artists = t.artists as { name: string }[];
    const album = t.album as { name: string; images: { url: string; width: number }[] };
    const smallestArt = album.images?.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
    return {
      trackId: t.id as string,
      name: t.name as string,
      artist: artists.map((a) => a.name).join(", "),
      album: album.name,
      albumArt: smallestArt?.url ?? null,
      previewUrl: (t.preview_url as string) ?? null,
      durationMs: t.duration_ms as number,
    };
  });
}
