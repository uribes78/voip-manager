import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type {
  ConfigBackend, ConfigFileContent, ConfigFileInfo, ConfigFileWriteResult, FeatureCode, FeaturesSummary, ParkingLot,
} from '@voip-manager/shared';
import type { Env } from '../config/env.js';
import type { AmiService, AmiConfigAction } from './ami.service.js';
import { HttpError, asteriskUnavailable, badRequest, conflict, notFound } from './errors.js';

/** Archivos conocidos, con el comando CLI que aplica los cambios (null = requiere reiniciar Asterisk). */
export const CONFIG_CATALOG: Array<{ file: string; description: string; reload: string | null }> = [
  { file: 'features.conf', description: 'Códigos de función DTMF: transferencias, estacionar (parkcall), grabación (automon) y applicationmap para acciones personalizadas.', reload: 'module reload features' },
  { file: 'res_parking.conf', description: 'Lotes de estacionamiento de llamadas (parkext, parkpos, contexto, tiempo máximo).', reload: 'module reload res_parking.so' },
  { file: 'extensions.conf', description: 'Contextos estáticos del dialplan. Cada contexto realtime debe declararse aquí con switch => Realtime/<ctx>@extensions.', reload: 'dialplan reload' },
  { file: 'pjsip.conf', description: 'Transportes y opciones globales de PJSIP. Los endpoints viven en la base de datos.', reload: 'module reload res_pjsip.so' },
  { file: 'queues.conf', description: 'Opciones generales de colas. Las colas y miembros viven en la base de datos.', reload: 'module reload app_queue.so' },
  { file: 'musiconhold.conf', description: 'Clases de música en espera.', reload: 'module reload res_musiconhold.so' },
  { file: 'manager.conf', description: 'Usuarios y permisos de AMI. Cuidado: el usuario de voip-manager vive aquí.', reload: 'manager reload' },
  { file: 'res_odbc.conf', description: 'Conexiones ODBC hacia la base de datos realtime.', reload: 'module reload res_odbc.so' },
  { file: 'extconfig.conf', description: 'Mapeo de familias realtime a tablas. Requiere reiniciar Asterisk.', reload: null },
  { file: 'sorcery.conf', description: 'Origen de objetos PJSIP (realtime). Requiere reiniciar Asterisk.', reload: null },
  { file: 'modules.conf', description: 'Carga de módulos. Requiere reiniciar Asterisk.', reload: null },
  { file: 'logger.conf', description: 'Canales de log.', reload: 'logger reload' },
  { file: 'cdr.conf', description: 'Motor CDR.', reload: 'core reload' },
  { file: 'cdr_adaptive_odbc.conf', description: 'Tabla destino del CDR por ODBC.', reload: 'module reload cdr_adaptive_odbc.so' },
  { file: 'rtp.conf', description: 'Rango de puertos RTP y opciones de medios.', reload: 'module reload res_rtp_asterisk.so' },
  { file: 'indications.conf', description: 'Tonos por país.', reload: 'module reload indications' },
  { file: 'voicemail.conf', description: 'Buzones de voz.', reload: 'module reload app_voicemail.so' },
  { file: 'confbridge.conf', description: 'Salas de conferencia.', reload: 'module reload app_confbridge.so' },
];

const FEATUREMAP_NAMES: Record<string, string> = {
  blindxfer: 'Transferencia ciega',
  atxfer: 'Transferencia atendida',
  disconnect: 'Colgar',
  parkcall: 'Estacionar llamada',
  automon: 'Grabar (Monitor)',
  automixmon: 'Grabar (MixMonitor)',
};

const DIALPLAN_FEATURE_APPS: Record<string, string> = {
  Pickup: 'Capturar llamada (pickup de grupo)',
  PickupChan: 'Capturar canal',
  Park: 'Estacionar llamada',
  ParkedCall: 'Recuperar llamada estacionada',
  DirectedPickup: 'Capturar llamada dirigida',
};

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface IniCategory {
  name: string;
  options: string | null;
  lines: Array<{ var: string; value: string }>;
}

