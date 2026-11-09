import { forwardToExpress, validateBffOrigin } from '../../../auth/bff-utils';

export async function DELETE(request: Request) {
  const originError = validateBffOrigin(request);
  if (originError) {
    return originError;
  }

  return forwardToExpress('/api/v1/account/oauth/google', {
    method: 'DELETE',
    request,
  });
}
