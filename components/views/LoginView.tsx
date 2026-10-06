'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { MembroItem } from '@/lib/types';
import { TreasuryService } from '@/lib/treasury-service';

interface LoginViewProps {
  onLoginSuccess: (membro: MembroItem) => void;
  usuarios?: import('@/lib/types').PermissaoUsuario[];
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [erroLogin, setErroLogin] = useState<string | null>(null);
  const [sucessoLogin, setSucessoLogin] = useState<string | null>(null);
  const [erroConexao, setErroConexao] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroLogin(null);
    setSucessoLogin(null);
    setErroConexao(null);

    const loginLimpo = login.trim();
    const senhaLimpa = senha.trim();

    if (!loginLimpo || !senhaLimpa) {
      setErroLogin('Por favor, preencha o login e a senha.');
      return;
    }

    setIsAuthenticating(true);

    try {
      // Autenticação oficial via POST https://app.appchurch.com.br/api/tesouraria/login
      const result = await TreasuryService.loginAppChurch(loginLimpo, senhaLimpa);

      if (result.success && result.user) {
        const membro: MembroItem = {
          id: result.user.id,
          ID: result.user.id,
          churchId: result.user.churchId,
          nome: result.user.name || result.user.login,
          name: result.user.name || result.user.login,
          login: result.user.login,
          role: result.user.role || 'Tesoureiro',
          cargo: result.user.role || 'Tesoureiro',
          email: result.user.email,
          celula: 'Central',
          status: 'Ativo',
        };

        setSucessoLogin(`Bem-vindo(a), ${membro.nome}!`);
        setTimeout(() => {
          onLoginSuccess(membro);
        }, 300);
        return;
      }

      setErroLogin(result.error || 'Erro ao processar autenticação. Verifique suas credenciais.');
    } catch (err: any) {
      console.error('[LoginView] Erro ao autenticar:', err);
      setErroConexao(err?.message || 'Falha na conexão com o servidor de autenticação.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div
      id="login-page-container"
      className="min-h-screen w-full bg-[#1c2030] flex items-center justify-center p-4 relative"
    >
      <div
        id="login-card"
        className="bg-white rounded-2xl p-6 sm:p-7 w-full max-w-[400px] shadow-2xl animate-in zoom-in-95 duration-200 text-center relative"
      >
        {/* Brand Header */}
        <div className="w-full flex items-center justify-center mb-6 select-none">
          <Image
            src="/brand/AppChurch-Tesouraria.webp"
            alt="AppChurch"
            width={800}
            height={400}
            className="h-[70px] w-auto object-contain mx-auto select-none"
            priority
            draggable={false}
          />
        </div>

        {/* Alerta de Erro de Conexão */}
        {erroConexao && (
          <div
            id="msg-erro-sincronizacao"
            className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-700 flex items-start gap-2.5 text-left animate-in fade-in duration-150"
          >
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-xs text-red-700">
                Falha na Conexão
              </p>
              <p className="text-[11px] text-red-600 font-medium mt-0.5">{erroConexao}</p>
            </div>
          </div>
        )}

        {/* Mensagem de Erro de Login */}
        {erroLogin && (
          <div
            id="msg-erro-login"
            className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-700 flex items-start gap-2.5 text-left animate-in fade-in duration-150"
          >
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-xs text-red-700">{erroLogin}</p>
            </div>
          </div>
        )}

        {/* Mensagem de Sucesso */}
        {sucessoLogin && (
          <div
            id="msg-sucesso-login"
            className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-400 text-emerald-800 flex items-center gap-2.5 text-left animate-in fade-in duration-150"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-bold text-xs">{sucessoLogin}</p>
              <p className="text-[11px] text-emerald-700">Acessando o sistema...</p>
            </div>
          </div>
        )}

        {/* Formulário de Login */}
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">
              Login ou E-mail
            </label>
            <input
              type="text"
              id="input-login"
              value={login}
              onChange={(e) => {
                setLogin(e.target.value);
                if (erroLogin) setErroLogin(null);
                if (erroConexao) setErroConexao(null);
              }}
              placeholder="Digite seu login ou e-mail"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-600 focus:bg-white transition-colors"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">
              Senha
            </label>
            <input
              type="password"
              id="input-senha"
              value={senha}
              onChange={(e) => {
                setSenha(e.target.value);
                if (erroLogin) setErroLogin(null);
                if (erroConexao) setErroConexao(null);
              }}
              placeholder="Digite sua senha"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-600 focus:bg-white transition-colors"
              required
            />
          </div>

          <button
            type="submit"
            id="btn-login-submit"
            disabled={isAuthenticating}
            className="w-full mt-3.5 bg-[#242a42] hover:bg-[#2e3655] text-white font-bold py-3 px-4 rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isAuthenticating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Autenticando...</span>
              </>
            ) : (
              <span>Entrar</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
