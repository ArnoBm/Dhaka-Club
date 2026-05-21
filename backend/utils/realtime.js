const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

let io = null;

function setupRealtime(server, corsOptions = {}) {
    io = new Server(server, {
        cors: corsOptions,
    });

    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (!token) {
            return next(new Error('Authentication token is missing.'));
        }

        try {
            socket.user = jwt.verify(token, process.env.JWT_SECRET);
            return next();
        } catch (error) {
            return next(new Error('Authentication token is invalid.'));
        }
    });

    io.on('connection', (socket) => {
        if (socket.user?.type === 'member') {
            socket.join(`member:${socket.user.id}`);
            socket.join('members');
        } else {
            socket.join('admins');
        }
    });

    return io;
}

function emitToMember(memberId, eventName, payload = {}) {
    if (!io || !memberId) {
        return;
    }

    io.to(`member:${memberId}`).emit(eventName, payload);
}

function emitToAdmins(eventName, payload = {}) {
    if (!io) {
        return;
    }

    io.to('admins').emit(eventName, payload);
}

module.exports = {
    setupRealtime,
    emitToMember,
    emitToAdmins,
};
