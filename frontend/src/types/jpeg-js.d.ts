declare module 'jpeg-js' {
  export function decode(
    data: Uint8Array,
    options?: { useTArray?: boolean }
  ): { width: number; height: number; data: Uint8Array };

  export function encode(
    img: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
    quality: number
  ): { data: Uint8Array };
}
