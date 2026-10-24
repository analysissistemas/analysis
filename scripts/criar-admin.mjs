// Cria (ou reativa) um usuário pelo terminal — útil para o primeiro admin.
// uso: node --env-file=.env.local scripts/criar-admin.mjs <email> <nome> [admin|campo] [senha]
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const [email, nome, papel = "admin", senhaArg] = process.argv.slice(2);
if (!email || !nome) {
  console.error("uso: node --env-file=.env.local scripts/criar-admin.mjs <email> <nome> [admin|campo] [senha]");
  process.exit(1);
}
const senha = senhaArg ?? randomBytes(6).toString("base64url");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: lista } = await sb.auth.admin.listUsers({ perPage: 1000 });
let usuario = lista.users.find((u) => u.email === email);
if (usuario) {
  await sb.auth.admin.updateUserById(usuario.id, { password: senha });
} else {
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  usuario = data.user;
}
const { error } = await sb.from("perfis").upsert({ id: usuario.id, nome, papel, ativo: true });
if (error) throw error;
console.log(`${papel}: ${email}  senha: ${senha}`);
