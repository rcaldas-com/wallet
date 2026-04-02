import { NextResponse } from 'next/server';
import { resendVerificationEmail } from '@/app/lib/data';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { success: false, message: 'Email não fornecido' },
        { status: 400 }
      );
    }

    const result = await resendVerificationEmail(email);

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    console.error('Erro ao reenviar email de verificação:', error);
    return NextResponse.json(
      { success: false, message: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
