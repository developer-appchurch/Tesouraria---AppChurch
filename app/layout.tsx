import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ADM Tesouraria AppChurch - Gestão Financeira & Relatórios',
  description: 'Sistema de gerenciamento da tesouraria com validação de relatórios semanais, conferência de envelopes, dashboards de arrecadação e gestão de permissões de acesso.',
  openGraph: {
    title: 'ADM Tesouraria AppChurch - Gestão Financeira & Relatórios',
    description: 'Sistema de gerenciamento da tesouraria com validação de relatórios semanais, conferência de envelopes, dashboards de arrecadação e gestão de permissões de acesso.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ADM Tesouraria AppChurch - Gestão Financeira & Relatórios',
    description: 'Sistema de gerenciamento da tesouraria com validação de relatórios semanais, conferência de envelopes, dashboards de arrecadação e gestão de permissões de acesso.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#1c2030] text-slate-100 antialiased selection:bg-indigo-600 selection:text-white" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
