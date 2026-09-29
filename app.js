const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { version } = require('./package.json');
const securityHeaders = require('./middleware/securityHeaders');
const requestLogger = require('./middleware/requestLogger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

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
const fileRoutes = require('./routes/files');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(requestLogger);
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api/auth', authRoutes);
  app.use('/api/patient', patientRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/symptom-checker', symptomCheckerRoutes);
  app.use('/api/queue', queueRoutes);
  app.use('/api/consultations', consultationRoutes);
  app.use('/api/doctor', doctorRoutes);
  app.use('/api/hospital', hospitalRoutes);
  app.use('/api/pharmacy', pharmacyRoutes);
  app.use('/api/satisfaction', satisfactionRoutes);
  app.use('/api/security', securityRoutes);
  app.use('/api/compliance', complianceRoutes);
  app.use('/api/files', fileRoutes);

  app.get('/api/health', (_req, res) => {
    const mongoState = mongoose.connection.readyState;
    const mongoReady = mongoState === 1;
    const payload = {
      status: mongoReady ? 'ok' : 'degraded',
      service: 'EZYMED Healthcare Platform',
      version,
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      checks: {
        mongodb: mongoReady ? 'up' : ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoState] || 'unknown',
      },
    };

    res.status(mongoReady ? 200 : 503).json(payload);
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
