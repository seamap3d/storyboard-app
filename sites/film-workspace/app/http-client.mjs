export function requestSignal(path, binary, responseType) {
  if (path.startsWith('/rest/v1/rpc/')) return AbortSignal.timeout(90000);
  return AbortSignal.timeout(binary || responseType === 'blob' ? 60000 : 15000);
}

export function requestOptions(key, session, { body, method, auth, binary }, signal) {
  return {
    method,
    headers: {
      apikey: key,
      ...(auth ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(body ? { 'Content-Type': binary ? body.type : 'application/json' } : {}),
    },
    ...(body ? { body: binary ? body : JSON.stringify(body) } : {}),
    signal,
    redirect: 'error',
    cache: 'no-store',
  };
}

function responseError(response, data) {
  const error = new Error(
    data?.code === '40001'
      ? 'Another member saved this storyboard. Export your changes, then reload the shared version.'
      : data?.message ||
          data?.msg ||
          data?.error_description ||
          `Request failed (${response.status}).`,
  );
  error.status = response.status;
  error.code = data?.code || data?.error;
  error.storageStatus = Number(data?.statusCode);
  return error;
}

export async function responseData(response, path, responseType, signal) {
  const data =
    response.ok && responseType === 'blob'
      ? await response.blob()
      : await response.json().catch((error) => {
          if (signal.aborted) throw error;
          return null;
        });
  if (
    response.ok &&
    data === null &&
    /^\/rest\/v1\/rpc\/(save_storyboard|create_storyboard)$/.test(path)
  ) {
    throw Object.assign(new Error('Save response was incomplete.'), { code: 'SAVE_UNCONFIRMED' });
  }
  if (!response.ok) throw responseError(response, data);
  return data;
}

export function requestError(error, signal, rpc) {
  if (!signal.aborted && error.name !== 'TimeoutError') return error;
  const timed = new Error(
    rpc
      ? 'The save confirmation timed out. Your changes are still in this tab.'
      : 'The image or data request timed out. Your changes are still in this tab; retry or export JSON before reloading.',
    { cause: error },
  );
  timed.code = rpc ? 'SAVE_UNCONFIRMED' : 'REQUEST_TIMEOUT';
  return timed;
}
