'use client';

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  createIssuer,
  updateIssuerDisplay,
  provisionIssuerAccount,
  type IssuerActionState,
} from '@/app/lib/actions/issuers';
import Spinner from '@/app/components/spinner';

export type IssuerRow = {
  name: string;
  publicKey: string;
  displayName: string | null;
  mirror: string | null;
  hasSecret: boolean;
  onchain: { exists: boolean; nativeXlm: number | null };
};

type Toast = { id: number; message: string; success: boolean };
type PushToast = (message: string, success: boolean) => void;

const initialState: IssuerActionState = { success: false, message: '' };

const inputClass =
  'w-full border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1';

export default function IssuersManager({ rows }: { rows: IssuerRow[] }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Memoizado: sem isso, cada re-render recria pushToast, muda a identidade da
  // dep `onResult` dos useEffect filhos e re-dispara o mesmo toast em loop.
  const pushToast = useCallback<PushToast>((message, success) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, success }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  return (
    <div className="space-y-6">
      <NewIssuerForm onResult={pushToast} />

      <section>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-zinc-100 mb-3">Cadastrados</h3>
        {rows.length === 0 ? (
          <p className="text-gray-500 dark:text-zinc-400 text-sm">Nenhum issuer cadastrado.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <IssuerCard key={row.name} row={row} onResult={pushToast} />
            ))}
          </div>
        )}
      </section>

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`p-3 rounded-lg text-sm shadow-lg border break-words ${
                t.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-200'
                  : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-900 dark:text-red-200'
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewIssuerForm({ onResult }: { onResult: PushToast }) {
  const [state, formAction, isPending] = useActionState(createIssuer, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) onResult(state.message, state.success);
    // Limpa o formulário no sucesso — sem isso a secret que acabou de ser
    // cadastrada ficava exposta no campo, arriscando recadastro por engano.
    if (state.success) formRef.current?.reset();
  }, [state, onResult]);

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800 p-5">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-zinc-100 mb-1">Novo issuer</h3>
      <p className="text-gray-500 dark:text-zinc-400 text-sm mb-4">
        Gere a chave (com o sufixo do código, ex.: terminando em XLM) e cole a secret aqui —
        a chave pública é derivada dela. A conta é criada e financiada a partir da carteira
        principal.
      </p>
      <form ref={formRef} action={formAction} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="name" className={labelClass}>Código</label>
            <input id="name" name="name" required placeholder="Ex.: XLM" className={inputClass} />
          </div>
          <div>
            <label htmlFor="displayName" className={labelClass}>
              Nome amigável <span className="text-gray-400 dark:text-zinc-500">(opcional)</span>
            </label>
            <input id="displayName" name="displayName" placeholder="Ex.: Lumens" className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor="secret" className={labelClass}>Chave secreta</label>
          <input id="secret" name="secret" required placeholder="S..." className={`${inputClass} font-mono`} />
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
            Fica só no servidor, nunca é exibida depois. A pública é derivada dela e mostrada
            na confirmação pra você conferir o sufixo.
          </p>
        </div>
        <div>
          <label htmlFor="mirror" className={labelClass}>
            Mirror <span className="text-gray-400 dark:text-zinc-500">(opcional)</span>
          </label>
          <input id="mirror" name="mirror" className={inputClass} />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium px-5 py-2 rounded-md transition"
        >
          {isPending && <Spinner />}
          {isPending ? 'Cadastrando…' : 'Cadastrar issuer'}
        </button>
      </form>
    </section>
  );
}

function IssuerCard({ row, onResult }: { row: IssuerRow; onResult: PushToast }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(updateIssuerDisplay, initialState);
  const [provisioning, startProvision] = useTransition();

  useEffect(() => {
    if (state.message) {
      onResult(state.message, state.success);
      if (state.success) setEditing(false);
    }
  }, [state, onResult]);

  const handleProvision = () => {
    startProvision(async () => {
      const res = await provisionIssuerAccount(row.name);
      onResult(res.message, res.success);
    });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 dark:text-zinc-100">
            {row.name}
            {row.displayName && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-zinc-400">({row.displayName})</span>
            )}
          </p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 font-mono break-all mt-0.5">{row.publicKey}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
            <span
              className={`px-1.5 py-0.5 rounded ${
                row.hasSecret
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
              }`}
            >
              {row.hasSecret ? 'com secret' : 'sem secret'}
            </span>
            {row.onchain.exists ? (
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                on-chain ok{row.onchain.nativeXlm !== null ? ` · ${row.onchain.nativeXlm.toFixed(2)} XLM` : ''}
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                conta não existe
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!row.onchain.exists && (
            <button
              type="button"
              onClick={handleProvision}
              disabled={provisioning}
              className="inline-flex items-center gap-1.5 text-sm border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 disabled:opacity-60 px-3 py-1.5 rounded-md transition"
            >
              {provisioning && <Spinner className="h-3.5 w-3.5" />}
              {provisioning ? 'Provisionando…' : 'Provisionar'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200 px-2"
          >
            {editing ? 'Cancelar' : 'Editar'}
          </button>
        </div>
      </div>

      {editing && (
        <form action={formAction} className="mt-4 border-t border-gray-100 dark:border-zinc-800 pt-4 grid sm:grid-cols-2 gap-3">
          <input type="hidden" name="name" value={row.name} />
          <div>
            <label className={labelClass}>Nome amigável</label>
            <input name="displayName" defaultValue={row.displayName ?? ''} placeholder="Ex.: Lumens" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Mirror</label>
            <input name="mirror" defaultValue={row.mirror ?? ''} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-1.5 rounded-md transition"
            >
              {isPending && <Spinner className="h-3.5 w-3.5" />}
              {isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
