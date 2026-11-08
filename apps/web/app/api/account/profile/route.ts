import { NextResponse } from 'next/server';
import { forwardToExpress, validateBffOrigin } from '../../auth/bff-utils';

export async function GET(request: Request) {
  return forwardToExpress('/api/v1/account/profile', {
    method: 'GET',
    request,
  });
}

export async function PATCH(request: Request) {
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

  return forwardToExpress('/api/v1/account/profile', {
    method: 'PATCH',
    request,
    body,
  });
}
