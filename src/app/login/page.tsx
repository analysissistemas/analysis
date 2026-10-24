"use client";

import { useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error || !data.user) {
      setErro(error?.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : "Não foi possível entrar. Verifique a conexão.");
      setEnviando(false);
      return;
    }
    const { data: perfil } = await supabase.from("perfis").select("papel, ativo").eq("id", data.user.id).maybeSingle();
    if (!perfil || !perfil.ativo) {
      await supabase.auth.signOut();
      setErro("Usuário sem acesso. Fale com o administrador.");
      setEnviando(false);
      return;
    }
    window.location.href = perfil.papel === "admin" ? "/admin" : "/";
  }

  return (
    <main className="flex min-h-dvh flex-col bg-grafite">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pt-12 pb-8 text-white">
        <Image src="/logo-marca.png" alt="" width={96} height={96} priority />
        <h1 className="mt-6 text-3xl font-bold">Controle de cabos</h1>
        <p className="mt-1 text-white/70">Consulta e registro em campo</p>
      </div>
      <form onSubmit={entrar} className="rounded-t-3xl bg-cartao px-6 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-sm space-y-4">
          <label className="block">
            <span className="text-sm text-suave">E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-12 w-full rounded-lg border border-borda px-3 text-base outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
          </label>
          <label className="block">
            <span className="text-sm text-suave">Senha</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="mt-1 h-12 w-full rounded-lg border border-borda px-3 text-base outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
          </label>
          {erro && <p className="rounded-lg bg-erro-fundo px-3 py-2 text-sm text-erro">{erro}</p>}
          <button
            disabled={enviando}
            className="gradiente-marca h-12 w-full rounded-lg font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </div>
        <div className="gradiente-marca mx-auto mt-8 h-1 w-16 rounded-full" />
      </form>
    </main>
  );
}
