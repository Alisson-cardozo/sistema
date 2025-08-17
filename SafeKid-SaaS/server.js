const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de segurança
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Muitas requisições deste IP, tente novamente mais tarde.'
});
app.use('/api/', limiter);

// Middleware de parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined'));

// Importar rotas
const authRoutes = require('./routes/auth');
const childrenRoutes = require('./routes/children');
const devicesRoutes = require('./routes/devices');
const messagesRoutes = require('./routes/messages');
const callsRoutes = require('./routes/calls');
const locationsRoutes = require('./routes/locations');
const mediaRoutes = require('./routes/media');
const alertsRoutes = require('./routes/alerts');

// Usar rotas
app.use('/api/auth', authRoutes);
app.use('/api/children', childrenRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/alerts', alertsRoutes);

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'SafeKid API está funcionando!',
    timestamp: new Date().toISOString()
  });
});

// Middleware de erro global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Algo deu errado!', 
    message: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno do servidor'
  });
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Inicializar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor SafeKid rodando na porta ${PORT}`);
  console.log(`📍 Ambiente: ${process.env.NODE_ENV}`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
});

module.exports = app;