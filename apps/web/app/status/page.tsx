import Link from 'next/link';
import type { Metadata } from 'next';
import { env } from '../../lib/config';

export const metadata: Metadata = {
  title: 'API Status',
};

type HealthData = {
  status: 'ok' | 'degraded';
  timestamp: string;
  database: 'connected' | 'disconnected';
  version: string;
};

type HealthResponse = {
  success: boolean;
  data: HealthData;
};

/**
 * Fetches the API health endpoint from the server side.
 * Returns null if the API is unreachable or returns an error.
 */
async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${env.serverApiUrl}/api/v1/health`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

export default async function StatusPage() {
  const result = await fetchHealth();
  const isReachable = result !== null;
  const isHealthy = result?.success === true;

  return (
    <main>
      <h1>API Status</h1>

      {!isReachable && (
        <p>
          <strong>⚠ Could not reach the API.</strong> Make sure the API server is running on{' '}
          <code>{env.serverApiUrl}</code>.
        </p>
      )}

      {isReachable && result && (
        <table>
          <tbody>
            <tr>
              <th>Status</th>
              <td>{isHealthy ? '✅ ok' : '⚠ degraded'}</td>
            </tr>
            <tr>
              <th>Database</th>
              <td>{result.data.database === 'connected' ? '✅ connected' : '❌ disconnected'}</td>
            </tr>
            <tr>
              <th>API Version</th>
              <td>{result.data.version}</td>
            </tr>
            <tr>
              <th>Timestamp</th>
              <td>{result.data.timestamp}</td>
            </tr>
            <tr>
              <th>API URL</th>
              <td>
                <code>{env.serverApiUrl}</code>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <p>
        <Link href="/">← Back to home</Link>
      </p>
    </main>
  );
}
