# Black Belt Swipe — Plano Fase 01 (Frontend Mock)

> Versão 1.0 · 2026-04-17 · Design lockado em [DESIGN.md](DESIGN.md)
> Duração: 12h corridas · Sem backend real

---

## Context

Primeira fase das 5 que totalizam 48h pra shipar MVP do **Black Belt Swipe** — clone PT-BR do americanswipe.app com curadoria humana + enrichment automático.

**Objetivo:** entregar app Next.js navegável com UI Apple Pro Graphite que passa no "teste de 5 segundos" lado a lado com AS. **Zero backend**, só mock data. Quando rodar `bun dev`, deve parecer um app em produção.

**Entrada:** 33 ofertas reais extraídas dos zips em `docs/references/` (ver [INVENTORY.md](docs/references/INVENTORY.md)).

**Saída:** repo Next.js em branch `fase-01-frontend`, PR aberto pra review com screenshots.

---

## Stack

```
Next.js 14 app router + TypeScript 5
Tailwind 3.4 + shadcn/ui (theme sobrescrito pra Graphite)
lucide-react (icons, stroke 1.5)
Recharts (gráfico do detail)
next/font (Inter Tight + Inter via Google Fonts)
bun (pkg manager)
```

**Deliberadamente fora:**
- Framer Motion (CSS spring resolve)
- date-fns (Intl.DateTimeFormat)
- react-hook-form (form admin é `useState` simples)
- Nenhum lib de state management (URL + React state local)

---

## Repo layout

```
blackbeltswipe/
├── app/
│   ├── layout.tsx                    # root <html dark> + fonts + theme
│   ├── globals.css                   # CSS vars (Graphite tokens) + tailwind
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                # sidebar fixa + main
│   │   ├── app/
│   │   │   ├── page.tsx              # dashboard grid
│   │   │   └── [slug]/page.tsx       # detalhe oferta
│   │   └── admin/
│   │       ├── offers/page.tsx       # tabela admin
│   │       └── offers/new/page.tsx   # form criar
│   └── favicon.ico
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── workspace-switcher.tsx
│   │   ├── promo-banner.tsx
│   │   └── logo.tsx                  # mark "B" + wordmark
│   ├── offers/
│   │   ├── offer-card.tsx
│   │   ├── offer-grid.tsx
│   │   ├── offer-pill.tsx
│   │   ├── offer-filters.tsx
│   │   └── pagination.tsx
│   ├── detail/
│   │   ├── offer-header.tsx
│   │   ├── vsl-player.tsx
│   │   ├── metrics-panel.tsx
│   │   ├── metrics-chart.tsx         # Recharts wrapper
│   │   ├── creatives-section.tsx
│   │   └── pages-tabs.tsx
│   └── ui/                           # shadcn components, Graphite theme
│       ├── button.tsx
│       ├── input.tsx
│       ├── tabs.tsx
│       ├── table.tsx
│       ├── select.tsx
│       └── toast.tsx
├── lib/
│   ├── mock/
│   │   ├── offers.ts                 # 20 ofertas reais (ver data abaixo)
│   │   ├── pages.ts                  # pages mock (ad library, site, fb)
│   │   ├── creatives.ts              # creatives mock
│   │   └── metrics.ts                # séries temporais fake
│   ├── types.ts                      # Offer, Page, Creative, Metric
│   └── utils.ts                      # cn(), formatDate(), formatNumber()
├── public/
│   ├── thumbs/                       # gradients CSS dinâmicos, sem imagens
│   └── favicon.svg
├── docs/
│   ├── design-preview.html           # preview visual (já existe)
│   └── references/                   # VSL zips (GITIGNORED)
├── DESIGN.md                         # design system
├── plano.md                          # product brief
├── plano-frontend.md                 # ESTE arquivo
├── .gitignore                        # inclui docs/references/*.zip
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── bun.lockb
└── README.md
```

---

## Rotas

### `/login` — visual only
- Layout centralizado, glass card com mark "B" + wordmark + email + senha + botão "Entrar"
- "Esqueci senha" (não funciona)
- Submit → `router.push('/app')` sem validação

### `/app` — dashboard grid
- Sidebar fixa (glass, 260px)
- Banner promocional top (glass, fechável)
- Filter bar: pills "Filtros / Escalando agora / Vídeo · Informações / Métricas" + busca (visual)
- Grid responsivo: 5/3/2/1 cols · gap 20px
- Paginação rodapé (visual)

### `/app/[slug]` — detalhe
- Header: título Inter Tight 28/700 + 6 pills horizontais + botão "Analise com IA" (warm-white-on-black)
- Col esquerda (60%): VSL player aspect 16:10 com glow radial
- Col direita (40%): metrics panel glass
  - Tabs `6M / 3M / 30D / 7D`
  - Big number mono `2,847` text-2xl
  - `anúncios ativos` + delta `+42%` success
  - Recharts line + area fill 10%
