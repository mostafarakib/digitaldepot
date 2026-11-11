import { NextResponse } from 'next/server';
import { forwardToExpress, validateBffOrigin } from '../../../auth/bff-utils';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const search = url.search;

  return forwardToExpress(`/api/v1/products/${encodeURIComponent(slug)}/reviews${search}`, {
    method: 'GET',
    request,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  const { slug } = await params;

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

  return forwardToExpress(`/api/v1/products/${encodeURIComponent(slug)}/reviews`, {
    method: 'POST',
    request,
    body,
  });
}
