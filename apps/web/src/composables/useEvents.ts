import { onBeforeUnmount, onMounted, watch } from 'vue';
import { WsEvent } from '@voip-manager/shared';
import { useAuthStore } from '@/stores/auth';
import { useRealtimeStore } from '@/stores/realtime';

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;
let subscribers = 0;
let manualClose = false;

function wsUrl(token: string) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws/events?token=${encodeURIComponent(token)}`;
}

function connect() {
  const auth = useAuthStore();
  const realtime = useRealtimeStore();
  if (!auth.accessToken || subscribers === 0) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  manualClose = false;
  realtime.wsState = 'connecting';
  const ws = new WebSocket(wsUrl(auth.accessToken));
  socket = ws;

  ws.onopen = () => {
    attempts = 0;
    realtime.wsState = 'connected';
  };
  ws.onmessage = (msg) => {
    try {
      const parsed = WsEvent.safeParse(JSON.parse(String(msg.data)));
      if (parsed.success) realtime.applyEvent(parsed.data);
    } catch {
      /* mensaje no válido, se ignora */
    }
  };
  ws.onclose = () => {
    realtime.wsState = 'disconnected';
    socket = null;
    if (manualClose || subscribers === 0) return;
    scheduleReconnect();
  };
  ws.onerror = () => {
    ws.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5));
  attempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function disconnect() {
  manualClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
  useRealtimeStore().wsState = 'disconnected';
}

/** Mantiene el WebSocket de eventos abierto mientras exista al menos un componente suscrito. */
export function useEvents() {
  const auth = useAuthStore();
  const realtime = useRealtimeStore();

  onMounted(() => {
    subscribers += 1;
    connect();
  });
  onBeforeUnmount(() => {
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers === 0) disconnect();
  });

  // Si cambia el token (refresh/logout) se reconecta con el nuevo.
  watch(
    () => auth.accessToken,
    (token) => {
      if (!token) {
        disconnect();
        return;
      }
      if (socket) {
        manualClose = true;
        socket.close();
        socket = null;
      }
      connect();
    },
  );

  return { realtime, reconnect: () => { attempts = 0; disconnect(); connect(); } };
}