- Seção "Criativos": grid 4 cols com glass cards
- Seção "Página": tabs `Todas / Site Principal / Páginas FB / Bibliotecas FB` + 3 cards

### `/admin/offers` — tabela
- Header: "Ofertas" + botão "Nova oferta"
- Tabela glass com colunas: Title, Niche, Language, Status (pill colorido), Ad count (mono), Created at, Actions
- Row click → `/app/[slug]`

### `/admin/offers/new` — form
- Campos: title, slug (auto-gen), niche (select), language (select), structure (select), traffic_source (select), status (radio), vsl_url, URLs (textarea), flags (multi)
- Submit → `console.log(formData)` + toast "Oferta criada (mock)" + redirect `/admin/offers`

---

## Componentes-chave

### `<Logo />`
Mark 28×28 radius 7 com gradient white-to-transparent + texto "BLACK BELT SWIPE" tracking 0.12em uppercase. Prop `size: 'sm' | 'md'` + `wordmark: boolean`.

### `<OfferCard />`
Anatomia definida em [DESIGN.md §7](DESIGN.md) + preview HTML.
```tsx
type OfferCardProps = {
  offer: Offer
  onFavorite?: () => void
  onAnalyze?: () => void
}
```
Comportamento hover: `scale(1.015) translateY(-3px)` + glow branco + border strong, 280ms spring via CSS.

### `<Sidebar />`
Width 260px fixo. Estrutura:
- Logo top
- Workspace switcher (ROI VENTURES · Founder)
- Nav "Geral": Dashboard, Ofertas, Criativos, Páginas, Hub de afiliação, On Demand, Relatórios, Discord
- Nav "Pra você": Recomendados, Favoritos, Academy, Ads Power
- Nav "Suporte": idioma (🇧🇷 Português)

Active route highlight com `bg-elevated` + border-left 2px warm-white.

### `<MetricsChart />`
Recharts wrapper, área + linha. Dados fake baseados em trending up (40 pontos de 6 meses). Color: `var(--accent)` (warm white em Graphite). Gradient fill: 30% → 0%.

### `<VslPlayer />`
`<video>` nativo placeholder (src de sample MP4 pequeno ou thumbnail estático com botão play grande). Radius 20px. Glow radial branco atrás (10% opacity, 300px).

---

## Transcrição (feature nova — spec pra Fase 01 mock)

Cada oferta tem `transcript_preview: string` (primeiros 400 chars do Whisper output) + `transcript_duration: number` em segundos.

**UI no detail page:**
- Nova seção "Transcrição" entre "Criativos" e "Página"
- Glass card com primeiros 3 parágrafos do transcrito
- Botão "Ver transcrição completa" abre modal/drawer
- Pequeno player que sincroniza com VSL (quando disponível — placeholder na Fase 01)
- Copy button "Copiar trecho" em cada parágrafo (só visual na Fase 01)

**UI no OfferCard (sutil):**
- Se oferta tem transcrito, mostra ícone `<FileText>` junto dos outros ícones no topo
- Hover revela tooltip: "Transcrição disponível · 32min"

Implementação real (Whisper API) entra na Fase 02-03. Na Fase 01 é só UI + mock.

---

## Mock data — 20 ofertas reais

Das 33 do inventory, pego as 20 com mais assets + variedade de nicho/estrutura:

