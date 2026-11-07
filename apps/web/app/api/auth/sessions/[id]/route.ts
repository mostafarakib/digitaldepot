import { forwardToExpress, validateBffOrigin } from '../../bff-utils';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  const { id } = await params;

  return forwardToExpress(`/api/v1/auth/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    request,
  });
}
