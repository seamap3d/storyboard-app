export const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
const tables = new Set(['film_projects', 'project_members', 'project_invitations', 'storyboards']);
export const rpcs = new Set([
  'get_project_production',
  'save_project_production',
  'create_film_project',
  'create_storyboard',
  'save_storyboard',
  'invite_project_member',
  'accept_project_invitation',
  'revoke_project_invitation',
  'set_project_member',
  'transfer_project_ownership',
]);
export function allowedProxy(path, method) {
  if (path === '/auth/v1/user') return method === 'GET' || method === 'PUT';
  if (method === 'GET' && /^\/rest\/v1\/[a-z_]+$/.test(path))
    return tables.has(path.split('/').at(-1));
  if (method === 'POST' && path.startsWith('/rest/v1/rpc/'))
    return rpcs.has(path.split('/').at(-1));
  if (
    method === 'GET' &&
    /^\/storage\/v1\/object\/authenticated\/storyboard-images\/[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(
      path,
    )
  )
    return true;
  return (
    method === 'POST' &&
    /^\/storage\/v1\/object\/storyboard-images\/[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(
      path,
    )
  );
}
export async function boundedJson(request, max) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json'))
    throw new Error('Use a JSON request.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body required.');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new Error('Request exceeds size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
