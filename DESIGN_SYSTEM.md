# RadiFlex — Design System

> **Identidade Visual do Sistema de Prospecção por CNAE**
> Telerradiologia · Saúde Digital · Brasil

---

## 1. Logo

O logo é uma peça única: texto `⌘ radflex.` em fundo roxo sólido.

| Atributo       | Valor                                    |
|----------------|------------------------------------------|
| Texto          | `⌘ radflex.`                             |
| Fonte          | Sora, weight 800                         |
| Cor do texto   | `#FFFFFF`                                |
| Fundo          | `#5B2ECC`                                |
| Border-radius  | `0.75rem` (12px)                         |
| Letter-spacing | `-0.5px`                                 |

**Uso no código:**
```tsx
<div className="inline-flex items-center px-3 py-2 rounded-xl" style={{ background: "#5B2ECC" }}>
  <span className="text-white tracking-tight" style={{ fontWeight: 800, fontSize: "16px", letterSpacing: "-0.5px" }}>
    ⌘ radflex.
  </span>
</div>
```

> **Não fazer:** alterar a cor de fundo, usar fundo transparente, remover o símbolo `⌘`, ou mudar a fonte.

---

## 2. Paleta de Cores

### Tokens de Cor (CSS Variables)

Todos os tokens estão em `src/index.css` no formato HSL sem a função `hsl()` — isso é um requisito do Tailwind para suporte a opacidades dinâmicas (`bg-primary/15`).

| Token CSS              | Hex       | HSL              | Papel semântico                    |
|------------------------|-----------|------------------|------------------------------------|
| `--primary`            | `#5B2ECC` | `257 63% 49%`    | Roxo Principal — CTA, destaques    |
| `--primary-foreground` | `#FFFFFF` | `0 0% 100%`      | Texto sobre fundo primário         |
| `--secondary`          | `#EDE9FE` | `251 91% 96%`    | Lavanda — botão secundário         |
| `--secondary-foreground`| `#4724A8`| `257 63% 40%`    | Texto sobre lavanda                |
| `--accent`             | `#EDE9FE` | `251 91% 96%`    | Lavanda — hover/accent             |
| `--accent-foreground`  | `#4724A8` | `257 63% 40%`    | Texto sobre accent                 |
| `--navy`               | `#1A1A2E` | `240 28% 14%`    | Escuro profundo — sidebar          |
| `--background`         | `#FDFAFF` | `251 50% 99%`    | Fundo da página                    |
| `--foreground`         | `#1A1A2E` | `240 28% 14%`    | Texto principal                    |
| `--muted-foreground`   | —         | `240 16% 47%`    | Texto secundário / label           |
| `--border`             | —         | `251 40% 88%`    | Bordas gerais                      |
| `--ring`               | `#5B2ECC` | `257 63% 49%`    | Foco de input/botão                |
| `--destructive`        | —         | `0 84% 60%`      | Erros, deleções                    |
| `--success`            | —         | `160 84% 39%`    | Confirmações, status OK            |

### Cores de Referência (Hex Direto)

| Nome          | Hex       | Uso típico                              |
|---------------|-----------|-----------------------------------------|
| Roxo Principal| `#5B2ECC` | Logo, botões primários, ícones ativos   |
| Roxo Médio    | `#7B52E8` | Gradientes, hovers                      |
| Roxo Claro    | `#A78BFA` | Ícones de princípio, detalhes suaves    |
| Roxo Escuro   | `#3D1F99` | Gradiente escuro, contrastes fortes     |
| Lavanda       | `#EDE9FE` | Fundos de cards secundários, chips      |
| Escuro        | `#1A1A2E` | Sidebar, fundo dark                     |
| Branco        | `#FFFFFF` | Texto sobre roxo, fundos de card        |

### Tokens de Sidebar

| Token CSS                         | Papel                              |
|-----------------------------------|------------------------------------|
| `--sidebar-background: 240 28% 14%` | Fundo escuro `#1A1A2E`           |
| `--sidebar-foreground: 251 60% 93%` | Texto claro (lavanda frio)       |
| `--sidebar-primary: 257 63% 49%`    | Item ativo (roxo principal)      |
| `--sidebar-accent: 240 28% 20%`     | Hover de item                    |
| `--sidebar-border: 240 28% 22%`     | Divisores internos               |
| `--sidebar-muted: 251 20% 55%`      | Labels, ícones apagados          |

---

## 3. Tipografia

### Famílias de Fonte

| Família        | Papel              | Import                     |
|----------------|--------------------|----------------------------|
| **Sora**       | Fonte principal    | `@fontsource/sora`         |
| Inter          | Dados / secundário | `@fontsource/inter`        |
| JetBrains Mono | Códigos / números  | `@fontsource/jetbrains-mono` |

Configurado em `tailwind.config.ts`:
```ts
fontFamily: {
  sans: ["Sora", "Inter", "system-ui", "sans-serif"],
  mono: ["JetBrains Mono", "monospace"],
}
```

### Escala Tipográfica

