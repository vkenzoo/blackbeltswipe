# Design System — Black Belt Swipe

> Versão 1.0 · 2026-04-17 · Locked
> Single source of truth pra qualquer decisão visual. **Sempre leia antes de escrever UI.**
> Preview interativo: [`docs/design-preview.html`](docs/design-preview.html)

---

## 1. Product Context

- **O que é:** Biblioteca curada de ofertas escaladas de Facebook Ads. Clone PT-BR do americanswipe.app com curadoria humana + enrichment automático.
- **Para quem:** Founders de infoproduto, media buyers, afiliados BR/LATAM faturando R$ 50k-500k/mês.
- **Categoria:** SaaS B2B de marketing intelligence.
- **Tipo:** Web app (dashboard + detail + admin), dark only.

---

## 2. Aesthetic Direction

### **Apple Pro Graphite** — Vision Pro era + Apple Pro Display vibe

Preto verdadeiro como base, warm white como accent, materiais translúcidos (Liquid Glass), tipografia precisa, motion com física. Zero cor decorativa — toda a personalidade vem de tipografia, hierarquia, espaço e movimento.

**Mood em uma frase:** parece um app Pro da Apple (Logic, Final Cut, Vision Pro) — não um SaaS B2B genérico.

### Princípios

1. **True black sempre** (`#000000`) — nunca cinza-escuro
2. **Glass como material** — backdrop-blur em todo chrome
3. **Typography é o décor** — hierarquia clara, tracking apertado, peso variado
4. **Motion com física** — spring curves, nunca linear
5. **Restraint** — se você está em dúvida se algo "agrega", remove
6. **Status colors são funcionais, não branding** — verde/vermelho só significam estado, não decoração

---

## 3. Typography

```
Display (H1-H3, títulos card)   →  Inter Tight 600 / 700 · letter-spacing -0.03em
Body (UI, parágrafos)           →  Inter 400 / 500 · letter-spacing -0.01em
Numeric (métricas, datas)       →  ui-monospace, "SF Mono", Menlo · tabular-nums

Font feature settings           →  "ss01", "cv11", "tnum"
Smoothing                       →  -webkit-font-smoothing: antialiased
```

### Stack completo

```css
--font-display: 'Inter Tight', -apple-system, BlinkMacSystemFont, sans-serif;
--font-body:    'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono:    ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```

Mac/iOS users veem **SF Pro nativo** via `-apple-system` fallback. Resto vê Inter.

### Escala (base 17px, Apple rhythm)

| Token | Size | Use |
|-------|------|-----|
| `text-xs` | 11px | pills, captions, eyebrow |
| `text-sm` | 13px | labels, meta, table rows |
| `text-base` | 15px | body default |
| `text-md` | 17px | card titles |
| `text-lg` | 22px | section headings |
| `text-xl` | 28px | offer title detail |
| `text-2xl` | 40px | big metric number (mono) |
| `text-3xl` | 56px | hero display |

### Carregamento

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@500;600;700&display=swap" rel="stylesheet">
```

Em Next.js use `next/font/google` pra zero CLS.

---

## 4. Color

### Palette base (Graphite)

```css
/* Surfaces */
--bg:           #000000;                  /* true black */
--bg-glass:     rgba(28,28,30,0.72);      /* + backdrop-filter blur(32px) saturate(180%) */
--bg-surface:   #1C1C1E;                  /* opaco quando glass não rola */
--bg-elevated:  #2C2C2E;                  /* hover/active */

/* Borders */
--border-hairline: rgba(255,255,255,0.06);
--border-default:  rgba(255,255,255,0.10);
--border-strong:   rgba(255,255,255,0.18);  /* hover */

/* Text */
--text:    #F5F5F7;   /* warm white assinatura Apple */
--text-2:  #A1A1A6;
--text-3:  #6E6E73;
--text-4:  #48484A;

/* Accent (Graphite — accent é warm white) */
--accent:        #F5F5F7;
--accent-glow:   rgba(255,255,255,0.10);
--accent-soft:   rgba(255,255,255,0.05);

/* Semantic — funcionais, não branding */
--success:  #30D158;
--warning:  #FF9F0A;
--error:    #FF453A;
```

### Uso do accent

- Botão primário: `bg #F5F5F7` + `color #000` (warm-white-on-black, vibe Apple Pro)
- Hover de cards: glow branco sutil
- Linha do gráfico: warm white com area fill 10% opacity
- Focus ring: `box-shadow 0 0 0 4px rgba(255,255,255,0.06)`
- Logo mark: gradient white-to-transparent

### Status pills (mantém colorido)

