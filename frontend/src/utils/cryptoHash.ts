import * as Crypto from 'expo-crypto';

/** SHA-256 hex digest — expo-crypto with Web Crypto fallback for web edge cases. */
export async function sha256Hex(value: string): Promise<string> {
  try {
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
  } catch (error) {
    if (typeof globalThis.crypto?.subtle?.digest === 'function') {
      const data = new TextEncoder().encode(value);
      const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    throw error;
  }
}
