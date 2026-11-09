import { NextResponse } from 'next/server';
import { forwardToExpress, validateBffOrigin } from '../../../bff-utils';

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
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid JSON request body',
        },
      },
      { status: 400 },
    );
  }

  return forwardToExpress('/api/v1/auth/oauth/google/reauth', {
    method: 'POST',
    request,
    body,
  });
}
