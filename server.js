require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const { seedStaffAccounts } = require('./services/staffSeedService');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patient');
const appointmentRoutes = require('./routes/appointments');
const symptomCheckerRoutes = require('./routes/symptomChecker');
const queueRoutes = require('./routes/queue');
const consultationRoutes = require('./routes/consultations');
const doctorRoutes = require('./routes/doctor');
const hospitalRoutes = require('./routes/hospital');
const satisfactionRoutes = require('./routes/satisfaction');
const { setupTelemedicineSockets } = require('./services/socketHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || 3000;

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
app.use('/api/satisfaction', satisfactionRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'EZYMED Healthcare Platform' });
});

setupTelemedicineSockets(io);
app.set('io', io);

connectDB()
  .then(() => seedStaffAccounts())
  .then(() => {
    server.listen(PORT, () => {
      console.log(`EZYMED server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
