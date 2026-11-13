import { forwardToExpress } from '../../../../auth/bff-utils';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const { orderNumber } = await params;

  return forwardToExpress(`/api/v1/orders/${encodeURIComponent(orderNumber)}/return-eligibility`, {
    method: 'GET',
    request,
  });
}
