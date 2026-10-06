/**
 * 画像変換(rotate, scale)オプション
 */
export interface TransformImageOptions {
  /** 変換後の形式。既定は現在の形式 */
  mimeType?: string;
  /** 回転角度。90の倍数(負数も可)を指定する */
  angle?: number;
  /** -1 の場合は左右反転する */
  scaleX?: number;
  /** -1 の場合は上下反転する */
  scaleY?: number;
}

/**
 * ImageContext 生成時のオプション
 */
export interface ImageContextOptions {
  /** 拡張子を除いたファイル名。既定は File の名前から拡張子を除いたもの、それもなければ 'unknown' */
  name?: string;
  /**
   * 画像の形式。
   * 署名から形式を判定できる画像(PNG / JPEG / GIF / WebP / BMP)では、判定結果を優先する。
   * HTMLImageElement を渡した場合は、取り込むときの形式として使う。既定は PNG
   */
  mimeType?: string;
}

/** 入力として受け付ける画像データ */
export type ImageSource = string | Blob | File | ArrayBuffer | HTMLImageElement;

/** String.fromCharCode に一度に渡すバイト数。引数が多すぎるとスタックがあふれるため分割する */
const BASE64_CHUNK_SIZE = 0x8000;

/**
 * 画像データを簡易に扱えるようにしたクラス
 * 画像は ArrayBuffer で保持し、DataURL・base64・Blob・File への変換は呼ばれたときに行う。
 * mimeType は常に保持しているデータの実際の形式を表す。
 * ファイル名は拡張子を除いた名前と拡張子に分けて保持する。拡張子は中身の形式と一致しているとは限らない。
 *
 * 注) canvas などブラウザの API に依存するため、ブラウザ専用である
 */
export class ImageContext {

  private buffer: ArrayBuffer;
  private mimeType: string;
  private name: string;
  private extension: string;

  private constructor(buffer: ArrayBuffer, mimeType: string, name: string, extension: string) {
    this.buffer = buffer;
    this.mimeType = mimeType;
    this.name = name;
    this.extension = extension;
  }

  /**
   * 画像データから ImageContext を生成する
   *
   * @param {ImageSource | null} image
   *   string の場合、`data:` で始まれば DataURL、それ以外は base64 データとして解析する。
   *   File の場合、名前を拡張子を除いた名前と拡張子に分けて保持する。
   *   拡張子がない場合は、形式から拡張子を付ける。
   *   null または空文字の場合は、空の画像として生成する
   * @param {ImageContextOptions} [options]
   * @returns {Promise<ImageContext>}
   */
  public static async from(image: ImageSource | null, options?: ImageContextOptions): Promise<ImageContext> {
    if (!image) {
      return new ImageContext(new ArrayBuffer(0), options?.mimeType || '', options?.name || '', '');
    }
    const [buffer, declaredMimeType] = await readImage(image, options?.mimeType);
    const mimeType = detectImageType(buffer) || options?.mimeType || declaredMimeType || 'application/octet-stream';
    const [baseName, extension] = splitFileName(image instanceof File ? image.name : '');
    return new ImageContext(buffer, mimeType, options?.name || baseName || 'unknown', extension || extensionOf(mimeType));
  }

  /**
   * 拡張子を除いたファイル名を設定する
   *
   * @param {string} name 拡張子を除いたファイル名
   */
  public setName(name: string): void {
    this.name = name;
  }

  /**
   * DataURLを返す
   *
   * @returns {string}
   */
  public getDataURL(): string {
    return `data:${this.mimeType};base64,${this.getBase64()}`;
  }

  /**
   * Base64データを返す
   *
   * @returns {string}
   */
  public getBase64(): string {
    const bytes = new Uint8Array(this.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
      binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
    }
    return btoa(binary);
  }

  /**
   * ArrayBufferを返す
   *
   * @returns {ArrayBuffer}
   */
  public getArrayBuffer(): ArrayBuffer {
    return this.buffer;
  }

  /**
   * Blobデータを返す
   *
   * @returns {Blob}
   */
  public getBlob(): Blob {
    return new Blob([this.buffer], { type: this.mimeType });
  }

  /**
   * Fileオブジェクトを返す
   *
   * @returns {File}
   */
  public getFile(): File {
    return new File([this.buffer], this.getFileName(), { type: this.mimeType });
  }