```ts
// lib/mock/offers.ts
export const MOCK_OFFERS: Offer[] = [
  { slug: 'quiz-bottrel', title: 'Quiz Bottrel', niche: 'renda_extra', language: 'pt-BR', structure: 'quiz', ad_count: 3410, status: 'active', launched_at: '2026-01-18', thumb_gradient: 1 },
  { slug: 'meu-sistema-lucrativo', title: 'Meu Sistema Lucrativo', niche: 'renda_extra', language: 'pt-BR', structure: 'vsl', ad_count: 1780, status: 'active', launched_at: '2026-01-18', thumb_gradient: 2 },
  { slug: 'elida-dias-msm', title: 'Elida Dias MSM — Dólar', niche: 'financas', language: 'pt-BR', structure: 'vsl', ad_count: 2100, status: 'active', launched_at: '2026-04-06', thumb_gradient: 3 },
  { slug: 'bruna-soares-renda-anonima', title: 'Método Renda Anônima TikTok', niche: 'renda_extra', language: 'pt-BR', structure: 'vsl', ad_count: 1340, status: 'active', launched_at: '2025-12-04', thumb_gradient: 4 },
  { slug: 'ana-neves-produtos-virais', title: 'Produtos Virais MVA', niche: 'ecommerce', language: 'pt-BR', structure: 'vsl', ad_count: 890, status: 'active', launched_at: '2026-02-10', thumb_gradient: 5 },
  { slug: 'joao-pedro-alves-monstro', title: 'Método Low Ticket Monstro', niche: 'renda_extra', language: 'pt-BR', structure: 'low_ticket', ad_count: 2890, status: 'active', launched_at: '2025-12-02', thumb_gradient: 6 },
  { slug: 'sistema-gps-gucastro', title: 'Sistema GPS', niche: 'renda_extra', language: 'pt-BR', structure: 'vsl', ad_count: 1450, status: 'active', launched_at: '2024-10-22', thumb_gradient: 7 },
  { slug: 'primeira-venda-com-ia', title: 'Primeira Venda com IA', niche: 'ia_tech', language: 'pt-BR', structure: 'vsl', ad_count: 640, status: 'active', launched_at: '2026-02-05', thumb_gradient: 8 },
  { slug: 'olivio-brito-sistema-lucro', title: 'Sistema de Lucro Automático', niche: 'renda_extra', language: 'pt-BR', structure: 'vsl', ad_count: 1780, status: 'active', launched_at: '2026-04-06', thumb_gradient: 9 },
  { slug: 'metodo-habilidade-de-ouro', title: 'Método Habilidade de Ouro', niche: 'renda_extra', language: 'pt-BR', structure: 'vsl', ad_count: 780, status: 'active', launched_at: '2026-03-15', thumb_gradient: 10 },
  { slug: 'iniciamazon-tome-marcos', title: 'IniciAmazon', niche: 'ecommerce', language: 'pt-BR', structure: 'vsl', ad_count: 960, status: 'active', launched_at: '2026-02-20', thumb_gradient: 11 },
  { slug: 'the-ai-creator-course', title: 'The AI Creator Course', niche: 'ia_tech', language: 'en-US', structure: 'vsl', ad_count: 2310, status: 'active', launched_at: '2026-01-26', thumb_gradient: 12 },
  { slug: 'maquina-de-vendas-matheus-borges', title: 'Máquina das Vendas Online', niche: 'marketing', language: 'pt-BR', structure: 'vsl', ad_count: 2543, status: 'active', launched_at: '2026-01-29', thumb_gradient: 13 },
  { slug: 'gabriel-navarro-0-ao-investidor', title: 'Do 0 ao Investidor', niche: 'financas', language: 'pt-BR', structure: 'vsl', ad_count: 1120, status: 'active', launched_at: '2026-02-01', thumb_gradient: 14 },
  { slug: 'julia-ottoni-arquetipos', title: 'Teste dos Arquétipos', niche: 'desenvolvimento', language: 'pt-BR', structure: 'quiz', ad_count: 680, status: 'active', launched_at: '2026-03-10', thumb_gradient: 15 },
  { slug: 'ruptura-viral', title: 'Ruptura Viral', niche: 'ia_tech', language: 'pt-BR', structure: 'vsl', ad_count: 1920, status: 'active', launched_at: '2026-01-29', thumb_gradient: 16 },
  { slug: 'robo-milionario', title: 'Robô Milionário', niche: 'renda_extra', language: 'pt-BR', structure: 'vsl', ad_count: 5100, status: 'active', launched_at: '2024-10-15', thumb_gradient: 17 },
  { slug: 'vanessa-lopes-tiktok-shop', title: 'Virada do TikTok Shop', niche: 'ecommerce', language: 'pt-BR', structure: 'vsl', ad_count: 3410, status: 'active', launched_at: '2026-01-26', thumb_gradient: 18 },
  { slug: 'nathalia-beauty', title: 'Nathália Beauty', niche: 'beleza', language: 'pt-BR', structure: 'vsl', ad_count: 420, status: 'active', launched_at: '2026-01-22', thumb_gradient: 19 },
  { slug: 'metodo-eurodrop', title: 'Método EuroDrop', niche: 'ecommerce', language: 'pt-BR', structure: 'vsl', ad_count: 550, status: 'active', launched_at: '2026-03-06', thumb_gradient: 20 },
]
```

Niches disponíveis: `renda_extra · financas · ecommerce · ia_tech · marketing · desenvolvimento · beleza · saude`

---

## Sequência de tarefas (H0 → H12)

