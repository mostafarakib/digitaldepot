import { NextResponse } from 'next/server';
import { forwardToExpress, validateBffOrigin } from '../../../auth/bff-utils';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardToExpress(`/api/v1/admin/products/${encodeURIComponent(id)}`, {
    method: 'GET',
    request,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  const { id } = await params;

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

  return forwardToExpress(`/api/v1/admin/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    request,
    body,
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  const { id } = await params;
  return forwardToExpress(`/api/v1/admin/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    request,
  });
}
