import { open, stat } from 'node:fs/promises';
import type { LogLine, LogQuery, LogResult } from '@voip-manager/shared';

// [2026-11-17 10:00:00] WARNING[1234] res_pjsip.c: mensaje
// [2026-11-17 10:00:00] WARNING[1234]: res_pjsip.c:123 fn: mensaje
// [2026-11-17 10:00:00] VERBOSE[1234] mensaje sin módulo
const ASTERISK_LINE = /^\[([^\]]+)\]\s+([A-Z]+)\[[^\]]*\](?::\s+([^\s:]+):\d+\s+\S+:|\s+([^\s:]+\.[ch]):)?\s*(.*)$/;

export function parseAsteriskLine(raw: string): LogLine {
  const m = ASTERISK_LINE.exec(raw);
  if (!m) return { raw, timestamp: null, level: null, module: null, message: raw };
  return { raw, timestamp: m[1] ?? null, level: m[2] ?? null, module: m[3] ?? m[4] ?? null, message: m[5] ?? raw };
}

export function parseServiceLine(raw: string): LogLine {
  try {
    const j = JSON.parse(raw) as { time?: number | string; level?: number | string; msg?: string; module?: string };
    const levels: Record<number, string> = { 10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARNING', 50: 'ERROR', 60: 'FATAL' };
    const level = typeof j.level === 'number' ? (levels[j.level] ?? String(j.level)) : (j.level ?? null);
    const ts = j.time ? new Date(j.time).toISOString() : null;
    return { raw, timestamp: ts, level: level ? String(level) : null, module: j.module ?? null, message: j.msg ?? raw };
  } catch {
    return { raw, timestamp: null, level: null, module: null, message: raw };
  }
}

/** Lee las últimas `maxLines` líneas de un archivo sin cargarlo completo (lectura por bloques desde el final). */
export async function tailFile(path: string, maxLines: number, maxBytes = 8 * 1024 * 1024): Promise<string[]> {
  const info = await stat(path);
  const fh = await open(path, 'r');
  try {
    const chunk = 64 * 1024;
    let pos = info.size;
    let buf = '';
    let read = 0;
    while (pos > 0 && read < maxBytes) {
      const len = Math.min(chunk, pos);
      pos -= len;
      const b = Buffer.alloc(len);
      await fh.read(b, 0, len, pos);
      read += len;
      buf = b.toString('utf8') + buf;
      if (buf.split('\n').length > maxLines + 1) break;
    }
    const lines = buf.split('\n');
    if (lines.at(-1) === '') lines.pop();
    if (pos > 0 && lines.length > maxLines) lines.shift(); // primera línea posiblemente truncada
    return lines.slice(-maxLines);
  } finally {
    await fh.close();
  }
}

export async function readLogs(path: string | undefined, query: LogQuery): Promise<LogResult> {
  const base: LogResult = {
    source: query.source,
    path: path ?? '',
    exists: false,
    sizeBytes: 0,
    lines: [],
    summary: { errors: 0, warnings: 0, notices: 0 },
  };
  if (!path) return base;
  let size = 0;
  try {
    size = (await stat(path)).size;
  } catch {
    return base;
  }
  // Leemos más de lo pedido para que grep/level tengan material que filtrar.
  const raw = await tailFile(path, query.grep || query.level ? query.lines * 10 : query.lines);
  const parse = query.source === 'asterisk' ? parseAsteriskLine : parseServiceLine;
  const needle = query.grep?.toLowerCase();
  const lines = raw
    .map(parse)
    .filter((l) => (!query.level || l.level === query.level) && (!needle || l.raw.toLowerCase().includes(needle)))
    .slice(-query.lines);
  const summary = lines.reduce(
    (acc, l) => {
      if (l.level === 'ERROR' || l.level === 'FATAL') acc.errors++;
      else if (l.level === 'WARNING') acc.warnings++;
      else if (l.level === 'NOTICE') acc.notices++;
      return acc;
    },
    { errors: 0, warnings: 0, notices: 0 },
  );
  return { ...base, exists: true, sizeBytes: size, lines, summary };
}
