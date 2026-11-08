import { apiClient } from './api-client';
import type { DivisionItem, BangladeshDivisionsResponse } from './auth-types';

let cachedDivisions: DivisionItem[] | null = null;
let inFlightPromise: Promise<DivisionItem[]> | null = null;

/**
 * Fetches Bangladesh administrative divisions and districts from the BFF.
 * Caches results in memory for the duration of the browser session to avoid
 * redundant network requests across component renders and form openings.
 */
export async function getBangladeshDivisions(): Promise<DivisionItem[]> {
  if (cachedDivisions) {
    return cachedDivisions;
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = (async () => {
    try {
      const response = await apiClient<BangladeshDivisionsResponse>(
        '/api/account/addresses/divisions',
      );
      cachedDivisions = response.divisions;
      return cachedDivisions;
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

/**
 * Clears in-memory cache (primarily used in tests).
 */
export function clearBangladeshDivisionsCache(): void {
  cachedDivisions = null;
  inFlightPromise = null;
}
