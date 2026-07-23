import { cookies } from 'next/headers';
import { getUserById } from '@/app/lib/data';
import { verifySessionToken } from '@/app/lib/session';
import EndImpersonateButton from './end-impersonate-button';

// A impersonation é iniciada no app principal (web); aqui só lemos o mesmo
// cookie (domínio .rcaldas.com em produção) para mostrar o aviso.
export default async function ImpersonateBanner() {
  const cookieStore = await cookies();
  const targetUserId = await verifySessionToken(
    cookieStore.get('impersonate_target_user')?.value,
    'impersonate-target',
  );
  const originalUserId = await verifySessionToken(
    cookieStore.get('impersonate_original_user')?.value,
    'impersonate-original',
  );

  if (!targetUserId || !originalUserId) {
    return null;
  }

  const [targetUser, originalUser] = await Promise.all([
    getUserById(targetUserId),
    getUserById(originalUserId),
  ]);

  if (!targetUser || !originalUser) {
    return null;
  }

  return (
    <div className="bg-amber-500 text-white px-4 py-2.5 sm:px-7">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <strong>{originalUser.name}</strong> visualizando como{' '}
          <strong>{targetUser.name}</strong> ({targetUser.email})
        </p>
        <EndImpersonateButton />
      </div>
    </div>
  );
}
