import { forwardToExpress } from '../../../auth/bff-utils';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const queryString = url.search;
  return forwardToExpress(`/api/v1/admin/inventory/history${queryString}`, {
    method: 'GET',
    request,
  });
}
