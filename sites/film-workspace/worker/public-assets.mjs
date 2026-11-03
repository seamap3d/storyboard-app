import { assets } from './assets.generated.mjs';
import { json } from './http.mjs';

export function serveAsset(request, url) {
  if (!['GET', 'HEAD'].includes(request.method))
    return json({ message: 'Method not allowed.' }, 405);
  const asset = assets[url.pathname === '/' ? '/index.html' : url.pathname];
  if (!asset) return json({ message: 'Not found.' }, 404);
  return new Response(request.method === 'HEAD' ? null : asset.text, {
    headers: {
      'Content-Type': asset.type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com",
    },
  });
}
