# Scripts — Black Belt Swipe

## transcribe-vsls.ts

Transcreve todos os VSLs dos zips em `docs/references/` usando OpenAI Whisper.

### Pré-requisitos

```bash
# 1. Bun instalado (https://bun.sh)
bun --version

# 2. ffmpeg instalado
brew install ffmpeg

# 3. Dependência OpenAI
bun add openai

# 4. API key (obter em https://platform.openai.com/api-keys)
export OPENAI_API_KEY=sk-proj-...
```

### Execução

```bash
# Primeira run — vai processar as 33 ofertas
bun run scripts/transcribe-vsls.ts

# Re-rodar pula as que já foram transcritas (verifica existência do .json)
bun run scripts/transcribe-vsls.ts
```

### Saída

```
docs/references/transcripts/
├── quiz-bottrel.json              # { text, segments[], duration, ... }
├── quiz-bottrel.txt               # só o texto, pra preview rápido
├── meu-sistema-lucrativo.json
├── meu-sistema-lucrativo.txt
├── ... (33 ofertas)
└── INDEX.json                     # manifest + custo + duração total
```

### Como funciona

1. Lê os 5 .zip em `docs/references/`, mapeia cada oferta ao MP4 principal
2. Extrai o MP4 pra `/tmp/bbs-vsl-working/` (temporário)
3. Converte pra MP3 mono 16kHz 64kbps (reduz 10× sem perder voz)
4. Se > 24MB, divide em chunks de 20min
5. Chama Whisper API (`whisper-1`, response_format=verbose_json) com hint `language=pt`
6. Concatena segments, salva JSON + TXT
7. Limpa `/tmp`

### Custo estimado

- Whisper: **$0.006/min**
- 33 VSLs × ~30min avg = **~990 min**
- Total: **~$6 USD**

### Tempo estimado

- Extração + conversão: ~2min por VSL
- Whisper API: ~1-3min por VSL (depende do tamanho)
- **Total: ~1h30 processando** pra 33 VSLs

### Idempotente

Re-rodar é seguro. Script verifica se `{slug}.json` já existe e pula.

### Próximos passos (depois da Fase 01)

Fase 02-03 vai:
- Migrar esses JSONs pro Supabase Postgres (tabela `transcripts`)
- Upload das mp4 originais pro Supabase Storage
- Worker Whisper processa VSLs NOVAS que admin fizer upload
- UI de busca no transcrito full-text (Postgres `tsvector`)