| Uso                  | Fonte  | Peso | Tamanho | Letter-spacing | Exemplo Tailwind                          |
|----------------------|--------|------|---------|----------------|-------------------------------------------|
| Título Principal     | Sora   | 800  | 28px    | —              | `text-3xl font-extrabold`                 |
| Subtítulo            | Sora   | 600  | 18px    | —              | `text-lg font-semibold`                   |
| Corpo                | Sora   | 400  | 14px    | —              | `text-sm font-normal`                     |
| CTA / Label          | Sora   | 700  | 12px    | `0.08em`       | `text-xs font-bold tracking-wide uppercase` |
| Logo                 | Sora   | 800  | 16–20px | `-0.5px`       | `font-extrabold tracking-tight`           |
| Código / Dados       | JetBrains Mono | 400 | 12px | — | `font-mono text-xs` ou `.font-mono-data` |

---

## 4. Gradientes

Definidos como utility classes em `src/index.css` (camada `@layer utilities`):

| Classe CSS             | Definição                                        | Uso                          |
|------------------------|--------------------------------------------------|------------------------------|
| `.gradient-primary`    | `135deg, #5B2ECC → #7B52E8`                     | Cards de destaque, headers   |
| `.gradient-dark`       | `135deg, #3D1F99 → #5B2ECC`                     | Cards escuros, modo dark     |
| `.gradient-soft`       | `135deg, #7B52E8 → #A78BFA`                     | Cards suaves, ilustrações    |
| `.gradient-light`      | `135deg, #EDE9FE → #FFFFFF`                     | Fundos de seção clara        |

**Uso no JSX:**
```tsx
<div className="gradient-primary rounded-xl p-6">
  <h2 className="text-white font-extrabold">Telerradiologia para o Brasil</h2>
</div>
```

---

## 5. Bordas e Raio

| Token       | Valor      | Equivalente Tailwind |
|-------------|------------|----------------------|
| `--radius`  | `0.5rem`   | `rounded-lg`         |
| —           | `0.375rem` | `rounded-md`         |
| —           | `0.25rem`  | `rounded-sm`         |
| Logo        | `0.75rem`  | `rounded-xl`         |
| Cards brand | `0.875rem` | `rounded-[14px]`     |

---

## 6. Componentes de Interface

### Botão Primário
```tsx
<Button className="bg-primary text-primary-foreground hover:bg-primary/90">
  Saiba mais
</Button>
```
Visual: fundo `#5B2ECC`, texto branco, hover 90% de opacidade.

### Botão Secundário (Lavanda)
```tsx
<Button variant="secondary">
  Entenda como
</Button>
```
Visual: fundo `#EDE9FE`, texto `#5B2ECC`.

### Chip / Badge — Variantes
```tsx
{/* Primário */}
<span className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold">
  Saiba mais
</span>

{/* Secundário */}
<span className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold border border-purple-200">
  Entenda como
</span>

{/* Neutro */}
<span className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-semibold border border-border">
  Telerradiologia
</span>
```

### Card com Gradiente
```tsx
<div className="gradient-primary rounded-2xl p-4 relative overflow-hidden min-h-[160px] flex flex-col justify-end">
  <span className="absolute top-3 left-3 text-xs font-bold text-white/90">⌘ radflex.</span>
  <h3 className="text-white font-bold text-base leading-snug">Telerradiologia para todo o Brasil</h3>
  <p className="text-white/75 text-xs mt-1">Laudos à distância</p>
</div>
```

---

## 7. Princípios Visuais

1. **Roxo como identidade única** — O roxo profundo (`#5B2ECC`) é o coração da marca: confiança, tecnologia e saúde. Use-o consistentemente como cor primária de ação.

2. **Tipografia bold e direta** — Headlines em peso 800, sem rodeios. A mensagem no contexto médico é urgente e clara. Evite pesos abaixo de 600 para títulos.

3. **Ilustrações limpas e geométricas** — Ícones e ilustrações flat, sem texturas ou sombras pesadas. Estilo médico-tech moderno. Prefira ícones do Lucide (já instalado).

4. **Alternância claro/escuro** — A sidebar usa `#1A1A2E` (escuro profundo) contrastando com o fundo claro lavanda `#FDFAFF`. Cards alternam entre gradiente roxo escuro, vibrante e lavanda para variedade visual sem sair da paleta.

---

## 8. Estrutura de Arquivos

```
src/
├── index.css            ← CSS variables (tokens de cor) + gradient utilities
├── main.tsx             ← @fontsource imports (Sora, Inter, JetBrains Mono)
├── components/
│   └── AppSidebar.tsx   ← Logo ⌘ radflex. + sidebar styling
tailwind.config.ts       ← font-family + color tokens via CSS vars
```

---

## 9. Checklist de Consistência

Ao criar um novo componente, verifique:

- [ ] Usa `font-sans` (Sora) implicitamente via `body` — não precisa declarar
- [ ] Usa `text-primary` para destaques, não hex direto
- [ ] Bordas via `border-border`, não `border-gray-200`
- [ ] Hover states via `/90` de opacidade: `hover:bg-primary/90`
- [ ] Dados numéricos / códigos usam `font-mono` ou `.font-mono-data`
- [ ] Gradientes usam as classes `.gradient-*` do `index.css`
- [ ] Logo nunca é alterado (cor, fonte ou símbolo ⌘)
