# image-context

[![NPM Version](https://img.shields.io/npm/v/%40digitalwalletcorp%2Fimage-context)](https://www.npmjs.com/package/@digitalwalletcorp/image-context) [![License](https://img.shields.io/npm/l/%40digitalwalletcorp%2Fimage-context)](https://opensource.org/licenses/MIT) [![Build Status](https://img.shields.io/github/actions/workflow/status/digitalwalletcorp/image-context/ci.yml?branch=main)](https://github.com/digitalwalletcorp/image-context/actions) [![Test Coverage](https://img.shields.io/codecov/c/github/digitalwalletcorp/image-context.svg)](https://codecov.io/gh/digitalwalletcorp/image-context)

Easily convert, resize, rotate, and process images in the browser. Supports DataURL, Base64, `Blob`, `File`, `ArrayBuffer`, and `HTMLImageElement` with zero dependencies.

#### ✨ Features

* **Flexible Input & Output**: Convert seamlessly between DataURL, Base64, `Blob`, `File`, `ArrayBuffer`, and `HTMLImageElement`.
* **Automatic Format Detection**: PNG, JPEG, GIF, WebP, and BMP are identified directly from the binary signature.
* **Resize to Byte Limit**: `resize(maxSize)` shrinks image dimensions step by step to fit under a specific file size (in bytes) while preserving aspect ratio.
* **Rotate, Flip & Convert**: Rotate by 90-degree increments, flip horizontally/vertically, or change format easily.
* **Zero Dependencies**: Lightweight and fully browser-compatible.

> ⚠️ **Memory Notice**: `getDataURL()` and `getBase64()` construct a new string on each call. For large images, call them once and reuse the result instead of calling them repeatedly.

> ⚠️ **Re-encoding Notice**: `transform()`, `convert()`, and `resize()` re-encode the image. Exif metadata is not preserved, and animated GIFs will keep only their first frame. Repeated re-encoding of JPEG or WebP images gradually reduces quality.

#### ✅ Compatibility

- ✅ **Browsers**: Fully supported on all modern browsers.
- ❌ **Node.js**: Not supported (depends on browser Canvas APIs).
- ✅ **Module formats**: CommonJS and ESM.

#### 📦 Installation

```bash
npm install @digitalwalletcorp/image-context
# or
yarn add @digitalwalletcorp/image-context
```

#### 📖 Usage

```ts
import { ImageContext } from '@digitalwalletcorp/image-context';

// <input type="file" accept="image/*">
const image = await ImageContext.from(input.files[0]);
await image.resize(400 * 1024);   // 400 KB or less
const file = image.getFile();     // a File with the original file name
```

##### Upload a selected image under a size limit

```ts
const image = await ImageContext.from(input.files[0]);
await image.resize(400 * 1024);
const formData = new FormData();
formData.append('file', image.getFile());
await fetch('/api/upload', { method: 'POST', body: formData });
```

##### Show an image stored as base64

The format is identified automatically from data, so Base64 strings without MIME types work out of the box.

```ts
const image = await ImageContext.from(record.photo);   // Base64 of a JPEG image
image.getMimeType();                                   // 'image/jpeg'
img.src = image.getDataURL();                          // 'data:image/jpeg;base64,/9j/...'
```

##### Rotate and flip an image element

```ts
const image = await ImageContext.from(img, { name: 'photo' });
await image.transform({ angle: 90, scaleX: -1 });   // Flip horizontally, then rotate 90 degrees clockwise
img.src = image.getDataURL();
```

##### Convert to JPEG

```ts
const image = await ImageContext.from(file);   // File { name: 'photo.png', type: 'image/png' }
await image.convert('image/jpeg');
image.getFile();                               // File { name: 'photo.jpg', type: 'image/jpeg' }
```

### 📚 API Reference

#### ImageContext

An image container providing methods to convert, resize, and transform image data.
Created via `ImageContext.from()`.

##### 📥 Creating

**`ImageContext.from(image, options?)`**

Reads `image` and returns a `Promise<ImageContext>`.
The format is automatically identified from the data signature. If it cannot be identified, `options.mimeType` or the declared type is used.

| `image` | Description |
| ------- | ----------- |
| `string` starting with `data:` | A DataURL. |
| Other `string` | Base64 data. Rejects on invalid Base64.. |
| `Blob` / `File` | Image content. For `File`, the name and extension are split automatically. |
| `ArrayBuffer` | Raw binary image data. |
| `HTMLImageElement` | Loaded element. Encodes as PNG or `options.mimeType`. |
| `null` / `''` | Empty image with size `0`. |

| Option (`ImageContextOptions`) | Type | Default | Description |
| ------------------------------ | ---- | ------- | ----------- |
| `name` | `string` | File name without extension, or `'unknown'` | Custom file name (without extension). |
| `mimeType` | `string` | | Fallback MIME type when undetected. For `HTMLImageElement`, the target encoding format (default: `'image/png'`). |

##### 📤 Output

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `getDataURL()` | `string` | Returns `data:<MIME type>;base64,<data>`. |
| `getBase64()` | `string` | Returns raw Base64 string. |
| `getArrayBuffer()` | `ArrayBuffer` | Returns underlying `ArrayBuffer`. |
| `getBlob()` | `Blob` | Returns `Blob` object with current MIME type. |
| `getFile()` | `File` | Returns `File` object with current file name and MIME type. |
| `getSize()` | `number` | Returns image size in bytes. |
| `getMimeType()` | `string` | Returns current MIME type. |

##### 🏷️ File name

When loaded from a `File`, the original extension is preserved.
When changing formats (e.g., via `convert()`), the extension is automatically updated to match the new format.

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `getName()` / `setName(name)` | `string` / `void` | Gets or sets the file name (without extension). |
| `getExtension()` / `setExtension(extension)` | `string` / `void` | Gets or sets the file extension. |
| `getFileName()` | `string` | Returns full `<name>.<extension>`. |

##### 🛠️ Editing

Editing methods return `Promise<void>` and re-encode the internal image when updated.
Formats not supported for browser export (e.g., GIF or BMP) fall back to PNG (`'image/png'`).

**`resize(maxSize)`**

Shrinks width and height while maintaining aspect ratio until the file size is `maxSize` bytes or less.
If the image is already under `maxSize`, no changes are made.

**`transform(options)`**

Flips and/or rotates the image, encoding to `options.mimeType` or the current format.

| Option (`TransformImageOptions`) | Type | Default | Description |
| -------------------------------- | ---- | ------- | ----------- |
| `angle` | `number` | `0` | Clockwise rotation in degrees (multiples of 90, e.g., `90`, `180`, `-90`). |
| `scaleX` | `number` | `1` | Set to `-1` to flip horizontally. |
| `scaleY` | `number` | `1` | Set to `-1` to flip vertically. |
| `mimeType` | `string` | The current MIME type | Target format for re-encoding. |

**`convert(mimeType)`**

Converts the image to the specified MIME type.
If the target format matches the current format, no re-encoding occurs.

#### 📜 License

This project is licensed under the MIT License. See the [LICENSE](https://opensource.org/licenses/MIT) file for details.
