import { forwardToExpress } from '../../../../auth/bff-utils';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardToExpress(`/api/v1/admin/variants/${encodeURIComponent(id)}/price-history`, {
    method: 'GET',
    request,
  });
}
