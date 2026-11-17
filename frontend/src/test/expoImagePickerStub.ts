export type ImagePickerAsset = {
  uri: string;
  width?: number;
  height?: number;
  type?: string;
  duration?: number | null;
  mimeType?: string;
  fileName?: string | null;
};

export type MediaType = 'image' | 'video' | 'pairedVideo' | 'livePhoto';
