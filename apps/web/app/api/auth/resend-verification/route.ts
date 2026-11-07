import { forwardToExpress, validateBffOrigin } from '../bff-utils';

export async function POST(request: Request) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    // Leave as empty object if parsing fails
  }

  return forwardToExpress('/api/v1/auth/resend-verification', {
    method: 'POST',
    request,
    body,
  });
}
