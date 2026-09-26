export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB 最大选择文件
export const MAX_STORED_WALLPAPER_DATA_URL_LENGTH = 450_000; // 约 330 KB Base64
export const MAX_STORED_SPRITE_DATA_URL_LENGTH = 260_000;    // 约 190 KB Base64

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

const loadDataUrlImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('图片解码失败，请换用标准 PNG/JPEG/WebP 图片'));
    image.onload = () => resolve(image);
    image.src = dataUrl;
  });

const encodeCanvasLossy = (canvas: HTMLCanvasElement, quality: number, allowJpeg = true): string => {
  try {
    const webp = canvas.toDataURL('image/webp', quality);
    if (webp.startsWith('data:image/webp')) return webp;
  } catch {}
  if (allowJpeg) {
    try {
      const jpeg = canvas.toDataURL('image/jpeg', quality);
      if (jpeg.startsWith('data:image/jpeg')) return jpeg;
    } catch {}
  }
  return canvas.toDataURL('image/png');
};

/**
 * 压缩背景壁纸（宽屏 1280 或坚屏 1280 内缩放，转为高质量 WebP DataURL，兼容 JPEG）
 */
export async function createStoredWallpaper(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择有效的 PNG、JPEG 或 WebP 图片');
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error('图片文件过大，请选择 10 MB 以内的图片');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const image = await loadDataUrlImage(rawDataUrl);

  const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = largestSide > 1280 ? 1280 / largestSide : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境无法创建画布处理图片');

  ctx.drawImage(image, 0, 0, width, height);

  for (const quality of [0.84, 0.75, 0.65, 0.55]) {
    const compressed = encodeCanvasLossy(canvas, quality, true);
    if (compressed.length <= MAX_STORED_WALLPAPER_DATA_URL_LENGTH) {
      return compressed;
    }
  }

  // 极端情况下二次降采样
  canvas.width = Math.round(width * 0.75);
  canvas.height = Math.round(height * 0.75);
  const ctx2 = canvas.getContext('2d');
  if (ctx2) {
    ctx2.drawImage(image, 0, 0, canvas.width, canvas.height);
    const fallbackCompressed = encodeCanvasLossy(canvas, 0.65, true);
    if (fallbackCompressed.length <= MAX_STORED_WALLPAPER_DATA_URL_LENGTH) {
      return fallbackCompressed;
    }
  }

  throw new Error('壁纸压缩后仍过大，请换用构图更简单的图片');
}

/**
 * 压缩角色表情立绘（512x512 内缩放，保留透明通道，转为 WebP DataURL）
 */
export async function createStoredSprite(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择有效的 PNG、JPEG 或 WebP 图片');
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error('表情图片过大，请选择 10 MB 以内的图片');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const image = await loadDataUrlImage(rawDataUrl);

  const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = largestSide > 512 ? 512 / largestSide : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境无法处理表情图片');

  ctx.drawImage(image, 0, 0, width, height);

  for (const quality of [0.86, 0.76, 0.66, 0.55, 0.45]) {
    const compressed = encodeCanvasLossy(canvas, quality, false);
    if (compressed.length <= MAX_STORED_SPRITE_DATA_URL_LENGTH) {
      return compressed;
    }
  }

  // 极端复杂表情图片二次自适应降采样至 384px 保证压缩成功
  const fallbackScale = Math.min(384 / largestSide, 1);
  canvas.width = Math.max(1, Math.round(image.naturalWidth * fallbackScale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * fallbackScale));
  const fallbackCtx = canvas.getContext('2d');
  if (fallbackCtx) {
    fallbackCtx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.75, 0.6, 0.45]) {
      const compressed = encodeCanvasLossy(canvas, quality, false);
      if (compressed.length <= MAX_STORED_SPRITE_DATA_URL_LENGTH) {
        return compressed;
      }
    }
  }

  throw new Error('表情图片压缩后仍过大，请换用更小分辨率的图片');
}
