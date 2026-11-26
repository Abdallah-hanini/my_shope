import sharp from 'sharp';
import { LOGO_LIMITS } from '@erp/validation';
import { unprocessable } from '../common/errors';

/**
 * Turns an uploaded logo into the stored PNG: decoding proves it is a JPEG, PNG or WebP image (no
 * SVG or other formats that can carry scripts), re-encoding drops all metadata, and the image is
 * scaled to fit 600 × 300.
 */
export async function processLogo(input: Buffer): Promise<{ png: Buffer; width: number; height: number }> {
  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: 50_000_000 }).metadata()).format;
  } catch {
    format = undefined;
  }
  if (!format || !['jpeg', 'png', 'webp'].includes(format))
    throw unprocessable('The logo must be a JPEG, PNG or WebP image');
  try {
    const out = await sharp(input, { limitInputPixels: 50_000_000, failOn: 'error' })
      .rotate()
      .resize({
        width: LOGO_LIMITS.maxWidth,
        height: LOGO_LIMITS.maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    return { png: out.data, width: out.info.width, height: out.info.height };
  } catch {
    throw unprocessable('The image could not be read; it may be damaged');
  }
}