| Bloco | Dur | Entregas |
|-------|-----|----------|
| 1. Scaffold | 45min | `bun create next-app@latest` + Tailwind + shadcn init + `next/font` Inter Tight + Inter + global CSS vars com tokens Graphite |
| 2. Types + mock | 45min | `lib/types.ts` + `lib/mock/offers.ts` (20 reais) + `lib/mock/metrics.ts` (séries temporais) |
| 3. Layout + Sidebar + Logo | 1h30 | `<Logo>` · `<Sidebar>` com nav completa · `<WorkspaceSwitcher>` · glass CSS · active route highlight |
| 4. OfferCard | 1h30 | Componente fiel ao preview HTML: card top (ad count mono + 3 ícones) · card meta (data + status pill) · título Inter Tight · pill nicho · thumb com gradient + play · bottom pills · flag idioma · hover spring |
| 5. Dashboard `/app` | 1h30 | Grid responsivo 5/3/2/1 · filter bar glass · banner promo · pagination visual |
| 6. Detail `/app/[slug]` | 2h30 | Header com 6 pills + btn warm-white "Analise IA" · VSL player com glow radial · Metrics panel (tabs + big number + chart Recharts) · Criativos grid · Pages tabs |
| 7. Admin routes | 1h30 | `/admin/offers` tabela glass · `/admin/offers/new` form com selects + submit mock |
| 8. Login | 30min | Glass card centralizado · Logo + inputs + button · background com glow radial branco |
| 9. Polimento + responsivo | 1h | Teste 375/768/1024/1440 · fix visual glitches · verify prefers-reduced-motion · toast system |
| 10. README + commit | 30min | README com `bun install && bun dev` · screenshots grid + detail · commit inicial `feat: initial scaffold + frontend mock Fase 01` |

**Total: ~12h.** Buffer de 2-3h se algum bloco travar.

---

## Critério de pronto

- [ ] `bun dev` sobe sem erro nem warning crítico
- [ ] Navegação: `/login` → `/app` → `/app/[slug]` → `/admin/offers` → `/admin/offers/new`
- [ ] Lado a lado com AS: teste dos 5 segundos passa
- [ ] Side-by-side com `docs/design-preview.html`: implementação fiel
- [ ] Mobile 375px testado (iPhone SE DevTools)
- [ ] Tablet 768px testado
- [ ] Desktop 1440px testado
- [ ] 20 ofertas reais renderizam no grid
- [ ] 3 detalhes diferentes (nichos distintos) renderizam limpos
- [ ] `prefers-reduced-motion` respeitado
- [ ] `bun run build` passa sem erro
- [ ] Repo commitado em `fase-01-frontend`
- [ ] README tem screenshots + setup instructions

---

## Fora de escopo (repete pra fixar)

- ❌ Supabase, Postgres, auth real
- ❌ Filtros / busca / paginação funcionais (só visual)
- ❌ Worker Playwright
- ❌ Upload de arquivos
- ❌ Stripe
- ❌ Deploy (só local)
- ❌ i18n (tudo PT-BR hardcoded)
- ❌ Testes automatizados (tem no Fase 02)
- ❌ Analytics / tracking
- ❌ Light mode (nunca na v1)
- ❌ Framer Motion
- ❌ VSL real (placeholder com gradient + play)

---

## Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Liquid Glass fica lento em mobile | Médio | Já planejei fallback opaco em `prefers-reduced-transparency` + Safari < 14 |
| shadcn theme override demora | Médio | Começar por Button + Input (mais usados), deixar Table pro final |
| 20 ofertas ficam repetitivas visualmente | Baixo | Thumb gradients variados (20 únicos) + bottom pills variadas |
| Detail page vira monstro (2h30 aloc) | Médio | Se passar de 3h, simplifica: remove a seção "Criativos" e "Pages tabs" pra Fase 02 |
| Recharts + Tailwind CSS vars conflitam | Baixo | Usar CSS inline no Chart component, vars resolvem em runtime |

---

## Verificação (end-to-end)

```bash
# 1. Clone + install
bun install

# 2. Dev server
bun dev
# → abre localhost:3000

# 3. Manual navigation tests
# /login → Entrar → /app (5/3/2/1 grid com 20 ofertas)
# Click em qualquer card → /app/quiz-bottrel (detail com VSL + chart + seções)
# /admin/offers → tabela com todas
# /admin/offers/new → form → submit → toast + redirect

# 4. Responsive
# DevTools → iPhone SE 375 → tudo 1 col, sidebar vira drawer (mobile menu)
# iPad 768 → 2-3 cols, sidebar condensada
# Desktop 1440 → 5 cols, sidebar full

# 5. Build
bun run build
# → zero erros, tamanho bundle < 250kb first load JS

# 6. Lighthouse (opcional)
# Performance > 90, Accessibility > 95
```

---

## Próximo passo após aprovação

1. Criar repo GitHub `blackbeltswipe` (privado)
2. Criar branch `fase-01-frontend`
3. Scaffold inicial (Bloco 1 da sequência)
4. Commit a cada bloco (10 commits ao todo)
5. PR no final pra você revisar com screenshots
6. Se aprovado, merge → Fase 02 começa
