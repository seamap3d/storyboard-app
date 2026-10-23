export const IMAGE_BUCKET = 'storyboard-images';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const extensions = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};
export function validateStoryboard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.shots)) throw new Error('This file is not a storyboard export: a shots array is required. Nothing was replaced.');
  if (value.meta !== undefined && (!value.meta || typeof value.meta !== 'object' || Array.isArray(value.meta))) throw new Error('Storyboard metadata must be an object. Nothing was replaced.');
  const seen = new Set();
  for (const shot of value.shots) {
    if (!shot || typeof shot !== 'object' || Array.isArray(shot)) throw new Error('Every shot must be an object. Nothing was replaced.');
    if (shot.id && (typeof shot.id !== 'string' || seen.has(shot.id))) throw new Error('Shot IDs must be unique strings. Nothing was replaced.');
    if (shot.id) seen.add(shot.id);
    if (shot.imageData && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(shot.imageData)) throw new Error('An image has an unsupported format. Use embedded PNG, JPEG, WebP or GIF. Nothing was replaced.');
  }
  return value;
}
export function decodeImage(dataUrl) {
  const match = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) throw new Error('Invalid embedded image. Your original storyboard is unchanged.');
  const type = match[1].toLowerCase().replace('image/jpg','image/jpeg');
  const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('One image exceeds the 5 MiB per-image limit. Reduce that image before saving; your draft is unchanged.');
  return new Blob([bytes],{type});
}
export async function imageDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}
function checkPath(path,projectId,boardId) {
  const prefix=`${projectId}/${boardId}/`;
  if (typeof path!=='string' || !path.startsWith(prefix) || !/^[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(path.slice(prefix.length))) throw new Error('An image reference belongs to another storyboard or has an invalid path. Import a portable JSON export with its images instead.');
}
export async function prepareSharedDocument(client, document, projectId, boardId, progress=()=>{}) {
  validateStoryboard(document);
  const result=structuredClone(document);
  // Validate every embedded image before starting network work.
  const images=result.shots.map(shot=>shot.imageData?decodeImage(shot.imageData):null);
  const envelope=structuredClone(result);
  for(const shot of envelope.shots)if(shot.imageData){delete shot.imageData;shot.imagePath=`${projectId}/${boardId}/${'0'.repeat(64)}.webp`;}
  if(new Blob([JSON.stringify(envelope)]).size>5*1024*1024)throw new Error('Storyboard text/metadata exceeds the 5 MiB document limit even after separating images. Your draft is unchanged.');
  const uploaded=new Set();let completed=0,total=images.filter(Boolean).length;
  for(let i=0;i<result.shots.length;i++) {
    const shot=result.shots[i],blob=images[i];
    if(blob) {
      const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
      const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      const path=`${projectId}/${boardId}/${hash}.${extensions[blob.type]}`;
      progress(`Uploading image ${completed+1} of ${total}…`);
      if(!uploaded.has(path)){await client.uploadImage(path,blob);uploaded.add(path);}
      shot.imagePath=path;delete shot.imageData;completed++;
    } else if(shot.imagePath) checkPath(shot.imagePath,projectId,boardId);
  }
  if(new Blob([JSON.stringify(result)]).size>5*1024*1024)throw new Error('Storyboard text/metadata exceeds the 5 MiB document limit even after separating images. Your draft is unchanged.');
  return result;
}
export async function loadSharedImages(client, document, projectId, boardId, progress=()=>{}) {
  const result=structuredClone(validateStoryboard(document));
  const cache=new Map();let completed=0,total=result.shots.filter(s=>s.imagePath).length;
  for(const shot of result.shots)if(shot.imagePath) {
    checkPath(shot.imagePath,projectId,boardId);
    progress(`Loading image ${++completed} of ${total}…`);
    if(!cache.has(shot.imagePath))cache.set(shot.imagePath,await imageDataUrl(await client.downloadImage(shot.imagePath)));
    shot.imageData=cache.get(shot.imagePath);
  }
  return result;
}
export function portableDocument(document) {
  const result=structuredClone(document);
  for(const shot of result.shots) {
    if(shot.imagePath && !shot.imageData)throw new Error('An image is not loaded yet. Reload the shared storyboard before exporting.');
    delete shot.imagePath;
  }
  return result;
}
