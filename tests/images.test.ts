// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { fileToPhotoDataUrl } from '../src/lib/images';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function photo(type: string, bytes: number[], size = 100): File { return { type, size, slice: () => ({ arrayBuffer: async () => new Uint8Array(bytes).buffer }) } as unknown as File; }
it('rejects unsupported formats, oversized files and mismatched image headers before decoding', async () => {
  await expect(fileToPhotoDataUrl(photo('image/svg+xml', []))).rejects.toThrow('JPEG, PNG or WebP');
  await expect(fileToPhotoDataUrl(photo('image/jpeg', [], 11 * 1024 * 1024))).rejects.toThrow('10 MB');
  await expect(fileToPhotoDataUrl(photo('image/png', [255, 216, 255]))).rejects.toThrow('does not match');
});
it('renders a bounded JPEG through canvas, drops metadata and releases the object URL', async () => {
  const create = vi.fn(() => 'blob:test'), revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
  vi.stubGlobal('Image', class { naturalWidth = 2000; naturalHeight = 1000; onload?: () => void; onerror?: () => void; set src(_value: string) { queueMicrotask(() => this.onload?.()); } });
  const drawImage = vi.fn(), fillRect = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, fillRect, fillStyle: '' } as unknown as CanvasRenderingContext2D);
  const output = 'data:image/jpeg;base64,/9j/';
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(output);
  expect(await fileToPhotoDataUrl(photo('image/jpeg', [255, 216, 255]))).toBe(output);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 512, 256);
  expect(encode).toHaveBeenCalledWith('image/jpeg', 0.82); expect(revoke).toHaveBeenCalledWith('blob:test');
});
it('revokes a photo URL after a decode failure', async () => {
  const revoke = vi.fn(); vi.stubGlobal('URL', { createObjectURL: () => 'blob:failed', revokeObjectURL: revoke });
  vi.stubGlobal('Image', class { onerror?: () => void; set src(_value: string) { queueMicrotask(() => this.onerror?.()); } });
  await expect(fileToPhotoDataUrl(photo('image/jpeg', [255, 216, 255]))).rejects.toThrow('could not be opened');
  expect(revoke).toHaveBeenCalledWith('blob:failed');
});
