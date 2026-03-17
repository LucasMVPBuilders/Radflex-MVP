# Auth — Design Spec
**Data:** 2026-03-16
**Status:** Aprovado

---

## Objetivo

Proteger o acesso ao app RadiFlex com autenticação e-mail + senha via Supabase Auth. Não há registro público — usuários são criados manualmente pelo admin no Supabase Dashboard.

---

## Fluxo do Usuário

```
Acessa qualquer rota
       ↓
ProtectedRoute verifica sessão Supabase
       ↓
  Sem sessão  ──→  /login
  Com sessão  ──→  Renderiza rota normalmente
```

**Reset de senha:**
```
/login → "Esqueci minha senha"
       ↓
/reset-password  (digita e-mail)
       ↓
Supabase envia e-mail com link mágico
       ↓
Usuário clica → /update-password?token=...
       ↓
Digita nova senha → login automático → /
```

---

## Telas

### `/login`
- Campo e-mail + campo senha
- Botão "Entrar"
- Link "Esqueci minha senha" → `/reset-password`
- Erro inline em caso de credenciais inválidas
- Layout: centralizado, fundo gradiente roxo, card branco com logo `⌘ radflex.`

### `/reset-password`
- Campo e-mail
- Botão "Enviar link" — desabilitado após primeiro envio bem-sucedido (evitar resubmit por rate limit do Supabase)
- Mensagem de sucesso após envio
- Link "Voltar ao login"

### `/update-password`
- Supabase redireciona aqui após o usuário clicar no link do e-mail (token chega como fragment `#access_token=...&type=recovery`, não query param)
- No mount: registra listener `onAuthStateChange` sincronamente; se evento `PASSWORD_RECOVERY` já disparou antes do mount, usa `supabase.auth.getSession()` como fallback para detectar sessão de recovery existente
- Token expirado/inválido (ou sessão ausente após ambas as verificações): exibe mensagem de erro e link para solicitar novo link em `/reset-password`
- Campo nova senha + confirmação
- Estado de loading no botão durante submissão
- Erro inline para falhas (senha muito curta, policy violation)
- Após salvar com sucesso → redireciona para `/`

---

## Componentes e Arquivos

### Novos
| Arquivo | Responsabilidade |
|---|---|
| `src/pages/Login.tsx` | Tela de login |
| `src/pages/ResetPassword.tsx` | Tela de solicitar reset |
| `src/pages/UpdatePassword.tsx` | Tela de definir nova senha |
| `src/components/ProtectedRoute.tsx` | Wrapper que verifica sessão e redireciona |

### Modificados
| Arquivo | Mudança |
|---|---|
| `src/App.tsx` | Adicionar rotas `/login`, `/reset-password`, `/update-password`; envolver rotas existentes com `<ProtectedRoute>` |
| `src/components/TopBar.tsx` | Adicionar botão de logout |

---

## ProtectedRoute — Comportamento

- No mount: usa `onAuthStateChange` como fonte autoritativa (valida com o servidor); `getSession()` apenas como hint inicial para reduzir flash
- Enquanto verifica: exibe spinner (evita flash de conteúdo)
- Sem sessão: `<Navigate to="/login" replace />`
- Com sessão válida (confirmada pelo servidor): renderiza `<Outlet />`
- `onAuthStateChange` deve ser desinscrito no unmount (`subscription.unsubscribe()`) para evitar memory leak
- Sessão persistida em `localStorage` (`persistSession: true` já configurado no client)

## Login — Comportamento Adicional

- Se o usuário já tem sessão ativa e acessa `/login`, redireciona para `/`

## Logout

- Botão de logout no canto superior direito da `TopBar`
- Chama `supabase.auth.signOut()`
- Redireciona para `/login` após logout

---

## Supabase Auth — Configuração

- Provider: **Email** (já habilitado por padrão)
- Signup: **desabilitado** no Dashboard (`Authentication > Settings > Disable signups`)
- Redirect URL para reset: configurar `https://<domínio>/update-password` no Dashboard
- Usuários criados manualmente em `Authentication > Users`

---

## Visual

- Sem sidebar nas telas de auth
- Fundo: gradiente `from-[#1A1A2E] to-[#2D1B6B]`
- Card: branco, `rounded-xl`, `shadow-lg`, largura máx `420px`
- Logo: `⌘ radflex.` — fundo `#5B2ECC`, texto branco, `font-weight 800`, fonte Sora
- Componentes: shadcn/ui `Input`, `Button`, `Label` (já existentes no projeto)

---

## Fora de Escopo

- Login social (Google, GitHub)
- Registro público
- Roles/permissões por usuário
- Dados separados por usuário (RLS por `auth.uid()`)
- Deep-link recovery (após update-password, sempre redireciona para `/`)
