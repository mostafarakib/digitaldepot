import { forwardToExpress } from '../../auth/bff-utils';

export async function GET(request: Request) {
  return forwardToExpress('/api/v1/store/settings', {
    method: 'GET',
    request,
  });
}
