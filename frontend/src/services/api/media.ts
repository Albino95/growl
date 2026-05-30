import { request } from './http';

type UploadPurpose = 'post' | 'product' | 'story';

type UploadMediaResponse = {
  success: boolean;
  data: {
    key: string;
    url: string;
    size: number;
    contentType: string;
  };
};

export async function uploadMediaApi(dataUrl: string, purpose: UploadPurpose): Promise<string> {
  const res = await request<UploadMediaResponse>('/media/upload', {
    method: 'POST',
    body: JSON.stringify({ dataUrl, purpose }),
  });
  return res.data.url;
}
