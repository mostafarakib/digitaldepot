import { forwardToExpress, validateBffOrigin } from '../../../../../../auth/bff-utils';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  const { id, imageId } = await params;
  return forwardToExpress(
    `/api/v1/admin/products/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}/primary`,
    {
      method: 'PATCH',
      request,
    },
  );
}
