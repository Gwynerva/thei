/**
 * The name a file is saved under when its address does not give one: an
 * address of a page ends in the file's name, the library's does not, and a
 * download from there would be saved as "content". Empty when the address
 * names it already, so the browser keeps that name.
 */
export function downloadName(src: string, extension: string, base = 'file') {
  const path = src.split(/[?#]/)[0] ?? '';
  return /\.[a-z0-9]+$/i.test(path) || !extension ? '' : `${base}.${extension}`;
}
