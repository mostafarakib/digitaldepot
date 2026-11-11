import { forwardToExpress } from '../../auth/bff-utils';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.search;

  return forwardToExpress(`/api/v1/admin/reviews${search}`, {
    method: 'GET',
    request,
  });
}
