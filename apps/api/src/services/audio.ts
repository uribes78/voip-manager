/**
 * Utilidades de audio sin dependencias: lectura de cabeceras WAV, conversión a WAV PCM 8 kHz mono 16 bits
 * (formato universal para música en espera en Asterisk) y envoltura de formatos crudos (ulaw/alaw/sln) en WAV
 * para previsualizar en el navegador.
 */

export interface WavInfo {
  audioFormat: number; // 1 = PCM, 3 = IEEE float
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

export function parseWav(buf: Buffer): WavInfo | null {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let pos = 12;
  let fmt: Omit<WavInfo, 'dataOffset' | 'dataLength'> | null = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ' && body + 16 <= buf.length) {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
      if (fmt.audioFormat === 0xfffe && size >= 26) fmt.audioFormat = buf.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === 'data' && fmt) {
      return { ...fmt, dataOffset: body, dataLength: Math.min(size, buf.length - body) };
    }
    pos = body + size + (size % 2);
  }
  return null;
}

/** true si Asterisk lo reproduce tal cual (PCM 16 bits mono a 8 o 16 kHz). */
export const isAsteriskNativeWav = (w: WavInfo) =>
  w.audioFormat === 1 && w.channels === 1 && w.bitsPerSample === 16 && (w.sampleRate === 8000 || w.sampleRate === 16000);

function readSamples(buf: Buffer, w: WavInfo): Float32Array {
  const bytes = w.bitsPerSample / 8;
  const frames = Math.floor(w.dataLength / (bytes * w.channels));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let acc = 0;
    for (let c = 0; c < w.channels; c++) {
      const p = w.dataOffset + (i * w.channels + c) * bytes;
      let v: number;
      if (w.audioFormat === 3) v = bytes === 4 ? buf.readFloatLE(p) : buf.readDoubleLE(p);
      else if (bytes === 1) v = (buf.readUInt8(p) - 128) / 128;
      else if (bytes === 2) v = buf.readInt16LE(p) / 32768;
      else if (bytes === 3) v = ((buf[p]! | (buf[p + 1]! << 8) | (buf[p + 2]! << 16)) << 8 >> 8) / 8388608;
      else v = buf.readInt32LE(p) / 2147483648;
      acc += v;
    }
    out[i] = acc / w.channels;
  }
  return out;
}

/** Remuestreo simple: promedio por ventana al bajar la tasa, interpolación lineal al subirla. */
function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const ratio = from / to;
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLen);
  if (ratio > 1) {
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
      let acc = 0;
      for (let j = start; j < end; j++) acc += samples[j]!;
      out[i] = end > start ? acc / (end - start) : 0;
    }
  } else {
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(samples.length - 1, i0 + 1);
      const t = pos - i0;
      out[i] = samples[i0]! * (1 - t) + samples[i1]! * t;
    }
  }
  return out;
}

export function wavHeader(dataLength: number, sampleRate = 8000, channels = 1, bits = 16): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + dataLength, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE((sampleRate * channels * bits) / 8, 28);
  h.writeUInt16LE((channels * bits) / 8, 32);
  h.writeUInt16LE(bits, 34);
  h.write('data', 36);
  h.writeUInt32LE(dataLength, 40);
  return h;
}

export function pcm16ToWav(pcm: Buffer, sampleRate = 8000): Buffer {
  return Buffer.concat([wavHeader(pcm.length, sampleRate), pcm]);
}

/** Convierte cualquier WAV PCM/float a WAV PCM 16 bits mono 8 kHz. */
export function convertWavTo8kMono(buf: Buffer): Buffer {
  const w = parseWav(buf);
  if (!w) throw new Error('No es un archivo WAV válido');
  if (w.audioFormat !== 1 && w.audioFormat !== 3) throw new Error(`WAV con codificación no soportada (formato ${w.audioFormat}); usa ffmpeg`);
  const mono = resample(readSamples(buf, w), w.sampleRate, 8000);
  const pcm = Buffer.alloc(mono.length * 2);
  for (let i = 0; i < mono.length; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mono[i]! * 32767))), i * 2);
  return pcm16ToWav(pcm, 8000);
}

// ---- Decodificación G.711 para previsualizar ulaw/alaw ----
function ulawToLinear(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}
function alawToLinear(a: number): number {
  a ^= 0x55;
  const sign = a & 0x80;
  const exponent = (a >> 4) & 0x07;
  const mantissa = a & 0x0f;
  let sample = exponent === 0 ? (mantissa << 4) + 8 : ((mantissa << 4) + 0x108) << (exponent - 1);
  return sign ? sample : -sample;
}

/** Envuelve formatos crudos de Asterisk en un WAV reproducible por el navegador. */
export function rawToWav(buf: Buffer, format: string): Buffer | null {
  switch (format) {
    case 'wav':
      return buf;
    case 'ulaw':
    case 'alaw': {
      const pcm = Buffer.alloc(buf.length * 2);
      const dec = format === 'ulaw' ? ulawToLinear : alawToLinear;
      for (let i = 0; i < buf.length; i++) pcm.writeInt16LE(dec(buf[i]!), i * 2);
      return pcm16ToWav(pcm, 8000);
    }
    case 'sln':
      return pcm16ToWav(buf, 8000);
    case 'sln16':
      return pcm16ToWav(buf, 16000);
    default:
      return null;
  }
}

/** Duración aproximada en segundos según formato nativo de Asterisk. */
export function estimateDuration(format: string, size: number, buf?: Buffer): number | null {
  switch (format) {
    case 'wav': {
      const w = buf ? parseWav(buf) : null;
      if (!w) return null;
      return w.dataLength / ((w.sampleRate * w.channels * w.bitsPerSample) / 8);
    }
    case 'gsm':
      return (size / 33) * 0.02;
    case 'ulaw':
    case 'alaw':
      return size / 8000;
    case 'sln':
      return size / 16000;
    case 'sln16':
      return size / 32000;
    case 'g722':
      return size / 8000;
    case 'wav49':
      return (size / 65) * 0.04;
    default:
      return null;
  }
}
