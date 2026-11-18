import { execFile } from 'node:child_process';
import { existsSync, accessSync, constants } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  MohClass, MohClassCreateInput, MohClassUpdateInput, MohDirectoryInfo, MohEnvironment, MohFile, MohUploadResult,
} from '@voip-manager/shared';
import { MohClassCreateInput as MohClassSchema } from '@voip-manager/shared';
import { musiconhold, musiconholdEntry } from '../../db/schema/asterisk/index.js';
import { badRequest, conflict, notFound, HttpError } from '../../services/errors.js';
import { convertWavTo8kMono, estimateDuration, isAsteriskNativeWav, parseWav, rawToWav } from '../../services/audio.js';

const execFileAsync = promisify(execFile);

/** Extensiones que Asterisk reproduce sin conversión. */
export const NATIVE_FORMATS = ['wav', 'gsm', 'ulaw', 'alaw', 'sln', 'sln16', 'g722', 'wav49', 'g729', 'vox'];
const CONVERTIBLE = ['mp3', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'wma', 'aiff', 'aif', 'webm', 'mp4'];

interface PathMap {
  remote: string;
  local: string;
}

export class MohService {
  private ffmpegPath: string | null | undefined;

  constructor(private readonly app: FastifyInstance) {}

  private get env() {
    return this.app.env;
  }

  private get dataRemote() {
    return this.env.ASTERISK_DATA_REMOTE_PATH.replace(/\/+$/, '');
  }
  private get mohRemote() {
    return `${this.dataRemote}/moh`;
  }

  /** Raíces locales permitidas (remoto -> local). La carpeta <astdatadir>/moh siempre es la primera. */
  private pathMaps(): PathMap[] {
    const maps: PathMap[] = [];
    if (this.env.ASTERISK_MOH_PATH) maps.push({ remote: this.mohRemote, local: this.env.ASTERISK_MOH_PATH });
    for (const m of this.env.ASTERISK_PATH_MAP) maps.push({ remote: m.remote.replace(/\/+$/, ''), local: m.local });
    return maps;
  }

  /** Traduce el directorio de una clase (relativo a astdatadir, como hace Asterisk) a la ruta local mapeada. */
  resolveDirectory(directory: string): MohDirectoryInfo {
    const maps = this.pathMaps();
    const asteriskPath = directory.startsWith('/') ? directory : `${this.dataRemote}/${directory}`;
    let localPath: string | null = null;
    for (const m of maps) {
      if (asteriskPath === m.remote || asteriskPath.startsWith(`${m.remote}/`)) {
        const rest = asteriskPath.slice(m.remote.length);
        const candidate = resolve(m.local, `.${rest}`);
        // Nunca salir de la raíz local mapeada.
        if (candidate === resolve(m.local) || candidate.startsWith(resolve(m.local) + sep)) localPath = candidate;
        break;
      }
    }
    const exists = !!localPath && existsSync(localPath);
    let writable = false;
    if (localPath) {
      try {
        accessSync(exists ? localPath : resolve(localPath, '..'), constants.W_OK);
        writable = true;
      } catch {
        writable = false;
      }
    }
    return { asteriskPath, localPath, accessible: !!localPath, exists, writable };
  }

  async environment(): Promise<MohEnvironment> {
    return {
      mohPath: this.env.ASTERISK_MOH_PATH ?? null,
      dataRemotePath: this.dataRemote,
      mohRemotePath: this.mohRemote,
      pathMap: this.env.ASTERISK_PATH_MAP,
      ffmpeg: !!(await this.ffmpeg()),
      nativeFormats: NATIVE_FORMATS,
    };
  }

  private async ffmpeg(): Promise<string | null> {
    if (this.ffmpegPath !== undefined) return this.ffmpegPath;
    const candidates = [this.env.FFMPEG_PATH, 'ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'].filter(Boolean) as string[];
    for (const c of candidates) {
      try {
        await execFileAsync(c, ['-version'], { timeout: 5000 });
        this.ffmpegPath = c;
        return c;
      } catch {
        /* siguiente */
      }
    }
    this.ffmpegPath = null;
    return null;
  }

  // ---------- Clases ----------
  private async loadedClasses(): Promise<Map<string, { mode: string; directory: string }>> {
    const map = new Map<string, { mode: string; directory: string }>();
    if (!this.app.ami.isConnected()) return map;
    try {
      const out = await this.app.ami.command('moh show classes');
      let current: { name: string; mode: string; directory: string } | null = null;
      for (const line of out.split('\n')) {
        const cls = /^Class:\s*(.+)$/.exec(line.trim());
        if (cls) {
          current = { name: cls[1]!.trim(), mode: '', directory: '' };
          map.set(current.name, current);
          continue;
        }
        const kv = /^(Mode|Directory):\s*(.*)$/.exec(line.trim());
        if (kv && current) {
          if (kv[1] === 'Mode') current.mode = kv[2]!.trim();
          else current.directory = kv[2]!.trim();
        }
      }
    } catch {
      /* AMI sin respuesta: se omite */
    }
    return map;
  }

