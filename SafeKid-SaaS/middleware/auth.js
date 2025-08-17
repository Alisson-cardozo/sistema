const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware para verificar token JWT
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Token de acesso requerido',
        code: 'TOKEN_REQUIRED' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar se usuário ainda existe
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ 
        error: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND' 
      });
    }

    // Adicionar informações do usuário à requisição
    req.user = {
      id: user.id,
      email: user.email,
      nome: user.nome,
      plano_assinatura: user.plano_assinatura
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Token inválido',
        code: 'INVALID_TOKEN' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expirado',
        code: 'TOKEN_EXPIRED' 
      });
    }

    console.error('Erro na autenticação:', error);
    return res.status(500).json({ 
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR' 
    });
  }
};

// Middleware para verificar plano de assinatura
const requirePlan = (requiredPlan) => {
  return (req, res, next) => {
    const userPlan = req.user.plano_assinatura;
    
    if (requiredPlan === 'premium' && userPlan !== 'premium') {
      return res.status(403).json({
        error: 'Plano premium requerido para esta funcionalidade',
        code: 'PREMIUM_REQUIRED',
        current_plan: userPlan,
        required_plan: requiredPlan
      });
    }

    next();
  };
};

// Middleware para verificar se o usuário pode acessar dados de um filho
const verifyChildAccess = async (req, res, next) => {
  try {
    const childId = req.params.childId || req.query.child_id || req.body.child_id;
    
    if (!childId) {
      return res.status(400).json({
        error: 'ID do filho é requerido',
        code: 'CHILD_ID_REQUIRED'
      });
    }

    const Children = require('../models/Children');
    const hasAccess = await Children.belongsToUser(childId, req.user.id);

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a este filho',
        code: 'CHILD_ACCESS_DENIED'
      });
    }

    req.childId = childId;
    next();
  } catch (error) {
    console.error('Erro ao verificar acesso ao filho:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Middleware para verificar se o usuário pode acessar dados de um dispositivo
const verifyDeviceAccess = async (req, res, next) => {
  try {
    const deviceId = req.params.deviceId || req.query.device_id || req.body.device_id;
    
    if (!deviceId) {
      return res.status(400).json({
        error: 'ID do dispositivo é requerido',
        code: 'DEVICE_ID_REQUIRED'
      });
    }

    const Device = require('../models/Device');
    const hasAccess = await Device.belongsToUser(deviceId, req.user.id);

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a este dispositivo',
        code: 'DEVICE_ACCESS_DENIED'
      });
    }

    req.deviceId = deviceId;
    next();
  } catch (error) {
    console.error('Erro ao verificar acesso ao dispositivo:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Middleware para autenticação de dispositivos (APK)
const authenticateDevice = async (req, res, next) => {
  try {
    const deviceUUID = req.headers['x-device-uuid'];
    const deviceSecret = req.headers['x-device-secret'];

    if (!deviceUUID || !deviceSecret) {
      return res.status(401).json({
        error: 'Credenciais do dispositivo requeridas',
        code: 'DEVICE_CREDENTIALS_REQUIRED'
      });
    }

    const Device = require('../models/Device');
    const device = await Device.findByUUID(deviceUUID);

    if (!device) {
      return res.status(401).json({
        error: 'Dispositivo não encontrado',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    // Verificar secret do dispositivo (aqui você pode implementar uma validação mais complexa)
    const expectedSecret = require('crypto')
      .createHash('sha256')
      .update(deviceUUID + process.env.ENCRYPTION_KEY)
      .digest('hex');

    if (deviceSecret !== expectedSecret) {
      return res.status(401).json({
        error: 'Secret do dispositivo inválido',
        code: 'INVALID_DEVICE_SECRET'
      });
    }

    // Atualizar último sync
    await Device.updateOnlineStatus(device.id, true);

    req.device = device;
    next();
  } catch (error) {
    console.error('Erro na autenticação do dispositivo:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
};

module.exports = {
  authenticateToken,
  requirePlan,
  verifyChildAccess,
  verifyDeviceAccess,
  authenticateDevice
};