const jwt = require('jsonwebtoken');
const { verifySocketToken } = require('../middleware/doctorAuth');
const { getJwtSecret } = require('../config/secrets');
const {saveChatMessage,assertSocketConsultationAccess} = require('../services/telemedicineService');
const Consultation = require('../models/Consultation');

function setupTelemedicineSockets(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      if (socket.handshake.auth?.role === 'doctor') {
        socket.user = verifySocketToken(token);
      } else {
        const decoded = jwt.verify(token, getJwtSecret());
        socket.user = { role: 'patient', id: decoded.id, name: 'Patient' };
      }
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join-consultation', async ({ roomId }) => {
      try {
        const consultation = await Consultation.findOne({ roomId });
        if (!consultation) {
          socket.emit('error', { message: 'Consultation room not found' });
          return;
        }

        await assertSocketConsultationAccess(socket.user, consultation);

        socket.join(roomId);
        socket.consultationId = consultation._id;
        socket.roomId = roomId;

        socket.to(roomId).emit('peer-joined', {
          role: socket.user.role,
          name: socket.user.name,
        });
      } catch (err) {
        socket.emit('error', { message: err.message || 'Access denied' });
      }
    });

    socket.on('chat-message', async ({ roomId, content }) => {
      if (!content?.trim() || !roomId || !socket.rooms.has(roomId)) return;

      try {
        const consultation = await Consultation.findOne({ roomId });
        if (!consultation) return;

        await assertSocketConsultationAccess(socket.user, consultation);

        const message = await saveChatMessage(
          consultation._id,
          socket.user.role,
          socket.user.name,
          content.trim()
        );

        io.to(roomId).emit('chat-message', {
          _id: message._id,
          senderType: message.senderType,
          senderName: message.senderName,
          content: message.content,
          createdAt: message.createdAt,
        });
      } catch {
        /* ignore */
      }
    });

    socket.on('webrtc-offer', async ({ roomId, offer }) => {
      if (!roomId || !socket.rooms.has(roomId)) return;
      try {
        const consultation = await Consultation.findOne({ roomId });
        if (!consultation) return;
        await assertSocketConsultationAccess(socket.user, consultation);
        socket.to(roomId).emit('webrtc-offer', { offer, from: socket.user.role });
      } catch {
        /* ignore */
      }
    });

    socket.on('webrtc-answer', async ({ roomId, answer }) => {
      if (!roomId || !socket.rooms.has(roomId)) return;
      try {
        const consultation = await Consultation.findOne({ roomId });
        if (!consultation) return;
        await assertSocketConsultationAccess(socket.user, consultation);
        socket.to(roomId).emit('webrtc-answer', { answer, from: socket.user.role });
      } catch {
        /* ignore */
      }
    });

    socket.on('webrtc-ice-candidate', async ({ roomId, candidate }) => {
      if (!roomId || !socket.rooms.has(roomId)) return;
      try {
        const consultation = await Consultation.findOne({ roomId });
        if (!consultation) return;
        await assertSocketConsultationAccess(socket.user, consultation);
        socket.to(roomId).emit('webrtc-ice-candidate', { candidate, from: socket.user.role });
      } catch {
        /* ignore */
      }
    });

    socket.on('consultation-updated', ({ roomId, type, payload }) => {
      if (!roomId || !socket.rooms.has(roomId)) return;
      io.to(roomId).emit('consultation-updated', { type, payload });
    });

    socket.on('leave-consultation', ({ roomId }) => {
      socket.leave(roomId);
      socket.to(roomId).emit('peer-left', { role: socket.user.role });
    });

    socket.on('disconnect', () => {
      if (socket.roomId) {
        socket.to(socket.roomId).emit('peer-left', { role: socket.user.role });
      }
    });
  });
}

module.exports = { setupTelemedicineSockets };
