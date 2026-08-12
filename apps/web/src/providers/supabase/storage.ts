import { randomUUID } from 'node:crypto';
import type { PresignedUpload, StorageProvider } from '@/providers/types';

interface SignedUploadResponse {
  url?: string;
}

export class SupabaseStorageProvider implements StorageProvider {
  readonly name = 'supabase-storage';

  constructor(
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly bucket: string,
  ) {}

  async createPresignedUpload(params: {
    userId: string;
    contentType: string;
    extension: string;
  }): Promise<PresignedUpload> {
    const storageKey = `meeting-records/${params.userId}/${randomUUID()}.${params.extension}`;
    const endpoint = `${this.supabaseUrl}/storage/v1/object/upload/sign/${this.bucket}/${storageKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        apikey: this.serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const data = (await response.json().catch(() => ({}))) as SignedUploadResponse & { message?: string };
    if (!response.ok || !data.url) {
      throw new Error(`사진 업로드 주소 생성 실패 (${response.status}): ${data.message ?? 'unknown'}`);
    }

    const uploadUrl = data.url.startsWith('http') ? data.url : `${this.supabaseUrl}/storage/v1${data.url}`;
    const encodedKey = storageKey.split('/').map(encodeURIComponent).join('/');
    return {
      uploadUrl,
      fileUrl: `${this.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(this.bucket)}/${encodedKey}`,
      storageKey,
      expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    };
  }

  async remove(storageKey: string): Promise<void> {
    const response = await fetch(`${this.supabaseUrl}/storage/v1/object/${this.bucket}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        apikey: this.serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: [storageKey] }),
    });
    if (!response.ok && response.status !== 404) throw new Error('사진 파일을 삭제하지 못했습니다.');
  }
}
