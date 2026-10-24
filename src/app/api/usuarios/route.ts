// Gestão de usuários — só admin. Usa a service_role no servidor (nunca vai para o navegador).
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function exigirAdmin(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = admin();
  const { data } = await sb.auth.getUser(token);
  if (!data.user) return null;
  const { data: perfil } = await sb.from("perfis").select("papel, ativo").eq("id", data.user.id).maybeSingle();
  return perfil?.papel === "admin" && perfil.ativo ? { sb, id: data.user.id } : null;
}

const negado = () => Response.json({ erro: "Sem permissão" }, { status: 403 });

export async function GET(req: Request) {
  const ctx = await exigirAdmin(req);
  if (!ctx) return negado();
  const [{ data: perfis }, { data: usuarios }] = await Promise.all([
    ctx.sb.from("perfis").select("*").order("nome"),
    ctx.sb.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emails = new Map(usuarios?.users.map((u) => [u.id, u.email]) ?? []);
  return Response.json((perfis ?? []).map((p) => ({ ...p, email: emails.get(p.id) ?? "" })));
}

export async function POST(req: Request) {
  const ctx = await exigirAdmin(req);
  if (!ctx) return negado();
  const { nome, email, senha, papel } = await req.json();
  if (!nome || !email || !senha || senha.length < 6 || !["admin", "campo"].includes(papel)) {
    return Response.json({ erro: "Preencha nome, e-mail, senha (mín. 6) e papel." }, { status: 400 });
  }
  const { data, error } = await ctx.sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error || !data.user) {
    const msg = error?.message.includes("already") ? "Já existe um usuário com esse e-mail." : error?.message;
    return Response.json({ erro: msg ?? "Erro ao criar usuário" }, { status: 400 });
  }
  const { error: e2 } = await ctx.sb.from("perfis").insert({ id: data.user.id, nome, papel });
  if (e2) {
    await ctx.sb.auth.admin.deleteUser(data.user.id);
    return Response.json({ erro: e2.message }, { status: 400 });
  }
  return Response.json({ ok: true });
}

export async function PATCH(req: Request) {
  const ctx = await exigirAdmin(req);
  if (!ctx) return negado();
  const { id, nome, papel, ativo, senha } = await req.json();
  if (!id) return Response.json({ erro: "id obrigatório" }, { status: 400 });
  if (id === ctx.id && (ativo === false || papel === "campo")) {
    return Response.json({ erro: "Você não pode remover o seu próprio acesso de admin." }, { status: 400 });
  }
  const mudancas: Record<string, unknown> = {};
  if (nome !== undefined) mudancas.nome = nome;
  if (papel !== undefined) mudancas.papel = papel;
  if (ativo !== undefined) mudancas.ativo = ativo;
  if (Object.keys(mudancas).length) {
    const { error } = await ctx.sb.from("perfis").update(mudancas).eq("id", id);
    if (error) return Response.json({ erro: error.message }, { status: 400 });
  }
  if (senha) {
    if (senha.length < 6) return Response.json({ erro: "Senha precisa de pelo menos 6 caracteres." }, { status: 400 });
    const { error } = await ctx.sb.auth.admin.updateUserById(id, { password: senha });
    if (error) return Response.json({ erro: error.message }, { status: 400 });
  }
  return Response.json({ ok: true });
}