```
Ativo       success #30D158  + dot pulsando
Pausada     error #FF453A
Escalando   warning #FF9F0A
Rascunho    text-3 #6E6E73
```

---

## 5. Materials — **Liquid Glass**

Aplicado em: sidebar, cards, header sticky, filter bar, modals, login card, pills.

```css
.glass {
  background: rgba(28, 28, 30, 0.72);
  backdrop-filter: blur(32px) saturate(180%);
  -webkit-backdrop-filter: blur(32px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.06);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 8px 32px rgba(0,0,0,0.4);
}
```

### Fallback
- Safari < 14 e Firefox < 103: superfície opaca `#1C1C1E`
- `@media (prefers-reduced-transparency)`: opaco
- Mobile low-end: opaco se FPS < 30

### Glass intensities

| Token | Blur | Use |
|-------|------|-----|
| `glass-light` | blur(16px) | pills, buttons |
| `glass-default` | blur(32px) saturate(180%) | sidebar, cards, header |
| `glass-strong` | blur(40px) saturate(200%) | login card, modals |

---

## 6. Spacing — **base 4px, Apple rhythm**

```
2xs   2px      hairline
xs    4px      icon gaps
sm    8px      pill padding tight
md    16px     card inner padding (Apple inner)
lg    24px     section inner
xl    40px     between major blocks
2xl   64px     hero breathing
3xl   96px     page top/bottom padding
```

### Density
- **Grid de ofertas:** compact (gap 20px entre cards, padding 16px interno)
- **Detail page:** comfortable/editorial (gap 32px, padding 24-40px)
- **Admin tables:** compact rows (padding 12px vertical)

---

## 7. Layout

### Approach
**Híbrido:** grid-disciplined no dashboard (5/3/2/1 col responsive), editorial no detail page (asymmetric, hierarchy dramática).

### Sidebar
- Width fixa `260px` (não 240 — Apple rhythm)
- Liquid Glass
- Workspace switcher topo + nav agrupada por seção (Geral / Pra você / Suporte)

### Grid
- Container max-width: `1280px` (lê confortável até 4K)
- Grid columns:
  - `xs` (480px+): 1 col
  - `md` (768px+): 2 cols
  - `lg` (1024px+): 3 cols
  - `xl` (1280px+): 5 cols
- Gap: `20px`

### Detail
- Coluna esquerda 60% (VSL + criativos + páginas)
- Coluna direita 40% (analytics)
- Mobile: stack vertical

### Border radius

```
radius-sm    8px      pills, buttons pequenos
radius-md    12px     inputs, pills grandes, thumbs
radius-lg    16px     cards (Apple signature)
radius-xl    20px     modals, sheets, hero containers
radius-2xl   28px     containers hero (landing futura)
radius-pill  980px    buttons primários Apple-style
```

---

## 8. Motion

**CSS-only com cubic-bezier spring** (sem Framer Motion na v1).

### Easing tokens

```css
--ease-spring:     cubic-bezier(0.34, 1.56, 0.64, 1);    /* gentle overshoot */
--ease-standard:   cubic-bezier(0.4, 0, 0.2, 1);         /* ease-out Apple */
--ease-decelerate: cubic-bezier(0, 0, 0.2, 1);
--ease-accelerate: cubic-bezier(0.4, 0, 1, 1);
```

### Duration tokens

```
micro    120ms    hover color, focus ring
short    240ms    card scale, tab switch, button bg
medium   400ms    page transition, modal open
long     600ms    hero reveal
```

### Interações principais

| Elemento | Comportamento |
|----------|---------------|
| Card hover | `scale(1.015) translateY(-3px)` + glow + border-strong, 280ms spring |
| Button press | `scale(0.97)` 120ms, volta com spring |
| Tab switch | underline desliza, 240ms spring |
| Modal open | `scale(0.96 → 1)` + fade, 400ms spring |
| Status dot "Ativo" | `pulse` 2s ease-in-out infinite (opacity 1 ↔ 0.4) |
| Input focus | border + ring branco, 240ms standard |

### `prefers-reduced-motion`
Respeitar SEMPRE. Em `prefers-reduced-motion: reduce`, transitions caem pra `60ms` lineares e remove transforms.

---

## 9. Iconography

- **Lib:** `lucide-react` exclusivamente (16/20/24px sizes)
- **Stroke width:** `1.5` (mais Apple, menos Material)
- **Color default:** `--text-3 (#6E6E73)`, hover vai pra `--text`
- **Nunca:** misturar icon sets, usar fill sólido (exceto status dots)

---

## 10. States

