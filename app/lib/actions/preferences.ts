'use server';

import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/app/lib/auth';
import clientPromise from '@/app/lib/mongodb';
import type { ThemePreference } from '@/app/lib/definitions';

// Mesmo campo `theme` do doc `user` que o web já usa — compartilhado no
// mesmo Mongo, então trocar o tema aqui reflete lá (e vice-versa).
export async function updateThemePreference(theme: ThemePreference) {
  if (theme !== 'light' && theme !== 'dark') return;

  const user = await getCurrentUser();
  if (!user || !ObjectId.isValid(user._id)) return;

  const client = await clientPromise;
  const db = client.db();
  await db.collection('user').updateOne(
    { _id: new ObjectId(user._id) },
    { $set: { theme } }
  );

  revalidatePath('/', 'layout');
}
