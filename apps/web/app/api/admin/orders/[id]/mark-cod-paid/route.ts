import { NextResponse } from 'next/server';
import { forwardToExpress, validateBffOrigin } from '../../../../auth/bff-utils';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  const { id } = await params;

  let body: unknown = {};
  const text = await request.text();
  if (text) {
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

  return forwardToExpress(`/api/v1/admin/orders/${id}/mark-cod-paid`, {
    method: 'POST',
    request,
    body,
  });
}
