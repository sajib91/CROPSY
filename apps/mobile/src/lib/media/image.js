import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

const MAX_BASE64_LENGTH = 6 * 1024 * 1024;

async function ensurePermission(source) {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error('Camera and photo permissions are required to attach an image.');
  }
}

function fileNameFromUri(uri) {
  const parts = uri.split('/');
  return parts[parts.length - 1] || `image-${Date.now()}.jpg`;
}

/**
 * Picks and compresses an image. `quality` is applied by the native picker to
 * JPEG output; base64 is produced locally so no upload proxy is needed.
 */
export async function pickImage({ source = 'library', quality = 0.7 } = {}) {
  await ensurePermission(source);

  const options = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [4, 3],
    quality,
    base64: true,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  let base64 = asset.base64;
  if (!base64 && asset.uri) {
    base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  if (!base64) throw new Error('The selected image could not be read.');
  if (base64.length > MAX_BASE64_LENGTH) {
    throw new Error('The image is too large. Choose a smaller photo or try again.');
  }

  return {
    uri: asset.uri,
    base64,
    fileName: fileNameFromUri(asset.uri),
    mimeType: asset.mimeType || 'image/jpeg',
    width: asset.width,
    height: asset.height,
  };
}
