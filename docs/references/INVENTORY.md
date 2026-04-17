# Inventory — Ofertas Salvas (VSL Drive Export)

> Gerado de 5 ZIPs (8.3GB total) em `docs/references/`
> Data: 2026-04-17
> **NÃO commitar os .zip** — estão no .gitignore

## Resumo

- **33 ofertas únicas** com assets reais (VSL mp4, screenshots de landing, copy em docx)
- Assets totais: ~330+ arquivos
- Peso: 8.3 GB
- Top 3 mais completas: QUIZ BOTTREL (137 assets), ELIDA DIAS MSM (49), MEU SISTEMA LUCRATIVO (49)

## Ofertas (ordenadas por asset count)

| # | Título | Assets | Nicho inferido | Estrutura | Idioma |
|---|--------|-------:|----------------|-----------|--------|
| 1 | Quiz Bottrel | 137 | Renda Extra | Quiz | pt-BR |
| 2 | Meu Sistema Lucrativo (Paulo Borges) | 49 | Renda Extra | VSL | pt-BR |
| 3 | Elida Dias MSM | 49 | Finanças (dólar) | VSL + upsells | pt-BR |
| 4 | Bruna Soares — Método Renda Anônima TikTok | 13 | Renda Extra | VSL | pt-BR |
| 5 | Ana Neves — Produtos Virais MVA | 11 | E-commerce | VSL | pt-BR |
| 6 | Método Low Ticket (João Pedro Alves "Monstro") | 6 | Renda Extra | Low Ticket | pt-BR |
| 7 | Sistema GPS (Gucastro) | 5 | Renda Extra | VSL | pt-BR |
| 8 | Primeira Venda com IA | 5 | IA / Tech | VSL | pt-BR |
| 9 | Olívio Brito — Sistema de Lucro Automático | 5 | Renda Extra | VSL | pt-BR |
| 10 | Método Habilidade de Ouro | 5 | Renda Extra | VSL | pt-BR |
| 11 | IniciAmazon (Tomé Marcos) | 5 | Amazon / E-commerce | VSL | pt-BR |
| 12 | The AI Creator Course | 4 | IA / Creator | VSL | en-US |
| 13 | Máquina das Vendas Online (Matheus Borges) | 4 | Marketing/Vendas | VSL | pt-BR |
| 14 | Gabriel Navarro — 0 ao Investidor | 4 | Finanças | VSL | pt-BR |
| 15 | Teste dos Arquétipos (Julia Ottoni) | 3 | Desenvolvimento Pessoal | Quiz | pt-BR |
| 16 | Ruptura Viral | 3 | Creator / IA | VSL | pt-BR |
| 17 | Robô Milionário (João P. Alves) | 3 | Renda Extra / Trading | VSL | pt-BR |
| 18 | Método Polvo (Ricardo Ricieri) | 3 | Renda Extra | VSL | pt-BR |
| 19 | Escola de Automação (Thales Laray) | 3 | Marketing/Vendas | VSL | pt-BR |
| 20 | Automatik Pro (Rafael Melgaço) | 3 | Marketing/Vendas | VSL | pt-BR |
| 21 | Vanessa Lopes — Virada TikTok Shop | 2 | E-commerce | VSL | pt-BR |
| 22 | Sociedade Novos Milionários (João Digital) | 2 | Renda Extra | VSL | pt-BR |
| 23 | Social Media IA (Rayssa) | 2 | Creator / IA | VSL | pt-BR |
| 24 | Prisciane Pereira — MSL | 2 | Renda Extra | VSL | pt-BR |
| 25 | Nathália Beauty | 2 | Beleza | VSL | pt-BR |
| 26 | Método EuroDrop | 2 | E-commerce | VSL | pt-BR |
| 27 | Marca 7D (Aníbal) | 2 | Marketing/Branding | VSL | pt-BR |
| 28 | Gabriele Souza — Método Vídeos Lucrativos | 2 | Creator | VSL | pt-BR |
| 29 | Gabriel Rebouças — Sociedade Digital | 2 | Renda Extra | VSL | pt-BR |
| 30 | Dividendos Turbinados (Prof. Vicente) | 2 | Finanças | VSL | pt-BR |
| 31 | Mentoria Milionário com Internet | 1 | Renda Extra | VSL | pt-BR |
| 32 | Imersão AAA (Bruno Guerra) | 1 | Marketing | VSL | pt-BR |
| 33 | Hanna Franklin — Formato Criativo de Conteúdo | 1 | Creator | VSL | pt-BR |

## Tipos de arquivo por oferta (comum)

- `*.mp4` — VSL principal (geralmente 50-700MB)
- `screencapture-*.png` — print da landing page
- `*.docx` — copy do roteiro ou descrição
- `*.pdf` — checkout / obrigado / garantia
- Sub-pastas:
  - `UP01` / `UP02` — upsells
  - `DOWN01` / `DOWN02` — downsells
  - `FRONT` — página principal
  - `ENTREGA` — material de entrega

## Uso na Fase 01 (frontend mock)

Vou usar os **20 primeiros** desta lista como mock data real pro grid inicial. Thumbnails: gradient CSS até ter os PNGs extraídos.

## Uso na Fase 03 (worker)

Os screencaptures + mp4 reais servem pra **validar o worker** antes de rodar em ofertas ao vivo. Se worker pegar os mesmos screenshots que já temos, sabemos que tá funcionando.
