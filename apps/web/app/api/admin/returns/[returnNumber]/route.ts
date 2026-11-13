import { forwardToExpress } from '../../../auth/bff-utils';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ returnNumber: string }> },
) {
  const { returnNumber } = await params;

  return forwardToExpress(`/api/v1/admin/returns/${encodeURIComponent(returnNumber)}`, {
    method: 'GET',
    request,
  });
}
