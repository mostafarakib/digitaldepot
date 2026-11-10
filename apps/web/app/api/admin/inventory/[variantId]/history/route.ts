import { forwardToExpress } from '../../../../auth/bff-utils';

export async function GET(request: Request, props: { params: Promise<{ variantId: string }> }) {
  const { variantId } = await props.params;
  const url = new URL(request.url);
  const queryString = url.search;
  return forwardToExpress(
    `/api/v1/admin/inventory/variant/${encodeURIComponent(variantId)}/history${queryString}`,
    {
      method: 'GET',
      request,
    },
  );
}
