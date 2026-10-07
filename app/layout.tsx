import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#1c2030',
};

export const metadata: Metadata = {
  title: 'ADM Tesouraria AppChurch - Gestão Financeira & Relatórios',
  // Favicons em public/ (gerados a partir da logo AppChurch Tesouraria)
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
  appleWebApp: {
    title: 'Tesouraria',
    statusBarStyle: 'black-translucent',
  },
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
        <Analytics />
      </body>
    </html>
  );
}
