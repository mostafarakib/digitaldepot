import { forwardToExpress, validateBffOrigin } from '../../auth/bff-utils';

export async function POST(request: Request) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  return forwardToExpress('/api/v1/cart/merge', {
    method: 'POST',
    request,
  });
}
