import { parseStoredJsonArray } from './util.js';

export function photosArrayWithoutSignature(photos) {
  return (Array.isArray(photos) ? photos : []).filter((p) => {
    if (!p || typeof p !== 'object') return true;
    return p.kind !== 'signature';
  });
}

export function extractSignatureUrlFromPhotosValue(photosValue) {
  const photosRaw = parseStoredJsonArray(photosValue, []);
  const hit = photosRaw.find(
    (p) =>
      p &&
      typeof p === 'object' &&
      p.kind === 'signature' &&
      typeof p.url === 'string' &&
      p.url.trim()
  );
  return hit ? hit.url.trim() : '';
}

export function buildJobCardPhotosPayload({
  formPhotos,
  signatureDataUrl,
  sectionPhotoEntries,
  voicePhotoEntries
}) {
  const sig =
    typeof signatureDataUrl === 'string' && signatureDataUrl.trim().startsWith('data:image')
      ? [{ kind: 'signature', url: signatureDataUrl.trim() }]
      : [];
  return [
    ...photosArrayWithoutSignature(formPhotos),
    ...sig,
    ...(sectionPhotoEntries || []),
    ...(voicePhotoEntries || [])
  ];
}

export function jobCardMediaIsVideoDataUrl(url) {
  return typeof url === 'string' && /^data:video\//i.test(url);
}

export function jobCardMediaIsVideoUrl(url, mediaType = '', filename = '') {
  if (jobCardMediaIsVideoDataUrl(url)) return true;
  if (typeof mediaType === 'string' && /video/i.test(mediaType)) return true;
  const target = `${String(url || '')} ${String(filename || '')}`.toLowerCase();
  return /\.(mp4|webm|mov|m4v|avi|mkv)(\?|$|\s)/i.test(target);
}
