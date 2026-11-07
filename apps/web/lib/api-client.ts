import type { ApiResponse } from './auth-types';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// In-memory singleton CSRF token
let currentCsrfToken: string | null = null;

// In-memory single-flight promise to prevent concurrent duplicate bootstrap requests in the same tab
let csrfBootstrapPromise: Promise<string> | null = null;

// Specific recoverable CSRF error codes emitted by Express csrfProtection middleware
export const RECOVERABLE_CSRF_CODES = new Set([
  'CSRF_TOKEN_MISSING',
  'CSRF_TOKEN_MALFORMED',
  'CSRF_TOKEN_MISMATCH',
  'CSRF_TOKEN_EXPIRED',
  'CSRF_SIGNATURE_INVALID',
  'CSRF_TOKEN_FUTURE',
]);

// In-memory single-flight promise to prevent concurrent duplicate refresh requests in the same tab
let refreshPromise: Promise<boolean> | null = null;

// Listeners notified when an authoritative session revocation or logout occurs
type AuthStateListener = () => void;
const logoutListeners: Set<AuthStateListener> = new Set();

export function onAuthLogout(listener: AuthStateListener): () => void {
  logoutListeners.add(listener);
  return () => logoutListeners.delete(listener);
}

function notifyLogout(): void {
  for (const listener of logoutListeners) {
    try {
      listener();
    } catch {
      // Ignore listener error
    }
  }
}

/**
 * Extracts the dd_csrf cookie value directly from document.cookie in the browser.
 */
export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)dd_csrf=([^;]+)/);
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Sets the in-memory CSRF token directly (used in testing or explicit bootstrap).
 */
export function setInMemoryCsrfToken(token: string | null): void {
  currentCsrfToken = token;
}

/**
 * Gets the current in-memory CSRF token.
 */
export function getInMemoryCsrfToken(): string | null {
  return currentCsrfToken;
}

/**
 * Updates the in-memory CSRF token strictly from the x-csrf-token response header.
 */
function updateCsrfFromHeader(res: Response): void {
  const rotatedToken = res.headers.get('x-csrf-token');
  if (rotatedToken) {
    currentCsrfToken = rotatedToken;
  }
}

/**
 * Executes the network bootstrap call under lock coordination.
 * Checks whether another tab already populated or rotated the cookie before issuing a fetch.
 */
async function executeBootstrap(options?: {
  forceRefresh?: boolean;
  failedToken?: string | null;
}): Promise<string> {
  // Under-lock check 1: Normal bootstrap check if another tab populated cookie
  if (!options?.forceRefresh) {
    const existingCookie = getCsrfTokenFromCookie();
    if (existingCookie) {
      currentCsrfToken = existingCookie;
      return currentCsrfToken;
    }
  }

  // Under-lock check 2: Forced recovery check if another tab already rotated the cookie
  if (options?.forceRefresh && options?.failedToken) {
    const existingCookie = getCsrfTokenFromCookie();
    if (existingCookie && existingCookie !== options.failedToken) {
      currentCsrfToken = existingCookie;
      return currentCsrfToken;
    }
  }

  // Perform the bootstrap fetch
  const res = await fetch('/api/auth/csrf', {
    method: 'GET',
    headers: { accept: 'application/json' },
  });

  updateCsrfFromHeader(res);

  if (currentCsrfToken) {
    return currentCsrfToken;
  }

  const freshlySetCookie = getCsrfTokenFromCookie();
  if (freshlySetCookie) {
    currentCsrfToken = freshlySetCookie;
    return currentCsrfToken;
  }

  throw new ApiError('Failed to initialize CSRF token', 'CSRF_INIT_FAILED', 403);
}

/**
 * Coordinates CSRF token bootstrap across tabs using the Web Locks API.
 *
 * Supported Environments (Web Locks API present):
 * - Guarantees strict FIFO cross-tab mutual exclusion via 'dd_csrf_bootstrap_lock'.
 * - Errors thrown inside executeBootstrap propagate directly without secondary execution.
 * - Lock acquisition failures are isolated from bootstrap callback failures.
 *
 * Unsupported Environments (e.g. legacy browsers pre-2022, restricted iframes, Node SSR):
 * - In-tab promise deduplication guarantees only one bootstrap runs per tab.
 * - Cross-tab coordination is not supported by the platform; bootstrap executes directly.
 * - Any cross-tab race is cleanly self-healed by apiClient's bounded single-retry recovery.
 */
