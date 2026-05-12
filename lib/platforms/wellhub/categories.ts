// Wellhub "Categories" — locale-specific labels (Yoga, Meditation, Pilates…).
// We only fetch on demand to populate admin pickers; nothing is cached
// long-term since the list is short and may differ per locale.

import { bookingApi } from "./client";
import type {
  WellhubCategoriesResponse,
  WellhubCategory,
  WellhubLocale,
} from "./types";

/** GET /booking/v1/gyms/:gym_id/categories?locale=:locale */
export async function listWellhubCategories(
  gymId: number,
  locale: WellhubLocale,
): Promise<WellhubCategory[]> {
  const res = await bookingApi<WellhubCategoriesResponse>(
    `/booking/v1/gyms/${gymId}/categories`,
    { query: { locale } },
  );
  return res.results ?? [];
}
