import { randomUUID } from 'node:crypto';
import type {
  AuthProviderAdapter,
  NotificationPayload,
  NotificationProvider,
  OAuthProfile,
  PresignedUpload,
  StorageProvider,
} from '@/providers/types';

/** 알림은 DB Notification 레코드로만 남긴다. 실제 발송은 이후 카카오 알림톡으로 교체한다. */
export class LocalNotificationProvider implements NotificationProvider {
  readonly name = 'local-notification';
  private readonly sink: NotificationPayload[] = [];

  async send(payload: NotificationPayload): Promise<void> {
    this.sink.push(payload);
    if (process.env.NODE_ENV === 'development') {
      console.info(`[notification] ${payload.type} → ${payload.userId}: ${payload.title}`);
    }
  }

  /** 테스트에서 발송 내역을 확인할 때 쓴다. */
  drain(): NotificationPayload[] {
    return this.sink.splice(0, this.sink.length);
  }
}

/** Presigned URL 흐름만 흉내 낸다. 실제 업로드는 하지 않는다. */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local-storage';

  async createPresignedUpload(params: {
    userId: string;
    contentType: string;
    extension: string;
  }): Promise<PresignedUpload> {
    const storageKey = `local/${params.userId}/${randomUUID()}.${params.extension}`;
    return {
      uploadUrl: `/api/v1/uploads/mock?key=${encodeURIComponent(storageKey)}`,
      fileUrl: `/api/v1/uploads/mock/file?key=${encodeURIComponent(storageKey)}`,
      storageKey,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    };
  }

  async remove(): Promise<void> {
    // 실제 삭제할 대상이 없다.
  }
}

/** 카카오 키가 없을 때. enabled=false라 화면에서 버튼 자체를 숨긴다. */
export class DisabledKakaoAuthProvider implements AuthProviderAdapter {
  readonly name = 'kakao-disabled';
  readonly enabled = false;

  buildAuthorizeUrl(): string {
    throw new Error('카카오 로그인이 설정되지 않았습니다.');
  }

  async exchangeCode(): Promise<OAuthProfile> {
    throw new Error('카카오 로그인이 설정되지 않았습니다.');
  }
}