async function coordinateCsrfBootstrap(options?: {
  forceRefresh?: boolean;
  failedToken?: string | null;
}): Promise<string> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    let callbackInvoked = false;

    try {
      return await navigator.locks.request('dd_csrf_bootstrap_lock', async () => {
        callbackInvoked = true;
        return await executeBootstrap(options);
      });
    } catch (err) {
      if (callbackInvoked) {
        // The error occurred INSIDE executeBootstrap (e.g. network failure or server 502).
        // Propagate the error immediately. NEVER execute a second time outside the lock.
        throw err;
      }
      // The Web Locks API call itself rejected before the callback ran
      // (e.g. NotSupportedError or SecurityError in restricted iframe context).
      // Fall back to direct execution in this restricted environment.
      return await executeBootstrap(options);
    }
  }

  // Web Locks API is not available (documented environment limitation)
  return await executeBootstrap(options);
}

/**
 * Ensures a valid CSRF token is available for state-changing requests.
 * Uses in-memory token -> cookie value -> coordinated bootstrap in order.
 * Safely serializes normal and forced recovery requests without redundant rotations.
 */
export async function ensureCsrfToken(options?: {
  forceRefresh?: boolean;
  failedToken?: string | null;
}): Promise<string> {
  const isForced = options?.forceRefresh === true;
  const failedToken = options?.failedToken ?? null;

  // 1. Fast path for normal requests: adopt valid cookie if present
  if (!isForced) {
    const cookieToken = getCsrfTokenFromCookie();
    if (cookieToken) {
      currentCsrfToken = cookieToken;
      return currentCsrfToken;
    }
    if (currentCsrfToken) {
      return currentCsrfToken;
    }
  }

  // 2. Fast path for forced recovery: check if another tab/request already installed a newer cookie
  if (isForced && failedToken) {
    const cookieToken = getCsrfTokenFromCookie();
    if (cookieToken && cookieToken !== failedToken) {
      currentCsrfToken = cookieToken;
      return currentCsrfToken;
    }
  }

  // 3. Serialize with existing in-flight bootstrap if one is active
  if (csrfBootstrapPromise) {
    try {
      await csrfBootstrapPromise;
    } catch {
      // In-flight bootstrap failure caught; error handling/recovery proceeds below
    }

    if (!isForced) {
      const cookie = getCsrfTokenFromCookie();
      if (cookie) {
        currentCsrfToken = cookie;
        return currentCsrfToken;
      }
      if (currentCsrfToken) {
        return currentCsrfToken;
      }
    } else {
      // Forced recovery: compare current cookie against exact failedToken
      const cookie = getCsrfTokenFromCookie();
      if (cookie && cookie !== failedToken) {
        currentCsrfToken = cookie;
        return currentCsrfToken;
      }
      // Cookie is still equal to failedToken (or null); proceed to execute forced bootstrap
    }
  }

  // 4. Double check if another caller initiated a promise while awaiting
  if (csrfBootstrapPromise) {
    return ensureCsrfToken(options);
  }

  // 5. Initiate new coordinated bootstrap promise
  const promise = coordinateCsrfBootstrap(options).finally(() => {
    if (csrfBootstrapPromise === promise) {
      csrfBootstrapPromise = null;
    }
  });
  csrfBootstrapPromise = promise;

  return promise;
}

/**
 * Core refresh network call, coordinating across tabs with Web Locks and timestamp hints.
 */
async function executeRefreshNetworkCall(): Promise<boolean> {
  // Check if another tab recently refreshed the token in the last 4 seconds
  if (typeof localStorage !== 'undefined') {
    const lastRefreshStr = localStorage.getItem('dd_last_refresh_at');
    if (lastRefreshStr) {
      const elapsed = Date.now() - Number(lastRefreshStr);
      if (elapsed < 4000) {
        // Shared cookie was already updated by another tab
        return true;
      }
    }
  }

  let csrf = currentCsrfToken || getCsrfTokenFromCookie();
  if (!csrf) {
    try {
      csrf = await ensureCsrfToken();
    } catch {
      return false;
    }
  }

  let res: Response;
  try {
    res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'x-csrf-token': csrf,
      },
    });
  } catch {
    // Network failure: do not treat as successful, do not retry
    return false;
  }

  updateCsrfFromHeader(res);

  if (res.ok) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dd_last_refresh_at', Date.now().toString());
    }
    return true;
  }

  // Parse error payload
  let errorJson: { error?: { code?: string } } | null = null;
  try {
    errorJson = await res.json();
  } catch {
    // Non-JSON response
  }

  const errorCode = errorJson?.error?.code;

  if (res.status === 401 && errorCode === 'REFRESH_ALREADY_ROTATED') {
    // Concurrency grace window: another request or tab consumed this token < 10s ago.
    // Wait for 250ms backoff and allow the original request to retry once with updated cookie.
    await new Promise((resolve) => setTimeout(resolve, 250));
    return true;
  }

  if (
    res.status === 401 &&
    (errorCode === 'TOKEN_REUSE_DETECTED' ||
      errorCode === 'SESSION_REVOKED_OR_EXPIRED' ||
      errorCode === 'REFRESH_TOKEN_REQUIRED' ||
      errorCode === 'USER_SUSPENDED')
  ) {
    // Session is dead: notify listeners to clear client auth state
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('dd_last_refresh_at');
    }
    notifyLogout();
    return false;
  }

  return false;
}

