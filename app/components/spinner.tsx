// Spinner único do app — usado em botões com ação pendente e no loading.tsx
// de página inteira. As operações dependem da rede Stellar pública (lenta às
// vezes), então um texto estático de "carregando" passa impressão de site
// travado; o giro deixa claro que ainda está processando.
export default function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
      />
    </svg>
  );
}
