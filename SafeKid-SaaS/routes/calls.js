const express = require('express');
const Call = require('../models/Call');
const Alert = require('../models/Alert');
const { validate, callSchemas, querySchemas } = require('../middleware/validation');
const { authenticateToken, authenticateDevice, verifyDeviceAccess } = require('../middleware/auth');

const router = express.Router();

// GET /api/calls - Buscar chamadas (para pais)
router.get('/', authenticateToken, validate(querySchemas.pagination, 'query'), async (req, res) => {
  try {
    const { device_id, tipo_chamada, direcao, flagged, days = 7 } = req.query;
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
      tipo_chamada,
      direcao,
      flagged: flagged === 'true' ? true : flagged === 'false' ? false : undefined,
      start_date
    };

    const calls = await Call.findByDeviceId(device_id, options);
    const stats = await Call.getCallStats(device_id, parseInt(days));

    res.json({
      calls,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: calls.length
      }
    });
  } catch (error) {
    console.error('Erro ao buscar chamadas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/calls/suspicious - Buscar chamadas suspeitas
router.get('/suspicious', authenticateToken, async (req, res) => {
  try {
    const { device_id, min_duration = 300, late_hour_start = 23, early_hour_end = 6 } = req.query;

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

    const suspiciousCalls = await Call.findSuspiciousCalls(device_id, {
      min_duration: parseInt(min_duration),
      late_hour_start: parseInt(late_hour_start),
      early_hour_end: parseInt(early_hour_end)
    });

    res.json({
      suspicious_calls: suspiciousCalls,
      criteria: {
        min_duration: parseInt(min_duration),
        late_hour_start: parseInt(late_hour_start),
        early_hour_end: parseInt(early_hour_end)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar chamadas suspeitas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/calls/top-contacts - Top contatos mais chamados
router.get('/top-contacts', authenticateToken, async (req, res) => {
  try {
    const { device_id, days = 30, limit = 10 } = req.query;

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

    const topContacts = await Call.getTopContacts(device_id, parseInt(days), parseInt(limit));

    res.json({
      top_contacts: topContacts,
      period_days: parseInt(days)
    });
  } catch (error) {
    console.error('Erro ao buscar top contatos:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/calls/contact/:numero - Buscar chamadas por contato
router.get('/contact/:numero', authenticateToken, async (req, res) => {
  try {
    const { numero } = req.params;
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

    const calls = await Call.findByContact(device_id, numero, {
      limit: parseInt(limit),
      offset
    });

    res.json({
      calls,
      contact_number: numero,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar chamadas por contato:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/calls/flagged - Buscar chamadas flagged
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

    const flaggedCalls = await Call.findFlaggedCalls(device_id, {
      limit: parseInt(limit),
      offset
    });

    res.json({
      flagged_calls: flaggedCalls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar chamadas flagged:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/calls - Criar chamada individual (APK)
router.post('/', authenticateDevice, validate(callSchemas.create), async (req, res) => {
  try {
    const callData = req.body;
    
    // Verificar se device_id corresponde ao dispositivo autenticado
    if (callData.device_id !== req.device.id) {
      return res.status(403).json({
        error: 'Device ID não corresponde ao dispositivo autenticado',
        code: 'DEVICE_MISMATCH'
      });
    }

    const call = await Call.createCall(callData);

    // Verificar se chamada é suspeita
    await checkSuspiciousCall(call);

    res.status(201).json({
      message: 'Chamada registrada com sucesso',
      call_id: call.id
    });
  } catch (error) {
    console.error('Erro ao criar chamada:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/calls/bulk - Criar múltiplas chamadas (APK)
router.post('/bulk', authenticateDevice, validate(callSchemas.bulk_create), async (req, res) => {
  try {
    const callsData = req.body;
    
    // Verificar se todos os device_ids correspondem ao dispositivo autenticado
    const invalidCalls = callsData.filter(call => call.device_id !== req.device.id);
    if (invalidCalls.length > 0) {
      return res.status(403).json({
        error: 'Algumas chamadas têm device_id inválido',
        code: 'DEVICE_MISMATCH'
      });
    }

    const calls = await Call.createBulkCalls(callsData);

    // Verificar chamadas suspeitas
    for (const call of calls) {
      await checkSuspiciousCall(call);
    }

    res.status(201).json({
      message: 'Chamadas registradas com sucesso',
      total_created: calls.length
    });
  } catch (error) {
    console.error('Erro ao criar chamadas em lote:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// PUT /api/calls/:callId/flag - Marcar/desmarcar chamada
router.put('/:callId/flag', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const { flagged = true } = req.body;

    // Verificar se chamada existe e usuário tem acesso
    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({
        error: 'Chamada não encontrada',
        code: 'CALL_NOT_FOUND'
      });
    }

    const Device = require('../models/Device');
    const hasAccess = await Device.belongsToUser(call.device_id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a esta chamada',
        code: 'CALL_ACCESS_DENIED'
      });
    }

    await Call.flagCall(callId, flagged);

    res.json({
      message: `Chamada ${flagged ? 'marcada' : 'desmarcada'} com sucesso`
    });
  } catch (error) {
    console.error('Erro ao marcar chamada:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/calls/stats/:deviceId - Estatísticas de chamadas
router.get('/stats/:deviceId', authenticateToken, verifyDeviceAccess, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { days = 7 } = req.query;

    const stats = await Call.getCallStats(deviceId, parseInt(days));

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

// Função auxiliar para verificar chamadas suspeitas
async function checkSuspiciousCall(call) {
  try {
    const callHour = new Date(call.data_hora).getHours();
    const isLateNight = callHour >= 23 || callHour <= 6;
    const isLongCall = call.duracao > 1800; // mais de 30 minutos
    const isUnknownNumber = !call.contato_nome;

    let shouldAlert = false;
    let alertReason = '';

    if (isLateNight) {
      shouldAlert = true;
      alertReason = 'Chamada em horário suspeito (tarde da noite/madrugada)';
    } else if (isLongCall) {
      shouldAlert = true;
      alertReason = 'Chamada muito longa (mais de 30 minutos)';
    } else if (isUnknownNumber && call.duracao > 300) {
      shouldAlert = true;
      alertReason = 'Chamada longa para número desconhecido';
    }

    if (shouldAlert) {
      // Buscar dados do dispositivo para obter user_id
      const Device = require('../models/Device');
      const Children = require('../models/Children');
      
      const device = await Device.findById(call.device_id);
      if (device) {
        const child = await Children.findById(device.child_id);
        if (child) {
          await Alert.createAlert({
            user_id: child.user_id,
            device_id: call.device_id,
            tipo_alerta: 'chamada_suspeita',
            prioridade: isLateNight ? 'alta' : 'media',
            titulo: 'Chamada suspeita detectada',
            descricao: `${alertReason}. Número: ${call.numero}, Duração: ${Math.round(call.duracao / 60)} minutos`,
            dados_extras: {
              call_id: call.id,
              numero: call.numero,
              duracao: call.duracao,
              tipo_chamada: call.tipo_chamada,
              hora: callHour,
              reason: alertReason
            }
          });
        }
      }
    }
  } catch (error) {
    console.error('Erro ao verificar chamada suspeita:', error);
  }
}

module.exports = router;