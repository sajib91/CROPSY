import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export async function pickDocument({ type = '*/*' } = {}) {
  const result = await DocumentPicker.getDocumentAsync({
    type,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > MAX_DOCUMENT_BYTES) {
    throw new Error('The document is too large. The limit is 10 MB.');
  }

  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    uri: asset.uri,
    name: asset.name || `document-${Date.now()}`,
    mimeType: asset.mimeType || 'application/octet-stream',
    size: asset.size || base64.length,
    base64,
  };
}
