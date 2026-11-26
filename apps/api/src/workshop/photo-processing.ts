import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { unprocessable } from '../common/errors';

export const MAX_EDGE = 2048;
export const THUMB_EDGE = 320;
const MAX_OUTPUT = 5 * 1024 * 1024;
const ACCEPTED = new Set(['jpeg', 'png', 'webp']);

export interface ProcessedPhoto {
  content: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
  sha256: string;
}

/**
 * Turns an uploaded file into a stored photo. Decoding proves it really is an image (whatever the
 * file name or declared type says); re-encoding to JPEG drops all metadata (EXIF, GPS location,
 * camera serials) after applying the camera's orientation; images are scaled to at most 2048 px.
 * Pixel bombs are refused by the decoder limit.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: 50_000_000 }).metadata()).format;
  } catch {
    format = undefined;
  }
  if (!format || !ACCEPTED.has(format)) {
    throw unprocessable('The file is not a supported image (JPEG, PNG or WebP)');
  }
  try {
    const base = () =>
      sharp(input, { limitInputPixels: 50_000_000, failOn: 'error' })
        .rotate() // apply EXIF orientation, then the EXIF block is not written out
        .flatten({ background: '#ffffff' });
    let quality = 82;
    let out = await base()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    while (out.data.length > MAX_OUTPUT && quality > 50) {
      quality -= 10;
      out = await base()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
    }
    const thumbnail = await base()
      .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
    return {
      content: out.data,
      thumbnail,
      width: out.info.width,
      height: out.info.height,
      sha256: createHash('sha256').update(out.data).digest('hex'),
    };
  } catch {
    throw unprocessable('The image could not be read; it may be damaged');
  }
}
