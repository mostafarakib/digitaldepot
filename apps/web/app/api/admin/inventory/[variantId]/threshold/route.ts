import { NextResponse } from 'next/server';
import { forwardToExpress, validateBffOrigin } from '../../../../auth/bff-utils';

export async function PATCH(request: Request, props: { params: Promise<{ variantId: string }> }) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  const { variantId } = await props.params;

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

  return forwardToExpress(
    `/api/v1/admin/inventory/variant/${encodeURIComponent(variantId)}/threshold`,
    {
      method: 'PATCH',
      request,
      body,
    },
  );
}
