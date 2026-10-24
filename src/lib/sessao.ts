"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Perfil } from "./tipos";

const CHAVE_PERFIL = "cabos:perfil";

// Perfil fica em cache para o app abrir offline com o usuário já logado
export function useSessao() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      const { data } = await supabase.auth.getSession();
      const usuario = data.session?.user;
      if (!usuario) {
        if (ativo) {
          setPerfil(null);
          setCarregando(false);
        }
        return;
      }
      try {
        const salvo = localStorage.getItem(CHAVE_PERFIL);
        if (salvo) {
          const p = JSON.parse(salvo) as Perfil;
          if (p.id === usuario.id && ativo) setPerfil(p);
        }
      } catch {}
      const { data: p, error } = await supabase.from("perfis").select("*").eq("id", usuario.id).maybeSingle();
      if (!ativo) return;
      if (!error) {
        setPerfil(p && p.ativo ? (p as Perfil) : null);
        try {
          if (p) localStorage.setItem(CHAVE_PERFIL, JSON.stringify(p));
          else localStorage.removeItem(CHAVE_PERFIL);
        } catch {}
      }
      setCarregando(false);
    }

    carregar();
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN" || evento === "SIGNED_OUT") carregar();
    });
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { perfil, carregando };
}

export async function sair() {
  try {
    localStorage.removeItem(CHAVE_PERFIL);
  } catch {}
  await supabase.auth.signOut();
  window.location.href = "/login";
}
