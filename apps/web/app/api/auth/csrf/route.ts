import { forwardToExpress } from '../bff-utils';

export async function GET(request: Request) {
  return forwardToExpress('/api/v1/auth/csrf', {
    method: 'GET',
    request,
  });
}