/** Parser mínimo del formato de Asterisk: [cat](opts), var = valor, var => valor, comentarios con ';' y '#'. */
export function parseIni(text: string): { categories: IniCategory[]; warnings: string[] } {
  const categories: IniCategory[] = [];
  const warnings: string[] = [];
  let current: IniCategory | null = null;
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) return;
    if (line.startsWith('#')) {
      if (/^#(include|exec|tryinclude)\b/.test(line)) warnings.push(`Línea ${i + 1}: la directiva ${line.split(/\s/)[0]} no se puede escribir por AMI`);
      return;
    }
    const cat = /^\[([^\]]+)\](.*)$/.exec(line);
    if (cat) {
      const opts = /^\(([^)]*)\)/.exec(cat[2]!.trim())?.[1] ?? null;
      current = { name: cat[1]!.trim(), options: opts, lines: [] };
      categories.push(current);
      return;
    }
    const kv = /^([^=]+?)\s*=>?\s*(.*)$/.exec(line);
    if (!kv) {
      warnings.push(`Línea ${i + 1}: no se reconoce "${line.slice(0, 40)}"`);
      return;
    }
    if (!current) {
      warnings.push(`Línea ${i + 1}: valor fuera de una categoría [..]`);
      return;
    }
    // Comentario en línea (';' no escapado)
    const value = kv[2]!.replace(/(?<!\\);.*$/, '').trim();
    current.lines.push({ var: kv[1]!.trim(), value });
  });
  return { categories, warnings };
}

export const stringifyIni = (cats: Array<{ name: string; lines: Array<{ var: string; value: string }> }>) =>
  cats.map((c) => `[${c.name}]\n${c.lines.map((l) => `${l.var} = ${l.value}`).join('\n')}`).join('\n\n') + '\n';

export class ConfigFilesService {
  constructor(
    private readonly env: Env,
    private readonly ami: AmiService,
  ) {}

  private get etcDir(): string | null {
    const dir = this.env.ASTERISK_ETC_PATH;
    return dir && existsSync(dir) ? dir : null;
  }

  private backend(): ConfigBackend {
    if (this.etcDir) return 'fs';
    if (this.ami.isConnected()) return 'ami';
    return 'none';
  }

  private catalogEntry(file: string) {
    return CONFIG_CATALOG.find((c) => c.file === file);
  }

  private safePath(file: string): string {
    const dir = this.etcDir;
    if (!dir) throw new HttpError(503, 'ASTERISK_ETC_PATH no está disponible');
    if (basename(file) !== file || file.includes('..')) throw badRequest('Nombre de archivo inválido');
    return join(dir, file);
  }

  async list(): Promise<ConfigFileInfo[]> {
    const backend = this.backend();
    const infos: ConfigFileInfo[] = [];
    const seen = new Set<string>();
    const push = async (file: string, description: string, reload: string | null, catalog: boolean) => {
      seen.add(file);
      let exists = false;
      let sizeBytes: number | null = null;
      let modifiedAt: string | null = null;
      if (backend === 'fs') {
        try {
          const st = await stat(this.safePath(file));
          exists = st.isFile();
          sizeBytes = st.size;
          modifiedAt = st.mtime.toISOString();
        } catch {
          exists = false;
        }
      } else if (backend === 'ami') {
        exists = true; // se confirma al leer
      }
      infos.push({ file, description, reloadCommand: reload, backend, exists, writable: backend !== 'none' && (backend === 'fs' || exists), sizeBytes, modifiedAt, catalog });
    };
    for (const c of CONFIG_CATALOG) await push(c.file, c.description, c.reload, true);
    if (backend === 'fs') {
      const dir = this.etcDir!;
      const extra = (await readdir(dir)).filter((f) => f.endsWith('.conf') && !seen.has(f)).sort();
      for (const f of extra) await push(f, 'Otro archivo de configuración de Asterisk.', null, false);
    }
    return infos;
  }

