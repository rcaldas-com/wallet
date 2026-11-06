import { startTransition, type FormEvent } from 'react';
import { unstable_rethrow } from 'next/navigation';

// Limite de comprovante, igual ao `bodySizeLimit` de next.config.js. Checado
// também no navegador: acima do limite o Next recusa o corpo antes da action
// rodar, e o erro chegava como falha genérica de servidor.
export const MAX_RECEIPT_BYTES = 64 * 1024 * 1024;

// Falha de transporte ao chamar a action (não erro de validação, que volta
// como state): vira mensagem no formulário em vez de derrubar a página pra
// tela de erro, que apagaria o que foi preenchido. Mesma ideia do
// saveFailureMessage do car, com uma diferença que pesa aqui: depósito e
// saque executam on-chain antes de responder, então sem resposta não dá pra
// saber se rodou — a mensagem manda conferir antes de reenviar, nunca
// "tente de novo" direto.
export function actionFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/was not found on the server/i.test(message)) {
    // A action nem foi encontrada no servidor, logo não executou nada.
    return 'O app foi atualizado enquanto esta página estava aberta. Recarregue a página e envie de novo — nada foi executado.';
  }
  return 'Sem resposta do servidor (conexão caiu ou ele estava reiniciando). A operação pode ter sido executada: confira o histórico antes de enviar de novo.';
}

type ActionState = { success: boolean; message: string };

export function catchActionFailure<S extends ActionState>(
  action: (prev: S, formData: FormData) => Promise<S>,
) {
  return async (prev: S, formData: FormData): Promise<S> => {
    try {
      return await action(prev, formData);
    } catch (error) {
      unstable_rethrow(error);
      return { ...prev, success: false, message: actionFailureMessage(error) };
    }
  };
}

// Envia sem o reset automático do React 19 em <form action={...}>, que limpa
// os campos não controlados (descrição, arquivo) mesmo quando a action volta
// com erro. Cada formulário limpa os próprios campos no sucesso.
export function submitKeepingFields(
  event: FormEvent<HTMLFormElement>,
  dispatch: (formData: FormData) => void,
) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  startTransition(() => dispatch(formData));
}

// Comprovante acima do limite: mensagem pronta, ou null se está ok.
export function receiptTooLarge(formData: FormData, field: string): string | null {
  const file = formData.get(field);
  if (file instanceof File && file.size > MAX_RECEIPT_BYTES) {
    return `Arquivo maior que ${MAX_RECEIPT_BYTES / 1024 / 1024}MB — escolha outro ou envie sem comprovante.`;
  }
  return null;
}
