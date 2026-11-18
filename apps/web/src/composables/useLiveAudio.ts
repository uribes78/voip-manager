import { onBeforeUnmount, ref } from 'vue';
import type { ListenSession } from '@voip-manager/shared';
import { monitorService } from '@/services';
import { useAuthStore } from '@/stores/auth';

/**
 * Reproduce en el navegador el audio SLIN 16 bits 8 kHz que llega por WebSocket (20 ms por frame),
 * encolando buffers en WebAudio con un pequeño colchón para evitar cortes.
 */
export function useLiveAudio() {
  const auth = useAuthStore();
  const session = ref<ListenSession | null>(null);
  const state = ref<'idle' | 'connecting' | 'playing' | 'ended' | 'error'>('idle');
  const error = ref<string | null>(null);
  const metadata = ref<Record<string, unknown> | null>(null);
  const level = ref(0);
  const muted = ref(false);
  let ws: WebSocket | null = null;
  let ctx: AudioContext | null = null;
  let gain: GainNode | null = null;
  let nextTime = 0;
  const JITTER = 0.12; // segundos de colchón

  function playFrame(buf: ArrayBuffer) {
    if (!ctx || !gain) return;
    const pcm = new Int16Array(buf);
    const audio = ctx.createBuffer(1, pcm.length, 8000);
    const ch = audio.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) {
      const v = pcm[i]! / 32768;
      ch[i] = v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    level.value = peak;
    const src = ctx.createBufferSource();
    src.buffer = audio;
    src.connect(gain);
    const now = ctx.currentTime;
    if (nextTime < now + 0.02) nextTime = now + JITTER;
    src.start(nextTime);
    nextTime += audio.duration;
  }

  async function start(callId: string, channel?: string) {
    await stop();
    state.value = 'connecting';
    error.value = null;
    try {
      session.value = await monitorService.listen(callId, channel ? { channel } : {});
      ctx = new AudioContext({ sampleRate: 8000 });
      gain = ctx.createGain();
      gain.gain.value = muted.value ? 0 : 1;
      gain.connect(ctx.destination);
      await ctx.resume();
      nextTime = 0;
      ws = new WebSocket(monitorService.listenUrl(session.value, auth.accessToken ?? ''));
      ws.binaryType = 'arraybuffer';
      ws.onmessage = (m) => {
        if (typeof m.data === 'string') {
          try {
            const j = JSON.parse(m.data) as Record<string, unknown>;
            if (j.event === 'fork-ended') state.value = 'ended';
            else if (j.event !== 'ready') metadata.value = j;
          } catch {
            /* ignorar */
          }
          return;
        }
        if (state.value !== 'playing') state.value = 'playing';
        playFrame(m.data as ArrayBuffer);
      };
      ws.onclose = () => {
        if (state.value === 'playing' || state.value === 'connecting') state.value = 'ended';
      };
      ws.onerror = () => {
        state.value = 'error';
        error.value = 'Se perdió la conexión de audio';
      };
    } catch (e) {
      state.value = 'error';
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  async function stop() {
    const s = session.value;
    ws?.close();
    ws = null;
    if (ctx) await ctx.close().catch(() => undefined);
    ctx = null;
    gain = null;
    session.value = null;
    metadata.value = null;
    level.value = 0;
    if (state.value !== 'idle') state.value = 'idle';
    if (s) await monitorService.stopListen(s.sessionId).catch(() => undefined);
  }

  function toggleMute() {
    muted.value = !muted.value;
    if (gain) gain.gain.value = muted.value ? 0 : 1;
  }

  onBeforeUnmount(() => void stop());
  return { session, state, error, metadata, level, muted, start, stop, toggleMute };
}
