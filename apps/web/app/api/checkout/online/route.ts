import { NextResponse } from 'next/server';
import { forwardToExpress, validateBffOrigin } from '../../auth/bff-utils';

export async function POST(request: Request) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  let body: unknown = {};
  const text = await request.text();
  if (text && text.trim().length > 0) {
    try {
      body = JSON.parse(text);
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
  }

  return forwardToExpress('/api/v1/checkout/online', {
    method: 'POST',
    request,
    body,
  });
}
