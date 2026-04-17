#!/usr/bin/env bun
/**
 * Transcribe VSLs — roda Whisper API sobre todos os VSLs nos zips de docs/references/
 *
 * Uso:
 *   bun install openai
 *   export OPENAI_API_KEY=sk-proj-...
 *   bun run scripts/transcribe-vsls.ts
 *
 * Por VSL:
 *   1. Extrai mp4 do zip pra /tmp/bbs-vsl-working/
 *   2. Se > 25MB (limite Whisper), divide em chunks de 20min via ffmpeg
 *   3. Chama Whisper (model=whisper-1, response_format=verbose_json)
 *   4. Concatena segments, salva JSON + txt em docs/references/transcripts/{slug}.json
 *   5. Remove mp4 extraído de /tmp
 *
 * Saída:
 *   docs/references/transcripts/{slug}.json   (segments com timestamps)
 *   docs/references/transcripts/{slug}.txt    (texto plain pra preview)
 *   docs/references/transcripts/INDEX.json    (manifest de todos)
 *
 * Custo estimado: ~$6 pros 33 VSLs (Whisper = $0.006/min)
 */

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync, unlinkSync, rmSync } from 'fs'
import { execSync, spawnSync } from 'child_process'
import { resolve, basename, join } from 'path'
import OpenAI from 'openai'

const REFS = resolve(process.cwd(), 'docs/references')
const WORK = '/tmp/bbs-vsl-working'
const OUT = resolve(REFS, 'transcripts')
const MAX_WHISPER_SIZE_MB = 24  // API limit is 25MB, stay safe
const CHUNK_MINUTES = 20

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY não definida. Exporta: export OPENAI_API_KEY=sk-proj-...')
  process.exit(1)
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

type Manifest = {
  generated_at: string
  total_offers: number
  total_duration_seconds: number
  total_cost_usd: number
  entries: Array<{
    slug: string
    offer_name: string
    source_zip: string
    source_path: string
    mp4_size_mb: number
    duration_seconds: number
    cost_usd: number
    status: 'done' | 'error' | 'skipped'
    error?: string
  }>
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}

function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
}

function listMp4sInZip(zipPath: string): string[] {
  const out = execSync(`unzip -l "${zipPath}"`, { encoding: 'utf-8' })
  return out
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.toLowerCase().endsWith('.mp4'))
    .map(l => l.split(/\s+/).slice(3).join(' '))
}

function extractFromZip(zipPath: string, innerPath: string, destDir: string): string {
  ensureDir(destDir)
  execSync(`unzip -o -j "${zipPath}" "${innerPath}" -d "${destDir}"`, { stdio: 'pipe' })
  return join(destDir, basename(innerPath))
}

function getDurationSeconds(mp4: string): number {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mp4}"`,
    { encoding: 'utf-8' }
  )
  return Math.ceil(parseFloat(out.trim()))
}

function splitIntoChunks(mp4: string, chunkMinutes: number, destDir: string): string[] {
  const chunks: string[] = []
  const duration = getDurationSeconds(mp4)
  const chunkSec = chunkMinutes * 60
  let i = 0
  for (let start = 0; start < duration; start += chunkSec) {
    const chunkPath = join(destDir, `chunk-${i.toString().padStart(2, '0')}.mp3`)
    execSync(
      `ffmpeg -y -i "${mp4}" -ss ${start} -t ${chunkSec} -vn -ac 1 -ar 16000 -b:a 64k "${chunkPath}"`,
      { stdio: 'pipe' }
    )
    chunks.push(chunkPath)
    i++
  }
  return chunks
}

async function transcribeChunk(audioPath: string) {
  const file = Bun.file(audioPath)
  const resp = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
    language: 'pt', // maioria pt-BR; se for en-US a API auto-detecta mesmo com hint
  })
  return resp as any
}

async function processOffer(offerName: string, mp4Path: string, sourceZip: string, sourceInner: string) {
  const slug = slugify(offerName)
  const outJson = join(OUT, `${slug}.json`)
  const outTxt = join(OUT, `${slug}.txt`)

  if (existsSync(outJson)) {
    console.log(`  ⏭️  ${slug} já processado, pulando`)
    return { slug, status: 'skipped' as const, duration: 0, cost: 0 }
  }

  const sizeMB = statSync(mp4Path).size / 1024 / 1024
  const duration = getDurationSeconds(mp4Path)
  const workDir = join(WORK, slug)
  ensureDir(workDir)

  let chunks: string[]
  if (sizeMB > MAX_WHISPER_SIZE_MB) {
    console.log(`  📦 ${sizeMB.toFixed(1)}MB > 24MB, dividindo em chunks de ${CHUNK_MINUTES}min`)
    chunks = splitIntoChunks(mp4Path, CHUNK_MINUTES, workDir)
  } else {
    // converte pra mp3 mono 16k mesmo assim (menor, Whisper ok)
    const mp3 = join(workDir, 'audio.mp3')
    execSync(`ffmpeg -y -i "${mp4Path}" -vn -ac 1 -ar 16000 -b:a 64k "${mp3}"`, { stdio: 'pipe' })
    chunks = [mp3]
  }

  const allSegments: any[] = []
  let fullText = ''
  let chunkOffset = 0

  for (const chunk of chunks) {
    console.log(`  🎙️  whisper ${basename(chunk)}...`)
    const resp = await transcribeChunk(chunk)
    fullText += (fullText ? '\n\n' : '') + resp.text
    for (const seg of resp.segments || []) {
      allSegments.push({
        ...seg,
        start: seg.start + chunkOffset,
        end: seg.end + chunkOffset,
      })
    }
    chunkOffset += resp.duration || CHUNK_MINUTES * 60
    unlinkSync(chunk)
  }

  const payload = {
    slug,
    offer_name: offerName,
    source_zip: basename(sourceZip),
    source_path: sourceInner,
    duration_seconds: duration,
    mp4_size_mb: Number(sizeMB.toFixed(1)),
    language: 'pt',
    model: 'whisper-1',
    transcribed_at: new Date().toISOString(),
    text: fullText,
    segments: allSegments,
  }

  writeFileSync(outJson, JSON.stringify(payload, null, 2))
  writeFileSync(outTxt, fullText)

  const cost = (duration / 60) * 0.006
  rmSync(workDir, { recursive: true, force: true })

  console.log(`  ✅ ${slug} · ${duration}s · $${cost.toFixed(3)}`)
  return { slug, status: 'done' as const, duration, cost }
}