  private async countFiles(info: MohDirectoryInfo): Promise<number | null> {
    if (!info.localPath || !info.exists) return null;
    try {
      const names = await readdir(info.localPath);
      return names.filter((n) => NATIVE_FORMATS.includes(extname(n).slice(1).toLowerCase())).length;
    } catch {
      return null;
    }
  }

  private async rowToClass(row: typeof musiconhold.$inferSelect, loaded: Map<string, { mode: string; directory: string }>): Promise<MohClass> {
    const entries = row.mode === 'playlist'
      ? (await this.app.db.select().from(musiconholdEntry).where(eq(musiconholdEntry.name, row.name)).orderBy(asc(musiconholdEntry.position))).map((e) => e.entry)
      : [];
    const directory = row.directory || `moh/${row.name}`;
    const info = this.resolveDirectory(directory);
    const mode = (['files', 'playlist', 'custom'].includes(row.mode ?? '') ? row.mode : 'files') as MohClass['mode'];
    return {
      name: row.name,
      mode,
      directory,
      sort: (['alpha', 'random', 'randstart'].includes(row.sort ?? '') ? row.sort : 'alpha') as MohClass['sort'],
      digit: row.digit ?? undefined,
      application: row.application ?? undefined,
      format: row.format ?? undefined,
      loopLast: row.loop_last === 'yes',
      entries,
      source: 'realtime',
      directoryInfo: info,
      fileCount: mode === 'files' ? await this.countFiles(info) : null,
      stamp: row.stamp ? row.stamp.toISOString() : null,
      loaded: loaded.has(row.name),
    };
  }

