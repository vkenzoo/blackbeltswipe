# Black Belt Swipe

> Biblioteca curada de ofertas escaladas de Facebook Ads. Clone PT-BR do [americanswipe.app](https://americanswipe.app) com enriquecimento automático via URL.

![Status](https://img.shields.io/badge/status-fase_01_frontend_mock-a1a1a6?style=flat-square)
![Stack](https://img.shields.io/badge/stack-Next_16_·_React_19_·_Tailwind_4-0a0a0a?style=flat-square)
![Design](https://img.shields.io/badge/design-Apple_Pro_Graphite-f5f5f7?style=flat-square)

## Visão

Founders de infoproduto, media buyers e afiliados BR/LATAM ganham acesso a uma biblioteca curada de ofertas que estão escalando agora no Facebook Ads. Admin cola URL da Ad Library ou da landing, worker Playwright extrai screenshot + VSL + métricas. Feature planejada (Fase 03): transcrição automática via Whisper.

## Fase atual

**Fase 01 — Frontend mock.** UI navegável com 20 ofertas reais (extraídas do Drive archive). Sem backend, sem auth real.

Próximas fases:
- **02** — Auth + Supabase + RLS + CRUD admin real
- **03** — Worker Playwright + Whisper transcription
- **04** — Deploy Vercel + Coolify
- **05** — Beta fechado

Detalhes: [`plano-frontend.md`](plano-frontend.md)

## Stack

- Next.js 16 app router + TypeScript + Turbopack
- React 19
- Tailwind CSS 4 (CSS-first `@theme inline`)
- Recharts (analytics chart)
- lucide-react (icons stroke 1.5)
- `next/font` Inter Tight + Inter, SF Mono via `-apple-system`
- Bun (package manager + runtime)

Sem Framer Motion na v1. Todos os springs são CSS com `cubic-bezier(0.34, 1.56, 0.64, 1)`.

## Design System

Design locked em [`DESIGN.md`](DESIGN.md). Preview visual interativo em [`docs/design-preview.html`](docs/design-preview.html).

**Direção:** Apple Pro Graphite.
- True black `#000000` + warm white `#F5F5F7`
- Liquid Glass em todo chrome (`backdrop-filter: blur(32px) saturate(180%)`)
- Zero accent colorido. Accent é warm white. Status pills são os únicos coloridos
- CSS spring motion, sem Framer Motion
- Border radius generoso (8 / 12 / 16 / 20 / pill)

## Setup

```bash
# requisitos
bun --version   # >= 1.3
node --version  # >= 20

# deps
bun install

# dev
bun dev         # abre http://localhost:3000

# build
bun run build
bun start       # serve produção
```

## Rotas

| Rota | O que é |
|------|---------|
| `/` | Redireciona pra `/app` |
| `/login` | Auth glass card (mock — submit navega pra `/app`) |
| `/app` | Dashboard com grid de ofertas + filter bar + pagination |
| `/app/[slug]` | Detalhe: VSL + metrics + criativos + transcrição + páginas |
| `/admin/offers` | Tabela admin |
| `/admin/offers/new` | Form criar oferta (submit `console.log` + redirect) |

## Estrutura

```
app/                   Next.js app router
  (auth)/login/        Login visual-only
  (app)/               Layout com sidebar fixa
    app/               Dashboard + detalhe
    admin/             CRUD admin mock
components/
  layout/              Sidebar, Logo, WorkspaceSwitcher, PromoBanner
  offers/              OfferCard, OfferGrid, OfferPill, OfferFilters, Pagination
  detail/              OfferHeader, VslPlayer, MetricsPanel, MetricsChart,
                       CreativesSection, TranscriptSection, PagesTabs
lib/
  types.ts             Offer, Page, Creative, Metric, labels
  utils.ts             cn(), formatDate(), formatNumber(), thumbGradient()
  mock/
    offers.ts          20 ofertas reais
    metrics.ts         séries temporais fake (determinísticas)
    pages.ts           pages mock
docs/
  design-preview.html  preview interativo do sistema visual
  references/          VSL zips (gitignored, 8.3GB local-only)
    INVENTORY.md       catálogo das 33 ofertas extraídas
scripts/
  transcribe-vsls.ts   Whisper CLI pronto pra rodar
```

## Smoke test

```bash
bun run build
bun start
```

Depois hit as 6 rotas. Todas devem retornar 200 (ou 307 no `/`):

```
curl -sI http://localhost:3000/        # 307
curl -sI http://localhost:3000/login   # 200
curl -sI http://localhost:3000/app     # 200
curl -sI http://localhost:3000/app/quiz-bottrel
curl -sI http://localhost:3000/admin/offers
curl -sI http://localhost:3000/admin/offers/new
```

## Responsive breakpoints

Grid de ofertas:
- `< 520px` — 1 coluna
- `≥ 520px` — 2 colunas
- `≥ 820px` — 3 colunas
- `≥ 1280px` — 4 colunas
- `≥ 1600px` — 5 colunas

## Acessibilidade

- `prefers-reduced-motion` reduz transições pra 60ms
- `prefers-reduced-transparency` transforma glass em opaco
- Focus ring visível em todos os interativos
- Aria labels em botões ícone-only
- `color-scheme: dark` no `<html>`

## O que NÃO está nesta fase

Tudo que for comportamento real fora de UI:

- ❌ Supabase / Postgres / auth real
- ❌ Filtros / busca / paginação funcionais (só visual)
- ❌ Worker Playwright / transcrição Whisper
- ❌ Upload de arquivos
- ❌ Deploy / CI
- ❌ Light mode (nunca)

## Convenções de commit

`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `style:` (Conventional Commits).
