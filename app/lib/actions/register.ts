'use server';

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import clientPromise from '@/app/lib/mongodb';
import { sendVerificationEmail } from '@/app/lib/email';

const RegisterSchema = z.object({
  name: z.string().min(1, { message: 'Nome é obrigatório' }),
  email: z.string().email({ message: 'Email inválido' }),
  password: z.string().min(6, { message: 'Senha deve ter pelo menos 6 caracteres' }),
  confirmPassword: z.string().min(1, { message: 'Confirmação de senha é obrigatória' }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas não coincidem',
  path: ['confirmPassword'],
});

export type RegisterState = {
  errors?: {
    name?: string[];
    email?: string[];
    password?: string[];
    confirmPassword?: string[];
  };
  message?: string | null;
};

export async function registerUser(
  prevState: RegisterState,
  formData: FormData,
) {
  const validatedFields = RegisterSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Erro na validação dos campos.',
    };
  }

  const { name, email, password } = validatedFields.data;

  try {
    const client = await clientPromise;
    const db = client.db();

    const existingUser = await db.collection('user').findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return {
        errors: { email: ['Este email já está cadastrado.'] },
        message: 'Este email já está cadastrado.',
      };
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.collection('user').insertOne({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: passwordHash,
      globalRole: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      emailVerified: false,
      verificationToken,
      verificationTokenExpires,
    });

    try {
      await sendVerificationEmail(
        email.toLowerCase().trim(),
        verificationToken,
        name.trim(),
      );
    } catch (emailError) {
      console.log('Error sending verification email:', emailError);
    }
  } catch (error) {
    console.error('Error creating user:', error);
    return {
      message: 'Erro ao criar conta. Tente novamente.',
    };
  }

  redirect('/login?message=Conta criada! Verifique seu email para ativar sua conta.');
}
