import { forwardToExpress } from '../../auth/bff-utils';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return forwardToExpress(`/api/v1/brands/${encodeURIComponent(slug)}`, {
    method: 'GET',
    request,
  });
}
