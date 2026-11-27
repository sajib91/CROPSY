export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const DOCUMENT_ACCEPT =
  '.pdf,.txt,.csv,.md,.json,application/pdf,text/plain,text/csv,text/markdown,application/json';

const TEXT_MIME_TYPES = new Set(['text/plain', 'text/csv', 'text/markdown', 'application/json']);

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_EXTENSIONS = /\.(pdf|txt|csv|md|json)$/i;

export function isSupportedImage(file) {
  return IMAGE_MIME_TYPES.has(String(file.type || '').toLowerCase());
}

export function isSupportedDocument(file) {
  const mime = String(file.type || '').toLowerCase();
  return (
    TEXT_MIME_TYPES.has(mime) || mime === 'application/pdf' || DOCUMENT_EXTENSIONS.test(file.name)
  );
}

export function isTextDocument(file) {
  return TEXT_MIME_TYPES.has(String(file.type || '').toLowerCase());
}

export function createAssetId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      const encoded = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
      resolve(encoded);
    };
    reader.onerror = () => reject(new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('file_read_failed'));
    reader.readAsText(file);
  });
}