### Loading
Skeleton com shimmer sutil:
```css
background: linear-gradient(90deg, #1C1C1E 0%, #2C2C2E 50%, #1C1C1E 100%);
background-size: 200% 100%;
animation: shimmer 1.5s ease-in-out infinite;
```

### Empty
Ícone (24px, --text-3) + headline (text-md, --text-2) + body (text-sm, --text-3) + CTA opcional. Aparece em:
- `/app?filter=favorites` sem favoritos
- `/admin/offers` sem ofertas
- Search sem resultados

### Error toast
- Position: top-right
- Background: glass com tint vermelho 5%
- Border-left: 3px solid `--error`
- Auto-dismiss: 4s

### Hover de card
Como definido em §8.

### Focus visible
Sempre visível (WCAG): `box-shadow: 0 0 0 4px rgba(255,255,255,0.08)` + `border-color: var(--text)`.

---

## 11. Logo

### Wordmark + Mark "B"

```
┌────┐
│ B  │  BLACK BELT SWIPE
└────┘
```

**Mark:**
- 28×28px
- `border-radius: 7px`
- `background: linear-gradient(135deg, #F5F5F7 0%, rgba(255,255,255,0.15) 100%)`
- Letter "B" centralizado, Inter Tight 700, 14px, color `#000`

**Wordmark:**
- "BLACK BELT SWIPE"
- Inter Tight 600
- `letter-spacing: 0.12em`
- `text-transform: uppercase`
- `font-size: 13px`
- `color: var(--text-2)` em login/sidebar (sutil)
- `color: var(--text)` em hero (proeminente)

### Versões
- **Sidebar:** mark + wordmark horizontal
- **Login hero:** mark + wordmark horizontal centralizado
- **Favicon:** só mark "B" 32×32, mesma gradient
- **OG image:** mark grande + wordmark + tagline (gerado depois)

---

## 12. Component Tokens (override do shadcn)

```ts
// tailwind.config.ts (extract)
extend: {
  colors: {
    background: '#000000',
    foreground: '#F5F5F7',
    card: 'rgba(28,28,30,0.72)',
    'card-opaque': '#1C1C1E',
    border: 'rgba(255,255,255,0.10)',
    muted: { DEFAULT: '#1C1C1E', foreground: '#A1A1A6' },
    accent: { DEFAULT: '#F5F5F7', foreground: '#000000' },
    primary: { DEFAULT: '#F5F5F7', foreground: '#000000' },
    success: '#30D158',
    warning: '#FF9F0A',
    destructive: '#FF453A',
  },
  borderRadius: {
    sm: '8px', md: '12px', lg: '16px', xl: '20px', '2xl': '28px',
  },
  fontFamily: {
    display: ['Inter Tight', 'system-ui', 'sans-serif'],
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
  },
  transitionTimingFunction: {
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
}
```

---

## 13. Anti-patterns (NUNCA fazer)

- ❌ Purple/violet gradient em qualquer lugar
- ❌ Glassmorphism com gradient colorido (só preto + warm white)
- ❌ Neon glow saturado
- ❌ Inter como display font (use Inter Tight)
- ❌ Roxo/violeta como CTA (foi rejeitado em favor de Graphite)
- ❌ Bounce/spring exagerado (overshoot máximo 1.56)
- ❌ 3-column feature grid com icon circle colorido
- ❌ Decorações ornamentais (separators decorativos, divider patterns)
- ❌ Box-shadow harsh (sempre rgba sutil + inset highlight)
- ❌ Border 2px+ (sempre 1px com rgba)
- ❌ Font-weight 700+ em UI (display sim, UI não)
- ❌ Light mode (não na v1)

---

## 14. Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-17 | True black `#000000` como bg | Apple Pro vibe + economiza OLED em mobile |
| 2026-04-17 | Liquid Glass em todo chrome | Vision Pro era · diferencia brutalmente de competitors AS/Foreplay |
| 2026-04-17 | Inter Tight (display) + Inter (body) + SF Mono via fallback | Inter Tight é o mais SF-Pro-like grátis · `-apple-system` dá SF nativo a Mac users |
| 2026-04-17 | CSS-only spring (sem Framer Motion na v1) | Cobre 85% do polish necessário · -18kb gzip · simplicidade |
| 2026-04-17 | Graphite (zero accent colorido) | Risk consciente: 100% Apple Pro vibe · diferenciação máxima · accent vira warm white #F5F5F7 |
| 2026-04-17 | Logo wordmark + mark "B" | Mark gradient white-to-transparent · vibe Apple app icon |
| 2026-04-17 | Dark only v1 | Founders rodam dashboard 8h/dia · zero pedido de light mode |
