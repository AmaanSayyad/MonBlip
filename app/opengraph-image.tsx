import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const alt = 'MonBlip';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const mark = await readFile(join(process.cwd(), 'public/brand/monblip-mark-flat.png'));
  const src = `data:image/png;base64,${mark.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={src}
          width={360}
          height={360}
          style={{ borderRadius: 80 }}
        />
      </div>
    ),
    { ...size },
  );
}