async function main() {
  console.log('🎬 Black Belt Swipe — Transcrição de VSLs\n')

  // deps check
  try { execSync('which ffmpeg', { stdio: 'pipe' }) } catch {
    console.error('❌ ffmpeg não instalado. brew install ffmpeg')
    process.exit(1)
  }
  try { execSync('which unzip', { stdio: 'pipe' }) } catch {
    console.error('❌ unzip não encontrado')
    process.exit(1)
  }

  ensureDir(OUT)
  ensureDir(WORK)

  const zips = readdirSync(REFS).filter(f => f.endsWith('.zip')).map(f => join(REFS, f))
  if (zips.length === 0) {
    console.error(`❌ Nenhum .zip encontrado em ${REFS}`)
    process.exit(1)
  }

  // 1. Build index: map offer_name -> { zip, largest_mp4_inner_path }
  const offerMap = new Map<string, { zip: string; innerPath: string; sizeEstimate: number }>()

  for (const zip of zips) {
    const list = execSync(`unzip -l "${zip}"`, { encoding: 'utf-8' }).split('\n')
    for (const line of list) {
      const m = line.match(/^\s*(\d+)\s+\S+\s+\S+\s+(VSL\/VSL - [^\/]+\/[^\/]+\.mp4)\s*$/)
      if (m) {
        const size = parseInt(m[1], 10)
        const inner = m[2]
        const offerName = inner.match(/VSL - ([^\/]+)/)?.[1]?.trim()
        if (!offerName) continue
        const existing = offerMap.get(offerName)
        // escolhe o maior mp4 do root da pasta (geralmente a VSL principal, não up/down)
        const isRoot = inner.split('/').length === 3
        if (isRoot && (!existing || size > existing.sizeEstimate)) {
          offerMap.set(offerName, { zip, innerPath: inner, sizeEstimate: size })
        } else if (!existing) {
          offerMap.set(offerName, { zip, innerPath: inner, sizeEstimate: size })
        }
      }
    }
  }

  console.log(`📋 ${offerMap.size} ofertas únicas com VSL principal\n`)

  const manifest: Manifest = {
    generated_at: new Date().toISOString(),
    total_offers: offerMap.size,
    total_duration_seconds: 0,
    total_cost_usd: 0,
    entries: [],
  }

  let i = 0
  for (const [offerName, info] of offerMap) {
    i++
    console.log(`\n[${i}/${offerMap.size}] ${offerName}`)
    try {
      const mp4Dir = join(WORK, 'extract')
      const mp4Path = extractFromZip(info.zip, info.innerPath, mp4Dir)
      const result = await processOffer(offerName, mp4Path, info.zip, info.innerPath)
      unlinkSync(mp4Path)

      manifest.entries.push({
        slug: result.slug,
        offer_name: offerName,
        source_zip: basename(info.zip),
        source_path: info.innerPath,
        mp4_size_mb: Number((info.sizeEstimate / 1024 / 1024).toFixed(1)),
        duration_seconds: result.duration,
        cost_usd: Number(result.cost.toFixed(4)),
        status: result.status,
      })
      manifest.total_duration_seconds += result.duration
      manifest.total_cost_usd += result.cost
    } catch (err: any) {
      console.error(`  ❌ Erro: ${err.message}`)
      manifest.entries.push({
        slug: slugify(offerName),
        offer_name: offerName,
        source_zip: basename(info.zip),
        source_path: info.innerPath,
        mp4_size_mb: Number((info.sizeEstimate / 1024 / 1024).toFixed(1)),
        duration_seconds: 0,
        cost_usd: 0,
        status: 'error',
        error: err.message,
      })
    }
  }

  writeFileSync(join(OUT, 'INDEX.json'), JSON.stringify(manifest, null, 2))

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`✅ Concluído`)
  console.log(`   ${manifest.entries.filter(e => e.status === 'done').length} transcritas`)
  console.log(`   ${manifest.entries.filter(e => e.status === 'skipped').length} puladas (já existiam)`)
  console.log(`   ${manifest.entries.filter(e => e.status === 'error').length} erros`)
  console.log(`   ${(manifest.total_duration_seconds / 60).toFixed(0)} minutos processados`)
  console.log(`   $${manifest.total_cost_usd.toFixed(2)} gasto`)
  console.log(`\n   Saída: ${OUT}`)
}

main().catch(err => {
  console.error('❌ Erro fatal:', err)
  process.exit(1)
})
