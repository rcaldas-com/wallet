import Link from 'next/link';
import { logoutAction } from '@/app/lib/actions/users';
import type { UserSession } from '@/app/lib/definitions';
import ThemeToggle from './theme-toggle';

export type NavKey = 'dashboard' | 'overview' | 'deposit' | 'withdraw' | 'issuers';

// Mesmo conjunto de links em toda página com header — antes cada page.tsx
// montava seu próprio <header> com um subconjunto diferente de links
// (deposit não linkava pra overview/withdraw, issuers não linkava pra
// deposit/withdraw, etc.), então a navegação disponível dependia de qual
// página o usuário estava. Agora é sempre a mesma lista, só o item ativo
// muda de estilo.
const ADMIN_NAV: { key: NavKey; href: string; label: string }[] = [
  { key: 'overview', href: '/dashboard/admin/overview', label: 'Visão geral' },
  { key: 'deposit', href: '/dashboard/admin/deposit', label: 'Depósito' },
  { key: 'withdraw', href: '/dashboard/admin/withdraw', label: 'Saques' },
  { key: 'issuers', href: '/dashboard/admin/issuers', label: 'Issuers' },
];

export default function Header({
  user,
  isAdmin,
  active,
}: {
  user: UserSession;
  isAdmin: boolean;
  active: NavKey;
}) {
  return (
    <header className="bg-emerald-600 text-white shadow">
      <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard" className="text-xl font-bold hover:opacity-90 transition shrink-0">
          💰 Wallet
        </Link>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {isAdmin && (
            <nav className="flex flex-wrap items-center gap-2">
              {ADMIN_NAV.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`text-sm px-3 py-1 rounded transition ${
                    active === item.key
                      ? 'bg-white/30 font-medium'
                      : 'bg-white/15 hover:bg-white/25'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          <ThemeToggle loggedIn />
          {/* O wallet não tem tela de perfil própria nem outro link de volta
              ao site principal — o nome vira o caminho de retorno. */}
          <a
            href={`${process.env.AUTH_TRUST_HOST || ''}/dashboard`}
            className="text-sm hover:underline"
            title="Voltar para o RCaldas"
          >
            {user.name}
          </a>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm bg-emerald-700 hover:bg-emerald-800 px-3 py-1 rounded transition"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
