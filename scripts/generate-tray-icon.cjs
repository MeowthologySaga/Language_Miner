const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const outputDir = path.join(__dirname, "..", "electron", "assets");
const pngIconPath = path.join(outputDir, "tray-mole-miner.png");
const icoIconPath = path.join(outputDir, "tray-mole-miner.ico");
const icoSizes = [16, 20, 24, 32, 48, 64, 256];

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(pngIconPath, encodePng(drawIcon(64), 64, 64));
fs.writeFileSync(
  icoIconPath,
  encodeIco(
    icoSizes.map((size) => ({
      size,
      png: encodePng(drawIcon(size), size, size)
    }))
  )
);
console.log(`Generated ${pngIconPath}`);
console.log(`Generated ${icoIconPath}`);

function drawIcon(size) {
  const width = size;
  const height = size;
  const scale = size / 64;
  const pixels = Buffer.alloc(width * height * 4);
  const c = {
    transparent: rgba(0, 0, 0, 0),
    border: rgba(30, 64, 175, 255),
    background: rgba(37, 99, 235, 255),
    highlight: rgba(96, 165, 250, 255),
    white: rgba(248, 250, 252, 255),
    mint: rgba(94, 234, 212, 255),
    shadow: rgba(15, 23, 42, 115)
  };

  fillRect(pixels, width, height, 0, 0, width, height, c.transparent);
  fillRoundedRect(pixels, width, height, s(2), s(2), s(60), s(60), s(15), c.border);
  fillRoundedRect(pixels, width, height, s(5), s(5), s(54), s(54), s(12), c.background);
  fillRoundedRect(pixels, width, height, s(9), s(9), s(46), s(12), s(6), c.highlight);

  // A deterministic geometric LM lettermark. It uses no font, source image,
  // external model, or third-party artwork, so every packaged raster derives
  // solely from this GPL-licensed source file.
  drawLine(pixels, width, height, s(16), s(20), s(16), s(45), c.shadow, s(7));
  drawLine(pixels, width, height, s(16), s(45), s(28), s(45), c.shadow, s(7));
  drawLine(pixels, width, height, s(15), s(19), s(15), s(44), c.white, s(6));
  drawLine(pixels, width, height, s(15), s(44), s(27), s(44), c.white, s(6));

  drawLine(pixels, width, height, s(32), s(45), s(32), s(20), c.shadow, s(6));
  drawLine(pixels, width, height, s(32), s(20), s(40), s(32), c.shadow, s(6));
  drawLine(pixels, width, height, s(40), s(32), s(48), s(20), c.shadow, s(6));
  drawLine(pixels, width, height, s(48), s(20), s(48), s(45), c.shadow, s(6));
  drawLine(pixels, width, height, s(31), s(44), s(31), s(19), c.mint, s(5));
  drawLine(pixels, width, height, s(31), s(19), s(39), s(31), c.mint, s(5));
  drawLine(pixels, width, height, s(39), s(31), s(47), s(19), c.mint, s(5));
  drawLine(pixels, width, height, s(47), s(19), s(47), s(44), c.mint, s(5));
  return pixels;

  function s(value) {
    return Math.max(1, Math.round(value * scale));
  }
}

function encodeIco(images) {
  const directorySize = 6 + images.length * 16;
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let imageOffset = directorySize;
  images.forEach((image, index) => {
    const entryOffset = 6 + index * 16;
    header[entryOffset] = image.size >= 256 ? 0 : image.size;
    header[entryOffset + 1] = image.size >= 256 ? 0 : image.size;
    header[entryOffset + 2] = 0;
    header[entryOffset + 3] = 0;
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(image.png.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.png.length;
  });

  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

function encodePng(rgba, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rawRowOffset = y * (width * 4 + 1);
    raw[rawRowOffset] = 0;
    rgba.copy(raw, rawRowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr(width, height)),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function ihdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function rgba(r, g, b, a) {
  return { r, g, b, a };
}

function setPixel(buffer, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const offset = (y * width + x) * 4;
  buffer[offset] = color.r;
  buffer[offset + 1] = color.g;
  buffer[offset + 2] = color.b;
  buffer[offset + 3] = color.a;
}

function fillRect(buffer, width, height, x, y, rectWidth, rectHeight, color) {
  for (let pixelY = y; pixelY < y + rectHeight; pixelY += 1) {
    for (let pixelX = x; pixelX < x + rectWidth; pixelX += 1) {
      setPixel(buffer, width, height, pixelX, pixelY, color);
    }
  }
}

function fillRoundedRect(buffer, width, height, x, y, rectWidth, rectHeight, radius, color) {
  const right = x + rectWidth - 1;
  const bottom = y + rectHeight - 1;
  for (let pixelY = y; pixelY <= bottom; pixelY += 1) {
    for (let pixelX = x; pixelX <= right; pixelX += 1) {
      const cornerX = pixelX < x + radius ? x + radius : pixelX > right - radius ? right - radius : pixelX;
      const cornerY = pixelY < y + radius ? y + radius : pixelY > bottom - radius ? bottom - radius : pixelY;
      const dx = pixelX - cornerX;
      const dy = pixelY - cornerY;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(buffer, width, height, pixelX, pixelY, color);
      }
    }
  }
}

function fillEllipse(buffer, width, height, x, y, ellipseWidth, ellipseHeight, color) {
  const radiusX = ellipseWidth / 2;
  const radiusY = ellipseHeight / 2;
  const centerX = x + radiusX;
  const centerY = y + radiusY;
  for (let pixelY = y; pixelY < y + ellipseHeight; pixelY += 1) {
    for (let pixelX = x; pixelX < x + ellipseWidth; pixelX += 1) {
      const nx = (pixelX + 0.5 - centerX) / radiusX;
      const ny = (pixelY + 0.5 - centerY) / radiusY;
      if (nx * nx + ny * ny <= 1) {
        setPixel(buffer, width, height, pixelX, pixelY, color);
      }
    }
  }
}

function drawLine(buffer, width, height, x1, y1, x2, y2, color, thickness) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps;
    const centerX = Math.round(x1 + (x2 - x1) * ratio);
    const centerY = Math.round(y1 + (y2 - y1) * ratio);
    fillEllipse(
      buffer,
      width,
      height,
      centerX - Math.floor(thickness / 2),
      centerY - Math.floor(thickness / 2),
      thickness,
      thickness,
      color
    );
  }
}
