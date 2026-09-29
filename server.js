require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { validateSecretsOnStartup } = require('./config/secrets');
const { getAllowedOrigins } = require('./config/app');
const { createApp } = require('./app');
const connectDB = require('./config/db');
const logger = require('./services/logger');
const { seedStaffAccounts } = require('./services/staffSeedService');
const { backfillPrescriptions } = require('./services/pharmacyService');
const { seedExistingPatientConsents } = require('./services/consentService');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patient');
const appointmentRoutes = require('./routes/appointments');
const symptomCheckerRoutes = require('./routes/symptomChecker');
const queueRoutes = require('./routes/queue');
const consultationRoutes = require('./routes/consultations');
const doctorRoutes = require('./routes/doctor');
const hospitalRoutes = require('./routes/hospital');
const pharmacyRoutes = require('./routes/pharmacy');
const satisfactionRoutes = require('./routes/satisfaction');
const securityRoutes = require('./routes/security');
const complianceRoutes = require('./routes/compliance');
const securityHeaders = require('./middleware/securityHeaders');
const { setupTelemedicineSockets } = require('./services/socketHandlers');

const app = createApp();
let server;
let io;

function startServer() {
  validateSecretsOnStartup();

  const PORT = process.env.PORT || 3000;
  server = http.createServer(app);
  io = new Server(server, {
    cors: { origin: getAllowedOrigins(), methods: ['GET', 'POST'] },
  });

  setupTelemedicineSockets(io);
  app.set('io', io);

  function shutdown(signal) {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      mongoose.connection.close(false).then(() => {
        logger.info('Shutdown complete');
        process.exit(0);
      }).catch(() => process.exit(1));
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  connectDB()
    .then(() => seedStaffAccounts())
    .then(() => seedExistingPatientConsents())
    .then(() => backfillPrescriptions())
    .then(() => {
      server.listen(PORT, () => {
        logger.info({ port: PORT, env: process.env.NODE_ENV }, 'EZYMED server started');
      });
    })
    .catch((err) => {
      logger.error({ err: err.message }, 'Failed to start server');
      process.exit(1);
    });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, server, startServer };
