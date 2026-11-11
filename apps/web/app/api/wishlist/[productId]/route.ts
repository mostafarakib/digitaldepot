import { forwardToExpress, validateBffOrigin } from '../../auth/bff-utils';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  const { productId } = await params;

  return forwardToExpress(`/api/v1/wishlist/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
    request,
  });
}
