import { forwardToExpress } from '../../../auth/bff-utils';

export async function GET(request: Request) {
  return forwardToExpress('/api/v1/account/addresses/divisions', {
    method: 'GET',
    request,
  });
}
