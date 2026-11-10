import { NextResponse } from 'next/server';
import { forwardToExpress, validateBffOrigin } from '../../../../auth/bff-utils';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  return forwardToExpress(`/api/v1/admin/products/${encodeURIComponent(id)}/images`, {
    method: 'POST',
    request,
    body,
  });
}
