import { Suspense } from 'react';
import VerifyEmailContent from './verify-email-content';

export default function VerifyEmailPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Suspense
        fallback={
          <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
            <p className="text-gray-600">Verificando email...</p>
          </div>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
