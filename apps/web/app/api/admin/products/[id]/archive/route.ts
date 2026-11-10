import { forwardToExpress, validateBffOrigin } from '../../../../auth/bff-utils';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  const { id } = await params;
  return forwardToExpress(`/api/v1/admin/products/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    request,
  });
}
