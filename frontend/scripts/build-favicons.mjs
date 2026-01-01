import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.resolve(process.cwd());
const publicDir = path.join(root, 'public');
const iconPath = path.join(publicDir, 'icon.svg');
const background = '#e4dfda';

const pngSizes = [16, 32, 192, 512];
const appleSize = 180;

async function renderPng(size, outputName) {
  const svgBuffer = await fs.readFile(iconPath);
  const icon = await sharp(svgBuffer)
    .resize(size, size, { fit: 'contain' })
    .png()
    .toBuffer();

  const canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  });

  await canvas.composite([{ input: icon }]).png().toFile(path.join(publicDir, outputName));
}

async function build() {
  await Promise.all(
    pngSizes.map((size) => renderPng(size, `favicon-${size}x${size}.png`))
  );

  await renderPng(appleSize, 'apple-touch-icon.png');

  const icoBuffers = await Promise.all(
    [16, 32].map(async (size) => {
      const svgBuffer = await fs.readFile(iconPath);
      const icon = await sharp(svgBuffer)
        .resize(size, size, { fit: 'contain' })
        .png()
        .toBuffer();

      return sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background,
        },
      })
        .composite([{ input: icon }])
        .png()
        .toBuffer();
    })
  );

  const ico = await pngToIco(icoBuffers);
  await fs.writeFile(path.join(publicDir, 'favicon.ico'), ico);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
