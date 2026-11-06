/** Centralised environment configuration for the web app. */
export const env = {
  /** Server-side API URL for Server Components / SSR */
  serverApiUrl:
    process.env['API_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000',

  /** Public API URL exposed to client components */
  publicApiUrl: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000',

  /** Storefront origin used for server-side BFF Origin validation */
  storefrontOrigin:
    process.env['STOREFRONT_ORIGIN'] ?? process.env['FRONTEND_URL'] ?? 'http://localhost:3000',
} as const;
