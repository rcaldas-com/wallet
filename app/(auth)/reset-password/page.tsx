import ResetForm from './reset-password-form';
import { verifyPasswordReset } from '@/app/lib/actions/auth';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const { token } = (await searchParams) || {};
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-red-600">Token inválido.</p>
      </div>
    );
  }

  const email = await verifyPasswordReset(token);

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-red-600">Token inválido ou expirado.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <ResetForm email={email} />
    </div>
  );
}
