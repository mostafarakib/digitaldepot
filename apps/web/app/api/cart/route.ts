import { forwardToExpress, validateBffOrigin } from '../auth/bff-utils';

export async function GET(request: Request) {
  return forwardToExpress('/api/v1/cart', {
    method: 'GET',
    request,
  });
}

export async function DELETE(request: Request) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  return forwardToExpress('/api/v1/cart', {
    method: 'DELETE',
    request,
  });
}
