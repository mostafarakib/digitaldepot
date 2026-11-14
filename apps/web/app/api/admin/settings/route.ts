import { NextResponse } from 'next/server';
import { forwardToExpress, validateBffOrigin } from '../../auth/bff-utils';

export async function GET(request: Request) {
  return forwardToExpress('/api/v1/admin/settings', {
    method: 'GET',
    request,
  });
}

export async function PUT(request: Request) {
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

  return forwardToExpress('/api/v1/admin/settings', {
    method: 'PUT',
    request,
    body,
  });
}
