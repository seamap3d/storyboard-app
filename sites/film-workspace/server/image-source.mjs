import { decodeImage } from '../app/storyboard-media.mjs';

function validateUrl(value) {
  const url = new URL(value);
  const host =
    url.hostname === 'oaiusercontent.com' || url.hostname.endsWith('.oaiusercontent.com');
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !host)
    throw new Error('Only HTTPS OpenAI file URLs are supported. Upload the file if unavailable.');
  return url;
}
async function downloadImage(value, fetcher) {
  const response = await fetcher(validateUrl(value), {
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Image file could not be downloaded.');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) throw new Error('Image exceeds 5 MiB.');
    chunks.push(chunk);
  }
  return new Blob(chunks, { type: response.headers.get('content-type')?.split(';')[0] });
}
function matchesType(bytes, type) {
  const png =
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP';
  return { 'image/png': png, 'image/jpeg': jpeg, 'image/webp': webp }[type];
}
export async function readImage(args, fetcher) {
  let blob;
  if (args.image_data_url) {
    if (typeof args.image_data_url !== 'string' || args.image_data_url.length > 7 * 1024 * 1024)
      throw new Error('Image exceeds transfer limit.');
    blob = decodeImage(args.image_data_url);
  } else blob = await downloadImage(args.image_url, fetcher);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!matchesType(bytes, blob.type)) throw new Error('File content must match PNG, JPEG or WebP.');
  return blob;
}
