import { forwardToExpress } from '../../auth/bff-utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const queryString = searchParams.toString();
  const path = queryString ? `/api/v1/orders?${queryString}` : '/api/v1/orders';

  return forwardToExpress(path, {
    method: 'GET',
    request,
  });
}
