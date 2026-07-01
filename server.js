require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads/consultations', express.static(path.join(__dirname, 'uploads', 'consultations')));

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'EZYMED Healthcare Platform' });
});

setupTelemedicineSockets(io);
app.set('io', io);

connectDB()
  .then(() => seedStaffAccounts())
  .then(() => seedExistingPatientConsents())
  .then(() => backfillPrescriptions())
  .then(() => {
    server.listen(PORT, () => {
      console.log(`EZYMED server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
