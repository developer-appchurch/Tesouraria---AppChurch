import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#1c2030] text-slate-100 text-center">
      <div className="max-w-md w-full bg-[#202538] p-8 rounded-2xl shadow-xl border border-[#2e3752]">
        <h2 className="text-3xl font-black text-white mb-2 font-mono">404</h2>
        <p className="text-slate-400 mb-6 font-medium text-sm">Página não encontrada</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors shadow-xs text-xs"
        >
          Voltar ao Início
        </Link>
      </div>
    </div>
  );
}
