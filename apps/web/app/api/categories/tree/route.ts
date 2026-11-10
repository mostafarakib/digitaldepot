import { forwardToExpress } from '../../auth/bff-utils';

export async function GET(request: Request) {
  return forwardToExpress('/api/v1/categories/tree', {
    method: 'GET',
    request,
  });
}
