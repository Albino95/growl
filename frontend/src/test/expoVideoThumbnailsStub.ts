export async function getThumbnailAsync(
  _uri: string,
  options?: { time?: number; quality?: number }
): Promise<{ uri: string; width: number; height: number }> {
  const t = Math.round(options?.time ?? 0);
  return { uri: `file://thumb-${t}.jpg`, width: 80, height: 80 };
}
