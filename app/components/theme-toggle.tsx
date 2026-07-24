'use client';

import { useEffect, useState, useTransition } from 'react';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { updateThemePreference } from '@/app/lib/actions/preferences';

type ThemePreference = 'light' | 'dark';

function getSystemTheme(): ThemePreference {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Botão de alternar tema — mesma lógica do ThemeButton em web/components/header.tsx,
// só sem o resto do menu (o wallet não tem um header compartilhado, cada
// página com cabeçalho usa esse componente isoladamente).
export default function ThemeToggle({ loggedIn }: { loggedIn: boolean }) {
  const [currentTheme, setCurrentTheme] = useState<ThemePreference>('light');
  const [, startTransition] = useTransition();

  useEffect(() => {
    const rootTheme = document.documentElement.dataset.userTheme;
    const storedTheme = localStorage.getItem('theme') as ThemePreference | null;
    const savedTheme = loggedIn
      ? rootTheme === 'dark' || rootTheme === 'light'
        ? rootTheme
        : undefined
      : storedTheme;
    const nextTheme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : getSystemTheme();
    setCurrentTheme(nextTheme);
  }, [loggedIn]);

  const toggleTheme = () => {
    const nextTheme: ThemePreference = currentTheme === 'dark' ? 'light' : 'dark';
    setCurrentTheme(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    localStorage.setItem('theme', nextTheme);
    if (loggedIn) {
      startTransition(() => {
        updateThemePreference(nextTheme);
      });
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/30 text-white hover:bg-white/15 transition"
      aria-label={currentTheme === 'dark' ? 'Usar modo claro' : 'Usar modo escuro'}
      title={currentTheme === 'dark' ? 'Modo claro' : 'Modo escuro'}
    >
      {currentTheme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
}
