import { NextResponse } from 'next/server';
import { forwardToExpress, validateBffOrigin } from '../bff-utils';

export async function POST(request: Request) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  let body: unknown;
  try {
    body = await request.json();
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

  return forwardToExpress('/api/v1/auth/login', {
    method: 'POST',
    request,
    body,
  });
}

