'use client';

import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  };

  return (
    <button type="button" onClick={logout} className="btn-secondary w-full">
      로그아웃
    </button>
  );
}
