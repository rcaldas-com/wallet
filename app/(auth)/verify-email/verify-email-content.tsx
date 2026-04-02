'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';

export default function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyToken = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setMessage('Token de verificação não encontrado');
        return;
      }

      try {
        const response = await fetch('/wallet/api/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (data.success) {
          setStatus('success');
          setMessage(data.message || 'Email verificado com sucesso!');

          setTimeout(() => {
            router.push('/login?message=Email verificado! Você já pode fazer login.');
          }, 3000);
        } else {
          setStatus('error');
          setMessage(data.message || 'Erro ao verificar email');
        }
      } catch (error) {
        console.error('Erro ao verificar email:', error);
        setStatus('error');
        setMessage('Erro ao verificar email. Tente novamente.');
      }
    };

    verifyToken();
  }, [searchParams, router]);

  return (
    <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
      <div className="text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Verificando email...
            </h2>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Email verificado!
            </h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <p className="text-sm text-gray-500">Redirecionando para login...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Erro na verificação
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <div className="space-y-3">
              <button
                onClick={() => router.push('/login')}
                className="w-full bg-emerald-600 text-white py-2 px-4 rounded-md hover:bg-emerald-700 transition-colors"
              >
                Ir para Login
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
