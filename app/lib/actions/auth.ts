'use server';

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import clientPromise from '@/app/lib/mongodb';

type State = {
  message: string;
  errors: Record<string, string[] | undefined>;
  success?: boolean;
};

const ForgotPasswordSchema = z.object({
  email: z.string().email({ message: 'Digite um email válido.' }),
});

export async function requestPasswordReset(prevState: State, formData: FormData) {
  const parsed = ForgotPasswordSchema.safeParse({
    email: formData.get('email'),
  });

  if (!parsed.success) {
    return {
      ...prevState,
      errors: parsed.error.flatten().fieldErrors,
      message: 'Dados inválidos.',
    };
  }

  try {
    const client = await clientPromise;
    const db = client.db();
    const user = await db.collection('user').findOne({ email: parsed.data.email });

    if (!user) {
      return {
        ...prevState,
        errors: { email: [] },
        message: 'Se o e-mail existir, um link de redefinição foi enviado.',
      };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000);

    await db.collection('wallet_token').insertOne({
      email: parsed.data.email,
      token,
      feature: 'reset-password',
      expiresAt,
      createdAt: new Date(),
      used: false,
    });

    const APP_URL = process.env.AUTH_TRUST_HOST || 'http://localhost:8001';
    const BASE_PATH = process.env.NODE_ENV === 'production' ? '' : '/wallet';
    const resetUrl = `${APP_URL}${BASE_PATH}/reset-password?token=${token}`;

    console.log('🔗 LINK DE REDEFINIÇÃO DE SENHA (DEV):');
    console.log(`📧 Para: ${parsed.data.email}`);
    console.log(`🔑 Link: ${resetUrl}`);
    console.log('---');

    return {
      ...prevState,
      message: 'Se o e-mail existir, um link de redefinição foi enviado.',
      errors: {},
    };
  } catch (error) {
    console.log('Erro ao solicitar reset de senha:', error);
    return {
      ...prevState,
      message: 'Erro ao solicitar redefinição de senha.',
      errors: {},
    };
  }
}

export async function verifyPasswordReset(token: string): Promise<string | null> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const tokenDoc = await db.collection('wallet_token').findOne({
      token,
      feature: 'reset-password',
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!tokenDoc) {
      return null;
    }

    return tokenDoc.email as string;
  } catch (error) {
    console.error('Erro ao validar token de reset:', error);
    return null;
  }
}

const ResetPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
  confirm: z.string().min(6, 'Confirme a senha.'),
});

export async function resetPassword(prevState: State & { success?: boolean }, formData: FormData) {
  const email = formData.get('email');
  const password = formData.get('password');
  const confirm = formData.get('confirm');

  const parsed = ResetPasswordSchema.safeParse({ email, password, confirm });
  if (!parsed.success) {
    return {
      ...prevState,
      errors: parsed.error.flatten().fieldErrors,
      message: 'Dados inválidos.',
      success: false,
    };
  }

  if (password !== confirm) {
    return {
      ...prevState,
      errors: { confirm: ['As senhas não coincidem.'] },
      message: 'As senhas não coincidem.',
      success: false,
    };
  }

  try {
    const client = await clientPromise;
    const db = client.db();

    const tokenDoc = await db.collection('wallet_token').findOne({
      email,
      feature: 'reset-password',
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!tokenDoc) {
      return {
        ...prevState,
        errors: {},
        message: 'Token inválido ou expirado.',
        success: false,
      };
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password as string, salt);

    await db.collection('user').updateOne(
      { email },
      { $set: { password: passwordHash } }
    );

    await db.collection('wallet_token').updateOne(
      { _id: tokenDoc._id },
      { $set: { used: new Date() } }
    );

    return {
      ...prevState,
      errors: {},
      message: '',
      success: true,
    };
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return {
      ...prevState,
      errors: {},
      message: 'Erro interno ao redefinir senha.',
      success: false,
    };
  }
}