  /**
   * 拡張子付きのファイル名を返す
   * 拡張子が空の場合は、拡張子を除いたファイル名だけを返す
   *
   * @returns {string}
   */
  public getFileName(): string {
    return this.extension ? `${this.name}.${this.extension}` : this.name;
  }

  /**
   * 拡張子を除いたファイル名を返す
   *
   * @returns {string}
   */
  public getName(): string {
    return this.name;
  }

  /**
   * 画像ファイルのサイズ(バイト数)を返す
   *
   * @returns {number}
   */
  public getSize(): number {
    return this.buffer.byteLength;
  }

  /**
   * 画像ファイルのMimeTypeを返す
   *
   * @returns {string}
   */
  public getMimeType(): string {
    return this.mimeType;
  }

  /**
   * 拡張子を設定する
   * 中身の形式と一致しているかは確かめない
   *
   * @param {string} extension 先頭の . を除いた拡張子
   */
  public setExtension(extension: string): void {
    this.extension = extension;
  }

  /**
   * 拡張子を返す
   *
   * @returns {string}
   */
  public getExtension(): string {
    return this.extension;
  }

  /**
   * 画像のサイズが指定したバイト数以下になるまで、縦横を縮小する
   * 既に収まっている場合は何もしない。
   * 縮小した画像は現在の形式で再エンコードする。ブラウザが出力できない形式の場合は PNG になる
   *
   * @param {number} maxSize 画像の最大サイズ(バイト数)
   */
  public async resize(maxSize: number): Promise<void> {
    if (this.getSize() <= maxSize) {
      return;
    }
    const bitmap = await createImageBitmap(this.getBlob());
    try {
      const canvas = document.createElement('canvas');
      const ctx = getContext2D(canvas);
      let width = bitmap.width;
      let height = bitmap.height;
      while (1 <= width && 1 <= height) {
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(bitmap, 0, 0, width, height);
        const blob = await canvasToBlob(canvas, this.mimeType);
        if (blob.size <= maxSize) {
          await this.replace(blob);
          return;
        }
        const shrinkRatio = getShrinkRatio(blob.size / maxSize);
        width = Math.floor(width * shrinkRatio);
        height = Math.floor(height * shrinkRatio);
      }
      throw new Error(`Failed to resize the image to ${maxSize} bytes or less`);
    } finally {
      bitmap.close();
    }
  }

  /**
   * 指定したオプションで画像を変換(rotate, scale)する
   * 反転したうえで回転する。回転・反転がなく、形式も変わらない場合は何もしない
   *
   * @param {TransformImageOptions} options
   */
  public async transform(options: TransformImageOptions): Promise<void> {
    const angle = (options.angle || 0) % 360;
    if (angle % 90 !== 0) {
      throw new Error(`Invalid angle. The angle must be a multiple of 90 degrees. ${options.angle}`);
    }
    const flipX = options.scaleX === -1;
    const flipY = options.scaleY === -1;
    const mimeType = options.mimeType || this.mimeType;
    if (angle === 0 && !flipX && !flipY && mimeType === this.mimeType) {
      return;
    }

    const bitmap = await createImageBitmap(this.getBlob());
    try {
      const canvas = document.createElement('canvas');
      const ctx = getContext2D(canvas);
      const swapsSides = angle % 180 !== 0;
      canvas.width = swapsSides ? bitmap.height : bitmap.width;
      canvas.height = swapsSides ? bitmap.width : bitmap.height;
      // 画像の中心を原点にして回転・反転し、キャンバスの中央に描画する
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(angle * Math.PI / 180);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      await this.replace(await canvasToBlob(canvas, mimeType));
    } finally {
      bitmap.close();
    }
  }

  /**
   * 画像を指定した形式に変換する
   * 現在と同じ形式の場合は何もしない。ブラウザが出力できない形式の場合は PNG になる
   *
   * @param {string} mimeType 変換後の形式
   */
  public async convert(mimeType: string): Promise<void> {
    await this.transform({ mimeType: mimeType });
  }

  /**
   * 保持する画像を、canvas で再エンコードした結果に置き換える
   * 形式が変わった場合は、拡張子を新しい形式のものに付け直す
   *
   * @param {Blob} blob
   */
  private async replace(blob: Blob): Promise<void> {
    if (blob.type !== this.mimeType) {
      this.extension = extensionOf(blob.type);
    }
    this.buffer = await blob.arrayBuffer();
    this.mimeType = blob.type;
  }
}

