const express = require('express');
const Message = require('../models/Message');
const Alert = require('../models/Alert');
const { validate, messageSchemas, querySchemas } = require('../middleware/validation');
const { authenticateToken, authenticateDevice, verifyDeviceAccess } = require('../middleware/auth');

const router = express.Router();

// Palavras-chave suspeitas padrão
const SUSPICIOUS_KEYWORDS = [
  'bullying', 'suicídio', 'drogas', 'álcool', 'festa', 'fugir de casa',
  'não conte para meus pais', 'encontro secreto', 'dinheiro emprestado'
];

// GET /api/messages - Buscar mensagens (para pais)
router.get('/', authenticateToken, validate(querySchemas.pagination, 'query'), async (req, res) => {
  try {
    const { child_id, device_id, tipo_app, contato, flagged, is_grupo, days = 7 } = req.query;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    if (!device_id) {
      return res.status(400).json({
        error: 'device_id é obrigatório',
        code: 'DEVICE_ID_REQUIRED'
      });
    }

    // Verificar acesso ao dispositivo
    const Device = require('../models/Device');
    const hasAccess = await Device.belongsToUser(device_id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a este dispositivo',
        code: 'DEVICE_ACCESS_DENIED'
      });
    }

    // Definir período
    const start_date = new Date();
    start_date.setDate(start_date.getDate() - parseInt(days));

    const options = {
      limit: parseInt(limit),
      offset,
      tipo_app,
      contato,
      flagged: flagged === 'true' ? true : flagged === 'false' ? false : undefined,
      is_grupo: is_grupo === 'true' ? true : is_grupo === 'false' ? false : undefined,
      start_date
    };

    const messages = await Message.findByDeviceId(device_id, options);
    const stats = await Message.getMessageStats(device_id, parseInt(days));

    res.json({
      messages,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: messages.length
      }
    });
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/messages/conversations - Buscar conversas agrupadas
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const { device_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    if (!device_id) {
      return res.status(400).json({
        error: 'device_id é obrigatório',
        code: 'DEVICE_ID_REQUIRED'
      });
    }

    // Verificar acesso
    const Device = require('../models/Device');
    const hasAccess = await Device.belongsToUser(device_id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a este dispositivo',
        code: 'DEVICE_ACCESS_DENIED'
      });
    }

    const conversations = await Message.findConversations(device_id, {
      limit: parseInt(limit),
      offset
    });

    res.json({
      conversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar conversas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/messages/conversation/:contato - Buscar mensagens de uma conversa
router.get('/conversation/:contato', authenticateToken, async (req, res) => {
  try {
    const { contato } = req.params;
    const { device_id, tipo_app, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    if (!device_id || !tipo_app) {
      return res.status(400).json({
        error: 'device_id e tipo_app são obrigatórios',
        code: 'MISSING_PARAMETERS'
      });
    }

    // Verificar acesso
    const Device = require('../models/Device');
    const hasAccess = await Device.belongsToUser(device_id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a este dispositivo',
        code: 'DEVICE_ACCESS_DENIED'
      });
    }

    const messages = await Message.findConversationMessages(device_id, contato, tipo_app, {
      limit: parseInt(limit),
      offset
    });

    res.json({
      messages,
      contato,
      tipo_app,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar conversa:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/messages/flagged - Buscar mensagens flagged
router.get('/flagged', authenticateToken, async (req, res) => {
  try {
    const { device_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    if (!device_id) {
      return res.status(400).json({
        error: 'device_id é obrigatório',
        code: 'DEVICE_ID_REQUIRED'
      });
    }

    // Verificar acesso
    const Device = require('../models/Device');
    const hasAccess = await Device.belongsToUser(device_id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a este dispositivo',
        code: 'DEVICE_ACCESS_DENIED'
      });
    }

    const flaggedMessages = await Message.findFlaggedMessages(device_id, {
      limit: parseInt(limit),
      offset
    });

    res.json({
      flagged_messages: flaggedMessages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar mensagens flagged:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/messages - Criar mensagem individual (APK)
router.post('/', authenticateDevice, validate(messageSchemas.create), async (req, res) => {
  try {
    const messageData = req.body;
    
    // Verificar se device_id corresponde ao dispositivo autenticado
    if (messageData.device_id !== req.device.id) {
      return res.status(403).json({
        error: 'Device ID não corresponde ao dispositivo autenticado',
        code: 'DEVICE_MISMATCH'
      });
    }

    const message = await Message.createMessage(messageData);

    // Verificar palavras-chave suspeitas
    await checkSuspiciousKeywords(message);

    res.status(201).json({
      message: 'Mensagem registrada com sucesso',
      message_id: message.id
    });
  } catch (error) {
    console.error('Erro ao criar mensagem:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/messages/bulk - Criar múltiplas mensagens (APK)
router.post('/bulk', authenticateDevice, validate(messageSchemas.bulk_create), async (req, res) => {
  try {
    const messagesData = req.body;
    
    // Verificar se todos os device_ids correspondem ao dispositivo autenticado
    const invalidMessages = messagesData.filter(msg => msg.device_id !== req.device.id);
    if (invalidMessages.length > 0) {
      return res.status(403).json({
        error: 'Algumas mensagens têm device_id inválido',
        code: 'DEVICE_MISMATCH'
      });
    }

    const messages = await Message.createBulkMessages(messagesData);

    // Verificar palavras-chave suspeitas em todas as mensagens
    for (const message of messages) {
      await checkSuspiciousKeywords(message);
    }

    res.status(201).json({
      message: 'Mensagens registradas com sucesso',
      total_created: messages.length
    });
  } catch (error) {
    console.error('Erro ao criar mensagens em lote:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// PUT /api/messages/:messageId/flag - Marcar/desmarcar mensagem
router.put('/:messageId/flag', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { flagged = true } = req.body;

    // Verificar se mensagem existe e usuário tem acesso
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        error: 'Mensagem não encontrada',
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    const Device = require('../models/Device');
    const hasAccess = await Device.belongsToUser(message.device_id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a esta mensagem',
        code: 'MESSAGE_ACCESS_DENIED'
      });
    }

    await Message.flagMessage(messageId, flagged);

    res.json({
      message: `Mensagem ${flagged ? 'marcada' : 'desmarcada'} com sucesso`
    });
  } catch (error) {
    console.error('Erro ao marcar mensagem:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/messages/stats/:deviceId - Estatísticas de mensagens
router.get('/stats/:deviceId', authenticateToken, verifyDeviceAccess, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { days = 7 } = req.query;

    const stats = await Message.getMessageStats(deviceId, parseInt(days));

    res.json({
      stats,
      period_days: parseInt(days)
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Função auxiliar para verificar palavras-chave suspeitas
async function checkSuspiciousKeywords(message) {
  try {
    const suspiciousWords = SUSPICIOUS_KEYWORDS.filter(keyword => 
      message.mensagem.toLowerCase().includes(keyword.toLowerCase())
    );

    if (suspiciousWords.length > 0) {
      // Buscar dados do dispositivo para obter user_id
      const Device = require('../models/Device');
      const Children = require('../models/Children');
      
      const device = await Device.findById(message.device_id);
      if (device) {
        const child = await Children.findById(device.child_id);
        if (child) {
          for (const keyword of suspiciousWords) {
            await Alert.createKeywordAlert(
              child.user_id,
              message.device_id,
              keyword,
              message.mensagem,
              message
            );
          }
        }
      }
    }
  } catch (error) {
    console.error('Erro ao verificar palavras-chave:', error);
  }
}

module.exports = router;