import sharp from 'sharp';
import { MAX_EDGE, processPhoto, THUMB_EDGE } from './photo-processing';

const image = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#3366aa' } });

describe('processPhoto', () => {
  it('re-encodes to JPEG, scales down large photos and makes a thumbnail', async () => {
    const p = await processPhoto(await image(4000, 3000).png().toBuffer());
    expect([p.width, p.height]).toEqual([MAX_EDGE, 1536]);
    expect((await sharp(p.content).metadata()).format).toBe('jpeg');
    const t = await sharp(p.thumbnail).metadata();
    expect([t.width, t.height]).toEqual([THUMB_EDGE, 240]);
    expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps small photos at their size', async () => {
    const p = await processPhoto(await image(800, 600).webp().toBuffer());
    expect([p.width, p.height]).toEqual([800, 600]);
  });

  it('removes EXIF metadata such as GPS position and applies the orientation', async () => {
    const withExif = await image(600, 300)
      .jpeg()
      .withExif({
        IFD0: { Make: 'PhoneCo', Model: 'X1' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '25/1 17/1 0/1' },
      })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const p = await processPhoto(withExif);
    const meta = await sharp(p.content).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();

    const rotated = await image(600, 300).jpeg().withMetadata({ orientation: 6 }).toBuffer(); // 90° on display
    const r = await processPhoto(rotated);
    expect([r.width, r.height]).toEqual([300, 600]);
  });

  it('refuses files that are not images, unsupported formats and damaged images', async () => {
    await expect(processPhoto(Buffer.from('%PDF-1.7 not an image'))).rejects.toThrow(/not a supported image/);
    await expect(processPhoto(await image(10, 10).gif().toBuffer())).rejects.toThrow(/not a supported image/);
    const jpeg = await image(400, 400).jpeg().toBuffer();
    await expect(processPhoto(jpeg.subarray(0, 600))).rejects.toThrow(/could not be read|not a supported/);
  });
});