  async read(file: string): Promise<ConfigFileContent> {
    const backend = this.backend();
    const entry = this.catalogEntry(file);
    const reloadCommand = entry?.reload ?? null;
    if (backend === 'fs') {
      const path = this.safePath(file);
      try {
        const [content, st] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
        return { file, backend, path, content, hash: sha256(content), commentsPreserved: true, modifiedAt: st.mtime.toISOString(), reloadCommand };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
          if (!entry) throw notFound(`Archivo ${file}`);
          return { file, backend, path, content: '', hash: sha256(''), commentsPreserved: true, modifiedAt: null, reloadCommand };
        }
        throw e;
      }
    }
    if (backend === 'ami') {
      if (!entry) throw notFound(`Archivo ${file}`);
      try {
        const cats = await this.ami.getConfig(file);
        const content = stringifyIni(cats);
        return { file, backend, path: null, content, hash: sha256(content), commentsPreserved: false, modifiedAt: null, reloadCommand };
      } catch (e) {
        if (/not found/i.test((e as Error).message)) throw notFound(`Archivo ${file} en el servidor Asterisk`);
        throw e;
      }
    }
    throw asteriskUnavailable('No hay acceso a los archivos: define ASTERISK_ETC_PATH o conecta AMI');
  }

  async write(file: string, content: string, expectedHash: string | undefined, reload: boolean): Promise<ConfigFileWriteResult> {
    const backend = this.backend();
    const entry = this.catalogEntry(file);
    const current = await this.read(file);
    if (expectedHash && expectedHash !== current.hash) {
      throw conflict('El archivo cambió desde que lo abriste. Recárgalo y vuelve a aplicar tus cambios.');
    }
    const normalized = content.replace(/\r\n/g, '\n');
    const { categories, warnings } = parseIni(normalized);
    let backupPath: string | null = null;

    if (backend === 'fs') {
      const path = this.safePath(file);
      if (current.modifiedAt) {
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
        const bakDir = join(this.etcDir!, '.voip-manager-backups');
        await mkdir(bakDir, { recursive: true });
        backupPath = join(bakDir, `${file}.${stamp}.bak`);
        await copyFile(path, backupPath);
        await this.pruneBackups(bakDir, file, 10);
      }
      const tmp = `${path}.tmp-${process.pid}`;
      await writeFile(tmp, normalized, 'utf8');
      await rename(tmp, path);
    } else if (backend === 'ami') {
      if (!entry) throw notFound(`Archivo ${file}`);
      if (warnings.length) warnings.push('Los comentarios no se conservan al guardar por AMI.');
      else warnings.push('Los comentarios no se conservan al guardar por AMI.');
      const existing = await this.ami.getConfig(file);
      const actions: AmiConfigAction[] = [];
      for (const c of existing) actions.push({ action: 'DelCat', cat: c.name });
      for (const c of categories) {
        actions.push({ action: 'NewCat', cat: c.name, options: c.options ? `allowdups,${c.options}` : 'allowdups' });
        for (const l of c.lines) actions.push({ action: 'Append', cat: c.name, var: l.var, value: l.value });
      }
      await this.ami.updateConfig(file, actions);
    } else {
      throw asteriskUnavailable('No hay acceso a los archivos: define ASTERISK_ETC_PATH o conecta AMI');
    }

    let reloadResult: ConfigFileWriteResult['reload'] = null;
    const command = entry?.reload ?? null;
    if (reload && command) {
      if (!this.ami.isConnected()) {
        warnings.push('AMI no está conectado: los cambios se guardaron pero no se recargó el módulo.');
      } else {
        try {
          const response = await this.ami.command(command);
          reloadResult = { command, response, ok: !/error|fail|no such/i.test(response) };
        } catch (e) {
          reloadResult = { command, response: (e as Error).message, ok: false };
        }
      }
    } else if (reload && entry && !command) {
      warnings.push('Este archivo requiere reiniciar Asterisk para aplicar los cambios.');
    }
    return { file, backend, hash: sha256(normalized), backupPath, reload: reloadResult, warnings };
  }

  private async pruneBackups(dir: string, file: string, keep: number) {
    const files = (await readdir(dir)).filter((f) => f.startsWith(`${file}.`) && f.endsWith('.bak')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - keep))) await unlink(join(dir, f)).catch(() => undefined);
  }

  // ---------- Resumen de códigos de función ----------
  async featuresSummary(dialplanFeatures: Array<{ context: string; exten: string; app: string; appdata: string }>): Promise<FeaturesSummary> {
    const codes: FeatureCode[] = [];
    const parkingLots: ParkingLot[] = [];
    const general: Record<string, string> = {};
    const sources: FeaturesSummary['sources'] = [];

    const load = async (file: string): Promise<IniCategory[] | null> => {
      try {
        const c = await this.read(file);
        sources.push({ file, backend: c.backend, exists: c.modifiedAt !== null || c.backend === 'ami' });
        return parseIni(c.content).categories;
      } catch {
        sources.push({ file, backend: this.backend(), exists: false });
        return null;
      }
    };

    const features = await load('features.conf');
    for (const cat of features ?? []) {
      if (cat.name === 'general') for (const l of cat.lines) general[l.var] = l.value;
      if (cat.name === 'featuremap') {
        for (const l of cat.lines) {
          if (!l.value) continue;
          codes.push({ code: l.value, name: FEATUREMAP_NAMES[l.var] ?? l.var, source: 'featuremap', description: `featuremap: ${l.var}`, activateOn: null, application: null, context: null });
        }
      }
      if (cat.name === 'applicationmap') {
        for (const l of cat.lines) {
          // name => DTMF,ActivateOn[/ActivatedBy],Application[,Args[,MoHClass]]  |  Application(Args)
          const parts = l.value.split(',');
          const dtmf = parts[0]?.trim() ?? '';
          const activateOn = parts[1]?.trim() ?? null;
          const app = parts.slice(2).join(',').trim() || null;
          codes.push({ code: dtmf, name: l.var, source: 'applicationmap', description: 'applicationmap (requiere DYNAMIC_FEATURES en el canal)', activateOn, application: app, context: null });
        }
      }
    }

    // Captura de llamadas de grupo: opción pickupexten de [general] (por defecto *8).
    if (features) {
      codes.push({
        code: general.pickupexten ?? '*8',
        name: 'Capturar llamada de grupo',
        source: 'featuremap',
        description: general.pickupexten ? 'general: pickupexten' : 'general: pickupexten (valor por defecto)',
        activateOn: null,
        application: 'Pickup',
        context: null,
      });
    }

    const parking = await load('res_parking.conf');
    for (const cat of parking ?? []) {
      if (cat.name === 'general') continue;
      const get = (k: string) => cat.lines.find((l) => l.var === k)?.value ?? null;
      const lot: ParkingLot = { name: cat.name, parkext: get('parkext'), parkpos: get('parkpos'), context: get('context'), parkingtime: get('parkingtime') };
      parkingLots.push(lot);
      if (lot.parkext) {
        codes.push({ code: lot.parkext, name: `Estacionar en lote ${lot.name}`, source: 'parking', description: `Espacios ${lot.parkpos ?? '?'} en el contexto ${lot.context ?? 'parkedcalls'}`, activateOn: null, application: 'Park', context: lot.context });
      }
    }

    for (const d of dialplanFeatures) {
      const label = DIALPLAN_FEATURE_APPS[d.app];
      if (!label) continue;
      codes.push({ code: d.exten, name: label, source: 'dialplan', description: `${d.app}(${d.appdata}) en el contexto ${d.context}`, activateOn: null, application: d.app, context: d.context });
    }

    return { codes, parkingLots, general, sources };
  }
}

export const DIALPLAN_FEATURE_APP_NAMES = Object.keys(DIALPLAN_FEATURE_APPS);
