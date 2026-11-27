const { UnauthorizedError } = require('../../../shared/kernel/errors');

function handshakeToken(socket) {
  const authToken = socket.handshake?.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();
  const header = socket.handshake?.headers?.authorization;
  if (typeof header === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match) return match[1].trim();
  }
  return null;
}

class NotificationRealtimeGateway {
  constructor({ env, logger, authPort }) {
    this.enabled = env.NOTIFICATION_REALTIME_ENABLED === 'true';
    this.logger = logger;
    this.authPort = authPort;
    this.io = null;
  }

  attach(server) {
    if (!this.enabled || !server || this.io) return this.io;
    let socketIo;
    try {
      socketIo = require('socket.io');
    } catch {
      this.logger?.warn('Socket.IO is unavailable; realtime notifications are disabled.');
      this.enabled = false;
      return null;
    }

    this.io = socketIo.Server
      ? new socketIo.Server(server, { path: '/socket.io' })
      : socketIo(server);
    this.io.use(async (socket, next) => {
      try {
        const token = handshakeToken(socket);
        if (!token) throw new UnauthorizedError({ message: 'Socket authentication is required.' });
        const auth = await this.authPort.authenticateAccessToken(token);
        socket.data.cropsyAuth = auth;
        next();
      } catch (error) {
        next(new Error('unauthorized'));
      }
    });
    this.io.on('connection', (socket) => {
      const userId = socket.data.cropsyAuth?.user?.id;
      if (userId) socket.join(`user:${userId}`);
      const organizationId = socket.data.cropsyAuth?.organizationId;
      if (organizationId) socket.join(`organization:${organizationId}`);
    });
    return this.io;
  }

  emitToUser(userId, event, payload) {
    if (!this.io || !userId) return false;
    this.io.to(`user:${userId}`).emit(event, payload);
    return true;
  }

  async close() {
    if (!this.io) return;
    await new Promise((resolve) => this.io.close(resolve));
    this.io = null;
  }
}

module.exports = { NotificationRealtimeGateway };
