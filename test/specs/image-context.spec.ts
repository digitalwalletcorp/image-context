import { describe, it, expect } from 'vitest';
import { ImageContext } from '@/image-context';

type RGB = [number, number, number];

const RED: RGB = [255, 0, 0];
const GREEN: RGB = [0, 255, 0];
const BLUE: RGB = [0, 0, 255];
const WHITE: RGB = [255, 255, 255];

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const toBlob = (canvas: HTMLCanvasElement, mimeType?: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), mimeType);
  });
};

/**
 * 左上:赤 右上:緑 左下:青 右下:白 に塗り分けた横長の画像を作る
 * 回転・反転の結果を四隅の色で確かめるために使う
 */
const createQuadrantCanvas = (width: number = 40, height: number = 20): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const quadrants: [number, number, RGB][] = [[0, 0, RED], [1, 0, GREEN], [0, 1, BLUE], [1, 1, WHITE]];
  for (const [col, row, [r, g, b]] of quadrants) {
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(col * width / 2, row * height / 2, width / 2, height / 2);
  }
  return canvas;
};

/**
 * 圧縮が効かないよう、ランダムな色で塗った画像を作る
 */
const createNoiseCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);
  for (let i = 0; i < imageData.data.length; i++) {
    imageData.data[i] = i % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

/**
 * ImageContext が保持する画像をデコードし、寸法と各位置の色を返す
 */
const decode = async (context: ImageContext): Promise<{ width: number; height: number; colorAt: (x: number, y: number) => RGB; }> => {
  const bitmap = await createImageBitmap(context.getBlob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return {
    width: canvas.width,
    height: canvas.height,
    colorAt: (x: number, y: number): RGB => {
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      return [r, g, b];
    }
  };
};

/**
 * 四隅付近の色を 左上・右上・左下・右下 の順で返す
 */
const cornerColors = async (context: ImageContext): Promise<RGB[]> => {
  const { width, height, colorAt } = await decode(context);
  return [colorAt(1, 1), colorAt(width - 2, 1), colorAt(1, height - 2), colorAt(width - 2, height - 2)];
};

const bytesOf = (context: ImageContext): number[] => [...new Uint8Array(context.getArrayBuffer())];

describe('@/image-context.ts', () => {

  describe('from', () => {
    it('DataURL を読み込めること', async () => {
      const png = await toBlob(createQuadrantCanvas());
      const dataURL = `data:image/png;base64,${(await ImageContext.from(png)).getBase64()}`;
      const context = await ImageContext.from(dataURL);
      expect(context.getMimeType()).toBe('image/png');
      expect(context.getSize()).toBe(png.size);
      expect(context.getName()).toBe('unknown');
      expect(context.getFileName()).toBe('unknown.png');
    });
    it('base64 文字列を読み込み、署名から形式を判定すること', async () => {
      const jpeg = await toBlob(createQuadrantCanvas(), 'image/jpeg');
      const base64 = (await ImageContext.from(jpeg)).getBase64();
      const context = await ImageContext.from(base64);
      expect(context.getMimeType()).toBe('image/jpeg');
      expect(context.getSize()).toBe(jpeg.size);
    });
    it('Blob を読み込めること', async () => {
      const png = await toBlob(createQuadrantCanvas());
      const context = await ImageContext.from(png);
      expect(context.getMimeType()).toBe('image/png');
      expect(bytesOf(context).slice(0, 8)).toEqual(PNG_SIGNATURE);
    });
    it('File の名前を、拡張子を除いた名前と拡張子に分けて引き継ぐこと', async () => {
      const png = await toBlob(createQuadrantCanvas());
      const context = await ImageContext.from(new File([png], 'photo.png', { type: 'image/png' }));
      expect(context.getName()).toBe('photo');
      expect(context.getExtension()).toBe('png');
      expect(context.getFileName()).toBe('photo.png');
    });
    it('File の拡張子は、表記も中身との一致も問わずそのまま引き継ぐこと', async () => {
      const png = await toBlob(createQuadrantCanvas());
      expect((await ImageContext.from(new File([png], 'IMG_001.JPG'))).getFileName()).toBe('IMG_001.JPG');
      const mismatched = await ImageContext.from(new File([png], 'photo.jpg'));
      expect(mismatched.getFileName()).toBe('photo.jpg');
      expect(mismatched.getMimeType()).toBe('image/png');
    });
    it('File の名前に拡張子がない場合は、形式から拡張子を付けること', async () => {
      const png = await toBlob(createQuadrantCanvas());
      for (const fileName of ['photo', '.photo', 'photo.']) {
        const context = await ImageContext.from(new File([png], fileName));
        expect(context.getName()).toBe(fileName);
        expect(context.getFileName()).toBe(`${fileName}.png`);
      }
    });
    it('ArrayBuffer を読み込めること', async () => {
      const png = await toBlob(createQuadrantCanvas());
      const context = await ImageContext.from(await png.arrayBuffer());
      expect(context.getMimeType()).toBe('image/png');
      expect(context.getSize()).toBe(png.size);
    });
    it('HTMLImageElement を読み込めること。既定は PNG で取り込む', async () => {
      const img = new Image();
      img.src = createQuadrantCanvas().toDataURL();
      const context = await ImageContext.from(img);
      expect(context.getMimeType()).toBe('image/png');
      expect(await cornerColors(context)).toEqual([RED, GREEN, BLUE, WHITE]);
    });
    it('HTMLImageElement を mimeType で指定した形式で取り込めること', async () => {
      const img = new Image();
      img.src = createQuadrantCanvas().toDataURL();
      const context = await ImageContext.from(img, { mimeType: 'image/jpeg' });
      expect(context.getMimeType()).toBe('image/jpeg');
    });
    it('null・空文字は空の画像になること', async () => {
      for (const image of [null, '']) {
        const context = await ImageContext.from(image);
        expect(context.getSize()).toBe(0);
        expect(context.getMimeType()).toBe('');
        expect(context.getName()).toBe('');
        expect(context.getExtension()).toBe('');
        expect(context.getFileName()).toBe('');
      }
    });
    it('options.name でファイル名を指定できること', async () => {
      const png = await toBlob(createQuadrantCanvas());
      const context = await ImageContext.from(new File([png], 'photo.png'), { name: 'renamed' });
      expect(context.getName()).toBe('renamed');
      expect(context.getFileName()).toBe('renamed.png');
    });
    it('署名から判定できる形式は、入力が示す形式や options.mimeType より判定結果を優先すること', async () => {
      const png = await toBlob(createQuadrantCanvas());
      expect((await ImageContext.from(new Blob([png], { type: 'image/jpeg' }))).getMimeType()).toBe('image/png');
      expect((await ImageContext.from(png, { mimeType: 'image/jpeg' })).getMimeType()).toBe('image/png');
    });
    it('署名から判定できない形式は options.mimeType、次に入力が示す形式を使うこと', async () => {
      const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' });
      expect((await ImageContext.from(svg)).getMimeType()).toBe('image/svg+xml');
      expect((await ImageContext.from(svg, { mimeType: 'image/x-custom' })).getMimeType()).toBe('image/x-custom');
      expect((await ImageContext.from(await svg.arrayBuffer())).getMimeType()).toBe('application/octet-stream');
    });
    it('GIF / WebP / BMP を署名から判定すること', async () => {
      const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
      const cases: [number[], string][] = [
        [ascii('GIF89a'), 'image/gif'],
        [[...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')], 'image/webp'],
        [ascii('BM'), 'image/bmp']
      ];
      for (const [bytes, mimeType] of cases) {
        expect((await ImageContext.from(new Uint8Array(bytes).buffer)).getMimeType()).toBe(mimeType);
      }
    });
    it('base64 として不正な文字列は reject すること', async () => {
      await expect(ImageContext.from('not base64!!')).rejects.toThrow();
    });
    it('壊れた画像の HTMLImageElement は無応答にならず reject すること', async () => {
      const img = new Image();
      img.src = 'data:image/png;base64,AAAA';
      await expect(ImageContext.from(img)).rejects.toThrow();
    });
  });

  describe('getters', () => {
    it('getBase64 / getDataURL が保持するデータを表すこと', async () => {
      const context = await ImageContext.from(new Uint8Array([...PNG_SIGNATURE, 0xff]).buffer);
      const base64 = btoa(String.fromCharCode(...PNG_SIGNATURE, 0xff));
      expect(context.getBase64()).toBe(base64);
      expect(context.getDataURL()).toBe(`data:image/png;base64,${base64}`);
    });
    it('分割して変換する大きさを超えるデータも base64 で往復できること', async () => {
      const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
      const context = await ImageContext.from(bytes.buffer);
      const restored = await ImageContext.from(context.getBase64());
      expect(bytesOf(restored)).toEqual([...bytes]);
    });
    it('getBlob / getFile が MimeType・名前・中身を引き継ぐこと', async () => {
      const png = await toBlob(createQuadrantCanvas());
      const context = await ImageContext.from(png, { name: 'a' });
      const blob = context.getBlob();
      const file = context.getFile();
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBe(png.size);
      expect(file.type).toBe('image/png');
      expect(file.name).toBe('a.png');
      expect([...new Uint8Array(await file.arrayBuffer())]).toEqual(bytesOf(context));
    });
    it('setName は拡張子を除いた名前を設定し、拡張子には触れないこと', async () => {
      const context = await ImageContext.from(await toBlob(createQuadrantCanvas()));
      context.setName('b');
      expect(context.getName()).toBe('b');
      expect(context.getFile().name).toBe('b.png');
      context.setName('sample.jpg');
      expect(context.getFileName()).toBe('sample.jpg.png');
    });
    it('setExtension は渡された拡張子をそのまま設定すること', async () => {
      const context = await ImageContext.from(await toBlob(createQuadrantCanvas()), { name: 'c' });
      context.setExtension('PNG');
      expect(context.getExtension()).toBe('PNG');
      expect(context.getFile().name).toBe('c.PNG');
      context.setExtension('');
      expect(context.getFileName()).toBe('c');
    });
    it('名前に拡張子がない場合は、MimeType から拡張子を付けること', async () => {
      const cases: [string, string][] = [
        ['image/png', 'png'],
        ['image/jpeg', 'jpg'],
        ['image/gif', 'gif'],
        ['image/webp', 'webp'],
        ['image/bmp', 'bmp'],
        ['image/svg+xml', 'svg'],
        ['application/octet-stream', 'png']
      ];
      for (const [mimeType, extension] of cases) {
        const context = await ImageContext.from(new Blob(['x'], { type: mimeType }));
        expect(context.getExtension()).toBe(extension);
      }
    });
  });

  describe('resize', () => {
    it('指定したバイト数以下になるまで縮小し、形式を保つこと', async () => {
      const context = await ImageContext.from(await toBlob(createNoiseCanvas(300, 200)));
      const maxSize = 30 * 1024;
      expect(maxSize < context.getSize()).toBe(true);
      await context.resize(maxSize);
      const { width, height } = await decode(context);
      expect(context.getSize()).toBeLessThanOrEqual(maxSize);
      expect(context.getMimeType()).toBe('image/png');
      expect(width < 300).toBe(true);
      expect(Math.abs(width / height - 1.5) < 0.05).toBe(true);
    });
    it('JPEG は JPEG のまま縮小し、拡張子の表記を残すこと', async () => {
      const jpeg = await toBlob(createNoiseCanvas(300, 300), 'image/jpeg');
      const context = await ImageContext.from(new File([jpeg], 'IMG_001.JPG'));
      const maxSize = Math.floor(context.getSize() / 3);
      await context.resize(maxSize);
      expect(context.getSize()).toBeLessThanOrEqual(maxSize);
      expect(context.getMimeType()).toBe('image/jpeg');
      expect(bytesOf(context).slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
      expect(context.getFileName()).toBe('IMG_001.JPG');
    });
    it('既に収まっている場合は保持するデータをそのまま残すこと', async () => {
      const context = await ImageContext.from(await toBlob(createQuadrantCanvas()));
      const buffer = context.getArrayBuffer();
      await context.resize(1024 * 1024);
      await context.resize(context.getSize());
      expect(context.getArrayBuffer()).toBe(buffer);
    });
    it('縦横が1pxを下回っても収まらない場合はエラーにすること', async () => {
      const context = await ImageContext.from(await toBlob(createQuadrantCanvas()));
      await expect(context.resize(1)).rejects.toThrow('Failed to resize the image to 1 bytes or less');
    });
    it('デコードできないデータは無応答にならず reject すること', async () => {
      const context = await ImageContext.from(new Uint8Array([...PNG_SIGNATURE, 0, 0, 0]).buffer);
      await expect(context.resize(1)).rejects.toThrow();
    });
  });

  describe('transform', () => {
    const createContext = async (): Promise<ImageContext> => ImageContext.from(await toBlob(createQuadrantCanvas()));

    it('回転・反転がなく形式も同じ場合は何もしないこと', async () => {
      const context = await createContext();
      const buffer = context.getArrayBuffer();
      await context.transform({});
      await context.transform({ angle: 360, scaleX: 1, scaleY: 1, mimeType: 'image/png' });
      expect(context.getArrayBuffer()).toBe(buffer);
    });
    it('90度回転すると縦横が入れ替わり、時計回りに回ること', async () => {
      const context = await createContext();
      await context.transform({ angle: 90 });
      const { width, height } = await decode(context);
      expect([width, height]).toEqual([20, 40]);
      expect(await cornerColors(context)).toEqual([BLUE, RED, WHITE, GREEN]);
    });
    it('180度回転', async () => {
      const context = await createContext();
      await context.transform({ angle: 180 });
      expect(await cornerColors(context)).toEqual([WHITE, BLUE, GREEN, RED]);
    });
    it('-90度は270度と同じ結果になること', async () => {
      const minus = await createContext();
      const plus = await createContext();
      await minus.transform({ angle: -90 });
      await plus.transform({ angle: 270 });
      expect(await cornerColors(minus)).toEqual([GREEN, WHITE, RED, BLUE]);
      expect(await cornerColors(plus)).toEqual([GREEN, WHITE, RED, BLUE]);
    });
    it('scaleX: -1 で左右反転すること', async () => {
      const context = await createContext();
      await context.transform({ scaleX: -1 });
      expect(await cornerColors(context)).toEqual([GREEN, RED, WHITE, BLUE]);
    });
    it('scaleY: -1 で上下反転すること', async () => {
      const context = await createContext();
      await context.transform({ scaleY: -1 });
      expect(await cornerColors(context)).toEqual([BLUE, WHITE, RED, GREEN]);
    });
    it('反転したうえで回転すること', async () => {
      const context = await createContext();
      await context.transform({ angle: 90, scaleX: -1 });
      expect(await cornerColors(context)).toEqual([WHITE, GREEN, BLUE, RED]);
    });
    it('mimeType だけを指定すると形式を変換すること', async () => {
      const context = await createContext();
      await context.transform({ mimeType: 'image/jpeg' });
      expect(context.getMimeType()).toBe('image/jpeg');
      expect(bytesOf(context).slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
    });
    it('ブラウザが出力できない形式は PNG になり、MimeType も PNG になること', async () => {
      const png = await toBlob(createQuadrantCanvas());
      const context = await ImageContext.from(new File([png], 'a.PNG'));
      await context.transform({ mimeType: 'image/bmp' });
      expect(context.getMimeType()).toBe('image/png');
      expect(bytesOf(context).slice(0, 8)).toEqual(PNG_SIGNATURE);
      expect(context.getFileName()).toBe('a.PNG');
    });
    it('形式が変わらない回転・反転では拡張子を残すこと', async () => {
      const context = await ImageContext.from(new File([await toBlob(createQuadrantCanvas())], 'a.PNG'));
      await context.transform({ angle: 90 });
      expect(context.getFileName()).toBe('a.PNG');
    });
    it('回転と同時に形式を変換し、拡張子を新しい形式の小文字に付け直すこと', async () => {
      const context = await ImageContext.from(new File([await toBlob(createQuadrantCanvas())], 'a.PNG'));
      await context.transform({ angle: 90, mimeType: 'image/jpeg' });
      expect(context.getMimeType()).toBe('image/jpeg');
      expect(context.getFileName()).toBe('a.jpg');
    });
    it('90の倍数でない角度はエラーにすること', async () => {
      const context = await createContext();
      await expect(context.transform({ angle: 45 })).rejects.toThrow('Invalid angle');
    });
  });

  describe('convert', () => {
    it('指定した形式に変換し、拡張子を新しい形式の小文字に付け直すこと', async () => {
      const context = await ImageContext.from(new File([await toBlob(createQuadrantCanvas())], 'IMG_001.PNG'));
      await context.convert('image/jpeg');
      expect(context.getMimeType()).toBe('image/jpeg');
      expect(bytesOf(context).slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
      expect(context.getFileName()).toBe('IMG_001.jpg');
      const { width, height } = await decode(context);
      expect([width, height]).toEqual([40, 20]);
    });
    it('現在と同じ形式の場合は何もしないこと', async () => {
      const context = await ImageContext.from(new File([await toBlob(createQuadrantCanvas())], 'a.PNG'));
      const buffer = context.getArrayBuffer();
      await context.convert('image/png');
      expect(context.getArrayBuffer()).toBe(buffer);
      expect(context.getFileName()).toBe('a.PNG');
    });
  });
});
