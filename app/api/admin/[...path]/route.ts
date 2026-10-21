const API_ROOT = (
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://game-topup-4.onrender.com/api'
).replace(/\/+$/, '');

const proxyAdminRequest = async (
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) => {
  const { path } = await context.params;
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join('/');
  const incomingUrl = new URL(request.url);
  const upstreamUrl = `${API_ROOT}/v1/admin/${encodedPath}${incomingUrl.search}`;
  const headers = new Headers({ Accept: request.headers.get('accept') || 'application/json' });
  const contentType = request.headers.get('content-type');
  const authorization = request.headers.get('authorization');

  if (contentType) headers.set('Content-Type', contentType);
  if (authorization) headers.set('Authorization', authorization);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });
    const responseHeaders = new Headers();
    const responseContentType = upstreamResponse.headers.get('content-type');
    if (responseContentType) responseHeaders.set('Content-Type', responseContentType);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (requestError) {
    if (requestError instanceof DOMException && requestError.name === 'TimeoutError') {
      return Response.json(
        { message: 'Laravel did not respond within 20 seconds. The server may be waking up; please retry.' },
        { status: 504 },
      );
    }
    return Response.json(
      { message: `Could not reach Laravel at ${upstreamUrl}. Check that the backend service is running.` },
      { status: 502 },
    );
  }
};

export const GET = proxyAdminRequest;
export const POST = proxyAdminRequest;
export const PUT = proxyAdminRequest;
export const PATCH = proxyAdminRequest;
export const DELETE = proxyAdminRequest;
