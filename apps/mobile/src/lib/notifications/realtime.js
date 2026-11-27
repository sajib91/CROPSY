import { io } from 'socket.io-client';

/**
 * Socket.IO client for backend-owned realtime notification delivery. The
 * client only renders events; eligibility, preference filtering, and
 * authorization are decided by the API before an event is emitted.
 */
export function createRealtimeClient({ socketUrl, getToken, onNotification, onEvent }) {
  let socket = null;

  function connect() {
    if (socket?.connected || !socketUrl) return socket;
    if (socket) {
      socket.auth = { token: getToken?.() };
      socket.connect();
      return socket;
    }

    socket = io(socketUrl, {
      path: '/socket.io',
      auth: { token: getToken?.() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 10000,
      autoConnect: true,
    });

    socket.on('notification', (payload) => {
      onNotification?.(payload);
      onEvent?.('notification', payload);
    });
    socket.on('notification.read', (payload) => onEvent?.('notification.read', payload));
    socket.on('notification.read-all', (payload) => onEvent?.('notification.read-all', payload));
    socket.on('connect', () => {
      socket.auth = { token: getToken?.() };
    });
    socket.on('connect_error', (error) => {
      if (error?.message === 'unauthorized') {
        socket.auth = { token: getToken?.() };
      }
    });

    return socket;
  }

  function updateToken(token) {
    if (!socket) return;
    socket.auth = { token };
  }

  function disconnect() {
    if (!socket) return;
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  return {
    connect,
    disconnect,
    updateToken,
    isConnected: () => Boolean(socket?.connected),
  };
}
