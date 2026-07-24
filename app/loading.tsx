import Spinner from './components/spinner';

// Cobre toda navegação entre páginas do app (Suspense boundary implícito na
// raiz) — sem isso, trocar de página ficava em branco enquanto o servidor
// consultava a rede Stellar/ccxt, dando impressão de site travado.
export default function Loading() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-emerald-600 dark:text-emerald-400">
        <Spinner className="h-10 w-10" />
        <p className="text-sm text-gray-500 dark:text-zinc-400">Carregando…</p>
      </div>
    </main>
  );
}
