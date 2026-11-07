import { forwardToExpress, validateBffOrigin } from '../bff-utils';

export async function POST(request: Request) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  return forwardToExpress('/api/v1/auth/refresh', {
    method: 'POST',
    request,
  });
}
