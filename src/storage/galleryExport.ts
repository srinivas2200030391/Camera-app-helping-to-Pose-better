/**
 * Export to the device photo gallery (explicit user action, or the "auto-save" setting).
 * Photos live privately in the app until exported.
 */
import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';

import { APP_NAME } from '@/config/brand';

import { updatePhoto } from './photosRepo';

export class GalleryPermissionError extends Error {
  constructor(readonly canAskAgain: boolean) {
    super(
      canAskAgain
        ? 'Allow photo access to save to your gallery.'
        : 'Photo access is turned off. Enable it in system settings to save to your gallery.',
    );
    this.name = 'GalleryPermissionError';
  }
}

export async function exportToGallery(photoId: string, fileUri: string): Promise<void> {
  const permission = await requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) throw new GalleryPermissionError(permission.canAskAgain);

  const album = await Album.get(APP_NAME).catch(() => null);
  if (album) {
    await Asset.create(fileUri, album);
  } else {
    const asset = await Asset.create(fileUri);
    // Grouping into an album is a nicety: the asset is already in the gallery if this fails.
    await Album.create(APP_NAME, [asset], true).catch((error: unknown) => {
      console.warn('[export] album creation failed', error);
    });
  }
  await updatePhoto(photoId, { exportedAt: Date.now() });
}
