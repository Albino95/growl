/**
 * Read / write raw image bytes without going through fetch().
 *
 * On React Native `fetch(file://…).arrayBuffer()` goes Blob → native
 * FileReader.readAsDataURL → base64 string over the bridge → JS base64 decode:
 * slow, memory-hungry, and file:// fetch is not guaranteed. expo-file-system's
 * `File.bytes()` hands back a Uint8Array straight from native, and
 * `File.write(Uint8Array)` writes one back without a base64 detour.
 */
import { Platform } from 'react-native';

type NativeFile = {
  uri: string;
  bytes(): Promise<Uint8Array>;
  write(content: string | Uint8Array): void;
};

type NewFsModule = {
  File: new (...uris: (string | { uri: string })[]) => NativeFile;
  Paths: { cache: { uri: string } };
};

type LegacyFsModule = {
  cacheDirectory: string | null;
  documentDirectory: string | null;
  EncodingType: { Base64: string };
  readAsStringAsync(uri: string, options: { encoding: any }): Promise<string>;
  writeAsStringAsync(uri: string, contents: string, options: { encoding: any }): Promise<void>;
};

export type FileBytesEnv = {
  isWeb: boolean;
  fetchImpl: (uri: string) => Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
  loadFs: () => Promise<NewFsModule>;
  loadLegacyFs: () => Promise<LegacyFsModule>;
};

function defaultEnv(): FileBytesEnv {
  return {
    isWeb: Platform.OS === 'web',
    fetchImpl: (uri) => fetch(uri),
    loadFs: async () => (await import('expo-file-system')) as unknown as NewFsModule,
    loadLegacyFs: async () =>
      (await import('expo-file-system/legacy')) as unknown as LegacyFsModule,
  };
}

/** Bytes of a local image (file:// on native, http/blob on web, any data: URL). */
export async function readFileBytes(uri: string, env: FileBytesEnv = defaultEnv()): Promise<Uint8Array> {
  if (uri.startsWith('data:')) {
    const comma = uri.indexOf(',');
    return base64ToBytes(uri.slice(comma + 1));
  }

  if (env.isWeb) {
    const res = await env.fetchImpl(uri);
    return new Uint8Array(await res.arrayBuffer());
  }

  let firstError: unknown;
  try {
    const { File } = await env.loadFs();
    const bytes = await new File(uri).bytes();
    if (bytes && bytes.length > 0) return bytes;
    firstError = new Error('empty file');
  } catch (err) {
    firstError = err;
  }

  try {
    const legacy = await env.loadLegacyFs();
    const b64 = await legacy.readAsStringAsync(uri, { encoding: legacy.EncodingType.Base64 });
    const bytes = base64ToBytes(b64);
    if (bytes.length > 0) return bytes;
  } catch {
    /* report the primary error below */
  }
  const reason = firstError instanceof Error ? firstError.message : String(firstError);
  throw new Error(`Could not read photo (${reason})`);
}

/**
 * Persist encoded JPEG bytes. Native → file:// in the cache dir; web → data URL.
 */
export async function writeJpegBytes(
  bytes: Uint8Array,
  env: FileBytesEnv = defaultEnv()
): Promise<string> {
  if (env.isWeb) {
    return `data:image/jpeg;base64,${bytesToBase64(bytes)}`;
  }
  const name = `grow-edit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;

  let firstError: unknown;
  try {
    const { File, Paths } = await env.loadFs();
    const file = new File(Paths.cache, name);
    file.write(bytes);
    return file.uri;
  } catch (err) {
    firstError = err;
  }

  try {
    const legacy = await env.loadLegacyFs();
    const dir = legacy.cacheDirectory || legacy.documentDirectory;
    if (dir) {
      const path = `${dir}${name}`;
      await legacy.writeAsStringAsync(path, bytesToBase64(bytes), {
        encoding: legacy.EncodingType.Base64,
      });
      return path;
    }
  } catch {
    /* report the primary error below */
  }
  const reason = firstError instanceof Error ? firstError.message : String(firstError);
  throw new Error(`Could not write edited photo (${reason})`);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Uint8Array(256).fill(255);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  t['-'.charCodeAt(0)] = 62; // base64url
  t['_'.charCodeAt(0)] = 63;
  return t;
})();
let PAIRS: string[] | null = null;

/** Base64 → bytes in one pass into a preallocated buffer (no intermediate strings). */
export function base64ToBytes(b64: string): Uint8Array {
  const len = b64.length;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let buf = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < len; i++) {
    const v = B64_LOOKUP[b64.charCodeAt(i) & 255];
    if (v === 255) continue; // '=', whitespace, newlines
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 255;
    }
  }
  return o === out.length ? out : out.subarray(0, o);
}

/**
 * Bytes → base64. Builds 12-bit pair strings into chunked arrays and joins once
 * (the old version grew one string by 4 concatenations per 3 bytes).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  if (!PAIRS) {
    PAIRS = new Array(4096);
    for (let i = 0; i < 4096; i++) PAIRS[i] = B64[i >> 6] + B64[i & 63];
  }
  const pairs = PAIRS;
  const len = bytes.length;
  const full = len - (len % 3);
  const chunks: string[] = [];
  const CHUNK = 3 * 4096;
  for (let start = 0; start < full; start += CHUNK) {
    const stop = Math.min(full, start + CHUNK);
    const parts: string[] = new Array((stop - start) / 3);
    let p = 0;
    for (let i = start; i < stop; i += 3) {
      const t = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      parts[p++] = pairs[t >> 12] + pairs[t & 4095];
    }
    chunks.push(parts.join(''));
  }
  const rem = len - full;
  if (rem === 1) {
    const t = bytes[full] << 16;
    chunks.push(B64[(t >> 18) & 63] + B64[(t >> 12) & 63] + '==');
  } else if (rem === 2) {
    const t = (bytes[full] << 16) | (bytes[full + 1] << 8);
    chunks.push(B64[(t >> 18) & 63] + B64[(t >> 12) & 63] + B64[(t >> 6) & 63] + '=');
  }
  return chunks.join('');
}
