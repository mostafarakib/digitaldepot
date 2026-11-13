import { NextResponse } from 'next/server';
import { forwardToExpress, validateBffOrigin } from '../../../../auth/bff-utils';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ returnNumber: string }> },
) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  const { returnNumber } = await params;

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

  return forwardToExpress(`/api/v1/admin/returns/${encodeURIComponent(returnNumber)}/refund`, {
    method: 'POST',
    request,
    body,
  });
}