  async list(): Promise<MohClass[]> {
    const [rows, loaded] = await Promise.all([this.app.db.select().from(musiconhold).orderBy(asc(musiconhold.name)), this.loadedClasses()]);
    const classes = await Promise.all(rows.map((r) => this.rowToClass(r, loaded)));
    // Clases estáticas (musiconhold.conf) que Asterisk tiene cargadas y no están en la BD.
    for (const [name, l] of loaded) {
      if (classes.some((c) => c.name === name)) continue;
      const directory = l.directory || `moh/${name}`;
      const info = this.resolveDirectory(directory);
      classes.push({
        name,
        mode: (['files', 'playlist', 'custom'].includes(l.mode) ? l.mode : 'files') as MohClass['mode'],
        directory,
        sort: 'alpha',
        loopLast: false,
        entries: [],
        source: 'static',
        directoryInfo: info,
        fileCount: await this.countFiles(info),
        stamp: null,
        loaded: true,
      });
    }
    return classes.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(name: string): Promise<MohClass> {
    const cls = (await this.list()).find((c) => c.name === name);
    if (!cls) throw notFound(`Clase MOH ${name}`);
    return cls;
  }

  private rowValues(input: MohClassCreateInput) {
    return {
      mode: input.mode,
      directory: input.directory ?? `moh/${input.name}`,
      application: input.mode === 'custom' ? (input.application ?? null) : null,
      digit: input.digit || null,
      sort: input.sort,
      format: input.mode === 'custom' ? (input.format ?? null) : null,
      stamp: new Date(),
      loop_last: input.loopLast ? 'yes' : 'no',
    };
  }

  private validate(input: MohClassCreateInput) {
    if (input.mode === 'custom' && !input.application) throw badRequest('El modo custom requiere el comando en "application"');
    if (input.mode === 'playlist' && input.entries.length === 0) throw badRequest('El modo playlist requiere al menos una entrada');
  }

  async create(input: MohClassCreateInput): Promise<MohClass> {
    this.validate(input);
    const [dup] = await this.app.db.select({ name: musiconhold.name }).from(musiconhold).where(eq(musiconhold.name, input.name));
    if (dup) throw conflict(`Ya existe la clase ${input.name}`);
    const loaded = await this.loadedClasses();
    if (loaded.has(input.name)) throw conflict(`La clase ${input.name} ya está definida en musiconhold.conf`);
    await this.app.db.transaction(async (tx) => {
      await tx.insert(musiconhold).values({ name: input.name, ...this.rowValues(input) });
      if (input.mode === 'playlist') {
        await tx.insert(musiconholdEntry).values(input.entries.map((entry, position) => ({ name: input.name, position, entry })));
      }
    });
    if (input.mode === 'files') await this.ensureDirectory(input.directory ?? `moh/${input.name}`);
    await this.reload();
    return this.get(input.name);
  }

  async update(name: string, patch: MohClassUpdateInput): Promise<MohClass> {
    const [row] = await this.app.db.select().from(musiconhold).where(eq(musiconhold.name, name));
    if (!row) throw notFound(`Clase MOH ${name} (las clases estáticas se editan en musiconhold.conf)`);
    const current = await this.rowToClass(row, new Map());
    const merged = MohClassSchema.parse({ ...current, ...patch, name });
    this.validate(merged);
    await this.app.db.transaction(async (tx) => {
      await tx.update(musiconhold).set(this.rowValues(merged)).where(eq(musiconhold.name, name));
      await tx.delete(musiconholdEntry).where(eq(musiconholdEntry.name, name));
      if (merged.mode === 'playlist') {
        await tx.insert(musiconholdEntry).values(merged.entries.map((entry, position) => ({ name, position, entry })));
      }
    });
    if (merged.mode === 'files') await this.ensureDirectory(merged.directory ?? `moh/${name}`);
    await this.reload(name);
    return this.get(name);
  }

  async remove(name: string, deleteFiles: boolean): Promise<void> {
    const [row] = await this.app.db.select().from(musiconhold).where(eq(musiconhold.name, name));
    if (!row) throw notFound(`Clase MOH ${name}`);
    if (name === 'default') throw badRequest('La clase default no se puede eliminar');
    const info = this.resolveDirectory(row.directory || `moh/${name}`);
    await this.app.db.transaction(async (tx) => {
      await tx.delete(musiconholdEntry).where(eq(musiconholdEntry.name, name));
      await tx.delete(musiconhold).where(eq(musiconhold.name, name));
    });
    if (deleteFiles && info.localPath && info.exists) {
      const root = this.pathMaps().map((m) => resolve(m.local));
      if (root.some((r) => info.localPath === r)) throw badRequest('No se elimina la carpeta raíz de música en espera');
      await rm(info.localPath, { recursive: true, force: true });
    }
    await this.reload(name);
  }

  private async ensureDirectory(directory: string) {
    const info = this.resolveDirectory(directory);
    if (info.localPath && !info.exists) {
      try {
        await mkdir(info.localPath, { recursive: true });
      } catch (e) {
        this.app.log.warn({ err: e, dir: info.localPath }, 'No se pudo crear el directorio MOH');
      }
    }
  }

  /** Recarga MOH. Para clases realtime modificadas/eliminadas hay que desregistrarlas antes. */
  async reload(unregister?: string): Promise<{ ok: boolean; response: string }> {
    if (!this.app.ami.isConnected()) return { ok: false, response: 'AMI no conectado' };
    const out: string[] = [];
    try {
      if (unregister) out.push(await this.app.ami.command(`moh unregister class ${unregister}`));
      out.push(await this.app.ami.command('moh reload'));
      return { ok: true, response: out.join('\n').trim() };
    } catch (e) {
      return { ok: false, response: (e as Error).message };
    }
  }

  // ---------- Archivos ----------
  private async dirFor(name: string): Promise<{ cls: MohClass; localPath: string }> {
    const cls = await this.get(name);
    if (cls.mode !== 'files') throw badRequest(`La clase ${name} no es de tipo files`);
    if (!cls.directoryInfo.localPath) {
      throw new HttpError(
        409,
        `El directorio ${cls.directoryInfo.asteriskPath} no está mapeado localmente. Configura ASTERISK_MOH_PATH o ASTERISK_PATH_MAP para poder administrar sus archivos.`,
      );
    }
    return { cls, localPath: cls.directoryInfo.localPath };
  }

  async listFiles(name: string): Promise<MohFile[]> {
    const { localPath } = await this.dirFor(name);
    if (!existsSync(localPath)) return [];
    const names = (await readdir(localPath)).filter((n) => !n.startsWith('.')).sort();
    const files: MohFile[] = [];
    for (const n of names) {
      const p = join(localPath, n);
      const st = await stat(p);
      if (!st.isFile()) continue;
      const format = extname(n).slice(1).toLowerCase();
      let duration: number | null = null;
      if (format === 'wav') {
        const head = Buffer.alloc(Math.min(st.size, 4096));
        const fh = await readFile(p); // archivos de MOH son pequeños; lectura completa aceptable
        head.set(fh.subarray(0, head.length));
        duration = estimateDuration('wav', st.size, fh);
      } else {
        duration = estimateDuration(format, st.size);
      }
      files.push({
        name: n,
        format,
        sizeBytes: st.size,
        modifiedAt: st.mtime.toISOString(),
        durationSec: duration === null ? null : Math.round(duration * 10) / 10,
        playable: NATIVE_FORMATS.includes(format),
        previewable: ['wav', 'ulaw', 'alaw', 'sln', 'sln16'].includes(format),
      });
    }
    return files;
  }

  private safeName(original: string): string {
    const base = basename(original, extname(original))
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return base || 'audio';
  }

  private async uniquePath(dir: string, base: string, ext: string): Promise<string> {
    let candidate = join(dir, `${base}.${ext}`);
    let i = 2;
    while (existsSync(candidate)) candidate = join(dir, `${base}-${i++}.${ext}`);
    return candidate;
  }

  async upload(name: string, files: Array<{ filename: string; buffer: Buffer }>): Promise<MohUploadResult> {
    const { localPath } = await this.dirFor(name);
    await mkdir(localPath, { recursive: true });
    const ffmpeg = await this.ffmpeg();
    const result: MohUploadResult = { files: [], warnings: [] };
    for (const f of files) {
      const ext = extname(f.filename).slice(1).toLowerCase();
      const base = this.safeName(f.filename);
      try {
        if (ext === 'wav') {
          const info = parseWav(f.buffer);
          if (!info) throw new Error('WAV inválido');
          if (isAsteriskNativeWav(info)) {
            const p = await this.uniquePath(localPath, base, 'wav');
            await writeFile(p, f.buffer);
            result.files.push({ original: f.filename, stored: basename(p), converted: false, converter: 'none', error: null });
          } else {
            const out = ffmpeg ? await this.convertWithFfmpeg(ffmpeg, f.buffer, ext) : convertWavTo8kMono(f.buffer);
            const p = await this.uniquePath(localPath, base, 'wav');
            await writeFile(p, out);
            result.files.push({ original: f.filename, stored: basename(p), converted: true, converter: ffmpeg ? 'ffmpeg' : 'builtin', error: null });
          }
        } else if (NATIVE_FORMATS.includes(ext)) {
          const p = await this.uniquePath(localPath, base, ext);
          await writeFile(p, f.buffer);
          result.files.push({ original: f.filename, stored: basename(p), converted: false, converter: 'none', error: null });
        } else if (CONVERTIBLE.includes(ext)) {
          if (!ffmpeg) throw new Error(`Para convertir .${ext} se necesita ffmpeg en el servidor (FFMPEG_PATH). Sube WAV o formatos nativos.`);
          const out = await this.convertWithFfmpeg(ffmpeg, f.buffer, ext);
          const p = await this.uniquePath(localPath, base, 'wav');
          await writeFile(p, out);
          result.files.push({ original: f.filename, stored: basename(p), converted: true, converter: 'ffmpeg', error: null });
        } else {
          throw new Error(`Formato .${ext} no soportado`);
        }
      } catch (e) {
        result.files.push({ original: f.filename, stored: null, converted: false, converter: 'none', error: (e as Error).message });
      }
    }
    if (!ffmpeg) result.warnings.push('ffmpeg no disponible: solo se aceptan WAV (se convierten a 8 kHz mono) y formatos nativos de Asterisk.');
    if (result.files.some((f) => f.stored)) {
      const r = await this.reload();
      if (!r.ok) result.warnings.push(`No se pudo recargar MOH: ${r.response}`);
    }
    return result;
  }

  private async convertWithFfmpeg(ffmpeg: string, input: Buffer, ext: string): Promise<Buffer> {
    const dir = tmpdir();
    const id = `voip-moh-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const inPath = join(dir, `${id}.${ext}`);
    const outPath = join(dir, `${id}.wav`);
    try {
      await writeFile(inPath, input);
      await execFileAsync(ffmpeg, ['-y', '-loglevel', 'error', '-i', inPath, '-vn', '-ar', '8000', '-ac', '1', '-acodec', 'pcm_s16le', '-f', 'wav', outPath], { timeout: 120_000 });
      return await readFile(outPath);
    } finally {
      await unlink(inPath).catch(() => undefined);
      await unlink(outPath).catch(() => undefined);
    }
  }

  async deleteFile(name: string, file: string): Promise<void> {
    const { localPath } = await this.dirFor(name);
    const p = join(localPath, basename(file));
    if (!existsSync(p)) throw notFound(`Archivo ${file}`);
    await unlink(p);
    await this.reload();
  }

  /** Devuelve un WAV reproducible por el navegador (convierte ulaw/alaw/sln al vuelo). */
  async preview(name: string, file: string): Promise<{ buffer: Buffer; filename: string }> {
    const { localPath } = await this.dirFor(name);
    const p = join(localPath, basename(file));
    if (!existsSync(p)) throw notFound(`Archivo ${file}`);
    const format = extname(file).slice(1).toLowerCase();
    const wav = rawToWav(await readFile(p), format);
    if (!wav) throw badRequest(`No se puede previsualizar .${format} en el navegador`);
    return { buffer: wav, filename: `${basename(file, extname(file))}.wav` };
  }
}
