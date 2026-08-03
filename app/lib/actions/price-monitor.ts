'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/app/lib/auth';
import { resetBreaker } from '@/app/lib/price-monitor';

export type PriceMonitorState = {
  success: boolean;
  message: string;
};

export async function resetPriceBreakerAction(
  _prevState: PriceMonitorState,
  formData: FormData,
): Promise<PriceMonitorState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { success: false, message: 'Acesso restrito ao administrador.' };
  }

  const coin = String(formData.get('coin') || '');
  if (!coin) return { success: false, message: 'Moeda inválida.' };

  const ok = await resetBreaker(coin, admin._id);
  if (!ok) {
    return { success: false, message: `${coin} não está com o disjuntor travado.` };
  }

  revalidatePath('/dashboard/admin/overview');
  revalidatePath('/dashboard');
  return { success: true, message: `Disjuntor de ${coin} liberado.` };
}
