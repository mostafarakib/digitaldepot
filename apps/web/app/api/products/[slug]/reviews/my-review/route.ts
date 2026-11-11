import { forwardToExpress, validateBffOrigin } from '../../../../auth/bff-utils';

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  const { slug } = await params;

  return forwardToExpress(`/api/v1/products/${encodeURIComponent(slug)}/reviews/my-review`, {
    method: 'DELETE',
    request,
  });
}