/**
 * Coordinates silent token refresh with single-flight deduplication and Web Locks cross-tab safety.
 */
export async function coordinateRefresh(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const runWithLock = async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      try {
        return await navigator.locks.request('dd_auth_refresh_lock', async () => {
          return await executeRefreshNetworkCall();
        });
      } catch {
        return await executeRefreshNetworkCall();
      }
    }
    return await executeRefreshNetworkCall();
  };

  refreshPromise = runWithLock().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export interface RequestOptions extends RequestInit {
  _isRetry?: boolean;
  _isCsrfRetry?: boolean;
}

const EXCLUDED_AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/auth/csrf',
]);

/**
 * Centralized fetch wrapper for frontend browser requests.
 * - Enforces CSRF token injection for state-changing methods.
 * - Extracts rotated CSRF tokens strictly from response headers.
 * - Handles 401 responses with bounded, single-flight silent refresh.
 * - Enforces retry boundaries (max 1 refresh, max 1 retry, no refresh for login/register/logout).
 * - Implements narrowly-scoped CSRF recovery for mutations (max 1 retry).
 */
export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  const headers = new Headers(options.headers || {});
  headers.set('accept', 'application/json');

  if (isMutation) {
    const csrfToken = await ensureCsrfToken();
    headers.set('x-csrf-token', csrfToken);
  }

  // Strip internal orchestration flags from options passed to window.fetch
  const { _isRetry, _isCsrfRetry, ...cleanOptions } = options;

  const fetchOptions: RequestInit = {
    ...cleanOptions,
    method,
    headers,
  };

  let res: Response;
  try {
    res = await fetch(path, fetchOptions);
  } catch (networkError) {
    throw new ApiError(
      networkError instanceof Error ? networkError.message : 'Network connection failure',
      'NETWORK_ERROR',
      0,
    );
  }

  // Update CSRF token from x-csrf-token header whenever rotated upstream
  updateCsrfFromHeader(res);

  // Check for 401 on protected requests
  if (res.status === 401 && !EXCLUDED_AUTH_PATHS.has(path)) {
    // Boundary check: Max 1 retry attempt per failed protected request
    if (!options._isRetry) {
      const refreshed = await coordinateRefresh();
      if (refreshed) {
        // Retry the original request exactly once with the updated session cookie
        return apiClient<T>(path, {
          ...options,
          _isRetry: true,
        });
      }
    }
  }

  let data: ApiResponse<T>;
  try {
    data = await res.json();
  } catch {
    throw new ApiError('Unexpected response from server', 'INVALID_JSON_RESPONSE', res.status);
  }

  // Narrowly scoped CSRF failure recovery for mutations
  if (
    isMutation &&
    res.status === 403 &&
    !options._isCsrfRetry &&
    data &&
    !data.success &&
    data.error &&
    RECOVERABLE_CSRF_CODES.has(data.error.code)
  ) {
    // Capture exact token used in failed request before resetting local state
    const failedToken = headers.get('x-csrf-token') || currentCsrfToken;
    currentCsrfToken = null;

    // Bootstrap or adopt fresh CSRF token under lock coordination
    await ensureCsrfToken({ forceRefresh: true, failedToken });

    // Retry the mutation exactly once with original body and headers
    return apiClient<T>(path, {
      ...options,
      _isCsrfRetry: true,
    });
  }

  if (!res.ok || !data.success) {
    const error = (!data.success && data.error) || {
      code: 'API_ERROR',
      message: 'An error occurred while processing your request',
    };
    throw new ApiError(error.message, error.code, res.status, error.details);
  }

  return data.data;
}