/**
 * ファイル名を、拡張子を除いた名前と拡張子に分ける
 *
 * @param {string} fileName
 * @returns {[string, string]}
 *   0番目: 拡張子を除いた名前
 *   1番目: 先頭の . を除いた拡張子。拡張子がない場合は空文字
 */
const splitFileName = (fileName: string): [string, string] => {
  const index = fileName.lastIndexOf('.');
  // '.gitignore' のように先頭だけに . がある名前や、末尾が . の名前は拡張子なしとみなす
  if (index <= 0 || index === fileName.length - 1) {
    return [fileName, ''];
  }
  return [fileName.slice(0, index), fileName.slice(index + 1)];
};

/**
 * 形式から拡張子を決める
 *
 * @param {string} mimeType
 * @returns {string} 判断つかない場合は png
 */
const extensionOf = (mimeType: string): string => {
  const type = mimeType.split('/')[1];
  switch (type) {
    case 'png':
    case 'gif':
    case 'webp':
    case 'bmp':
      return type;
    case 'jpeg':
      return 'jpg';
    case 'svg+xml':
      return 'svg';
    default:
      return 'png';
  }
};

/**
 * 画像データを ArrayBuffer として読み込む
 *
 * @param {ImageSource} image
 * @param {string} [mimeType] HTMLImageElement を取り込むときの形式
 * @returns {Promise<[ArrayBuffer, string | undefined]>}
 *   0番目: 画像データ
 *   1番目: 入力が示す MimeType。示されていない場合は undefined
 */
const readImage = async (image: ImageSource, mimeType?: string): Promise<[ArrayBuffer, string | undefined]> => {
  if (typeof image === 'string') {
    const isDataURL = image.startsWith('data:');
    const response = await fetch(isDataURL ? image : `data:application/octet-stream;base64,${image}`);
    const blob = await response.blob();
    return [await blob.arrayBuffer(), isDataURL ? blob.type : undefined];
  }
  if (image instanceof Blob) {
    return [await image.arrayBuffer(), image.type];
  }
  if (image instanceof ArrayBuffer) {
    return [image, undefined];
  }
  // 読み込みが終わっていない img は描画できないため、デコードの完了を待つ
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  getContext2D(canvas).drawImage(image, 0, 0);
  const blob = await canvasToBlob(canvas, mimeType);
  return [await blob.arrayBuffer(), blob.type];
};

/**
 * 先頭の署名から画像の形式を判定する
 *
 * @param {ArrayBuffer} buffer
 * @returns {string | undefined} PNG / JPEG / GIF / WebP / BMP のいずれでもない場合は undefined
 */
const detectImageType = (buffer: ArrayBuffer): string | undefined => {
  const bytes = new Uint8Array(buffer);
  const matches = (signature: number[], offset: number = 0): boolean => {
    return signature.every((byte, i) => bytes[offset + i] === byte);
  };
  if (matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (matches([0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (matches([0x47, 0x49, 0x46, 0x38])) {
    return 'image/gif';
  }
  if (matches([0x52, 0x49, 0x46, 0x46]) && matches([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  if (matches([0x42, 0x4d])) {
    return 'image/bmp';
  }
  return undefined;
};

/**
 * canvas の 2D コンテキストを返す
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D}
 */
const getContext2D = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('This browser does not support 2D image context');
  }
  return ctx;
};

/**
 * canvas の内容を指定した形式でエンコードする
 * ブラウザが出力できない形式を指定した場合は PNG になる
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} [mimeType]
 * @returns {Promise<Blob>}
 */
const canvasToBlob = (canvas: HTMLCanvasElement, mimeType?: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to encode the image'));
      }
    }, mimeType);
  });
};

/**
 * 目標サイズに対する現在のサイズの倍率から、1回の縮小で縦横に掛ける比率を決める
 * 目標から遠いほど大きく縮め、近づくほど小刻みに縮めて、必要以上に小さくならないようにする
 *
 * @param {number} ratio 現在のサイズ / 目標サイズ
 * @returns {number}
 */
const getShrinkRatio = (ratio: number): number => {
  if (5 < ratio) {
    return 0.5;
  }
  if (3 < ratio) {
    return 0.6;
  }
  if (2 < ratio) {
    return 0.7;
  }
  if (1.5 < ratio) {
    return 0.8;
  }
  if (1.2 < ratio) {
    return 0.9;
  }
  return 0.95;
};
