const express = require('express');
const Alert = require('../models/Alert');
const { validate, alertSchemas, querySchemas } = require('../middleware/validation');
const { authenticateToken, requirePlan } = require('../middleware/auth');

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// GET /api/alerts - Buscar alertas do usuário
router.get('/', validate(querySchemas.pagination, 'query'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      tipo_alerta, 
      prioridade, 
      lido, 
      days = 30,
      page = 1, 
      limit = 50 
    } = req.query;
    const offset = (page - 1) * limit;

    // Definir período se days foi fornecido
    let start_date, end_date;
    if (days) {
      start_date = new Date();
      start_date.setDate(start_date.getDate() - parseInt(days));
    }

    const options = {
      limit: parseInt(limit),
      offset,
      tipo_alerta,
      prioridade,
      lido: lido === 'true' ? true : lido === 'false' ? false : undefined,
      start_date,
      end_date
    };

    const alerts = await Alert.findByUserId(userId, options);
    const unreadCount = await Alert.countUnreadAlerts(userId);

    res.json({
      alerts,
      unread_count: unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: alerts.length
      }
    });
  } catch (error) {
    console.error('Erro ao buscar alertas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/alerts/unread - Buscar alertas não lidos
router.get('/unread', async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20 } = req.query;

    const unreadAlerts = await Alert.findUnreadAlerts(userId, parseInt(limit));
    const totalUnread = await Alert.countUnreadAlerts(userId);

    res.json({
      unread_alerts: unreadAlerts,
      total_unread: totalUnread
    });
  } catch (error) {
    console.error('Erro ao buscar alertas não lidos:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/alerts/critical - Buscar alertas críticos recentes
router.get('/critical', async (req, res) => {
  try {
    const userId = req.user.id;
    const { hours = 24 } = req.query;

    const criticalAlerts = await Alert.findRecentCriticalAlerts(userId, parseInt(hours));

    res.json({
      critical_alerts: criticalAlerts,
      hours: parseInt(hours)
    });
  } catch (error) {
    console.error('Erro ao buscar alertas críticos:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/alerts/by-priority/:prioridade - Buscar alertas por prioridade
router.get('/by-priority/:prioridade', async (req, res) => {
  try {
    const { prioridade } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Validar prioridade
    const validPriorities = ['baixa', 'media', 'alta', 'critica'];
    if (!validPriorities.includes(prioridade)) {
      return res.status(400).json({
        error: 'Prioridade inválida',
        code: 'INVALID_PRIORITY',
        valid_priorities: validPriorities
      });
    }

    const alerts = await Alert.findByPriority(userId, prioridade, {
      limit: parseInt(limit),
      offset
    });

    res.json({
      alerts,
      prioridade,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar alertas por prioridade:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/alerts/by-device/:deviceId - Buscar alertas por dispositivo
router.get('/by-device/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Verificar se dispositivo pertence ao usuário
    const Device = require('../models/Device');
    const hasAccess = await Device.belongsToUser(deviceId, userId);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a este dispositivo',
        code: 'DEVICE_ACCESS_DENIED'
      });
    }

    const alerts = await Alert.findByDeviceId(deviceId, {
      limit: parseInt(limit),
      offset
    });

    res.json({
      alerts,
      device_id: deviceId,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar alertas por dispositivo:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/alerts/stats - Estatísticas de alertas
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 7 } = req.query;

    const stats = await Alert.getAlertStats(userId, parseInt(days));

    res.json({
      stats,
      period_days: parseInt(days)
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas de alertas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/alerts/:alertId - Buscar alerta específico
router.get('/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;
    const userId = req.user.id;

    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({
        error: 'Alerta não encontrado',
        code: 'ALERT_NOT_FOUND'
      });
    }

    // Verificar se alerta pertence ao usuário
    if (alert.user_id !== userId) {
      return res.status(403).json({
        error: 'Acesso negado a este alerta',
        code: 'ALERT_ACCESS_DENIED'
      });
    }

    res.json({ alert });
  } catch (error) {
    console.error('Erro ao buscar alerta:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/alerts - Criar alerta manual
router.post('/', validate(alertSchemas.create), async (req, res) => {
  try {
    const alertData = req.body;
    const userId = req.user.id;

    // Verificar se user_id corresponde ao usuário autenticado
    if (alertData.user_id !== userId) {
      return res.status(403).json({
        error: 'Não é possível criar alerta para outro usuário',
        code: 'USER_MISMATCH'
      });
    }

    // Se device_id foi fornecido, verificar acesso
    if (alertData.device_id) {
      const Device = require('../models/Device');
      const hasAccess = await Device.belongsToUser(alertData.device_id, userId);
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Acesso negado a este dispositivo',
          code: 'DEVICE_ACCESS_DENIED'
        });
      }
    }

    const alert = await Alert.createAlert(alertData);

    res.status(201).json({
      message: 'Alerta criado com sucesso',
      alert
    });
  } catch (error) {
    console.error('Erro ao criar alerta:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// PUT /api/alerts/mark-read - Marcar alertas como lidos
router.put('/mark-read', validate(alertSchemas.markAsRead), async (req, res) => {
  try {
    const { alert_ids } = req.body;
    const userId = req.user.id;

    const updatedCount = await Alert.markAsRead(alert_ids, userId);

    res.json({
      message: 'Alertas marcados como lidos',
      updated_count: updatedCount
    });
  } catch (error) {
    console.error('Erro ao marcar alertas como lidos:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// PUT /api/alerts/mark-all-read - Marcar todos como lidos
router.put('/mark-all-read', async (req, res) => {
  try {
    const userId = req.user.id;

    const updatedCount = await Alert.markAllAsRead(userId);

    res.json({
      message: 'Todos os alertas marcados como lidos',
      updated_count: updatedCount
    });
  } catch (error) {
    console.error('Erro ao marcar todos como lidos:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// PUT /api/alerts/:alertId/read - Marcar alerta específico como lido
router.put('/:alertId/read', async (req, res) => {
  try {
    const { alertId } = req.params;
    const userId = req.user.id;

    // Verificar se alerta existe e pertence ao usuário
    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({
        error: 'Alerta não encontrado',
        code: 'ALERT_NOT_FOUND'
      });
    }

    if (alert.user_id !== userId) {
      return res.status(403).json({
        error: 'Acesso negado a este alerta',
        code: 'ALERT_ACCESS_DENIED'
      });
    }

    await Alert.markAsRead([alertId], userId);

    res.json({
      message: 'Alerta marcado como lido'
    });
  } catch (error) {
    console.error('Erro ao marcar alerta como lido:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// DELETE /api/alerts/:alertId - Deletar alerta
router.delete('/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;
    const userId = req.user.id;

    // Verificar se alerta existe e pertence ao usuário
    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({
        error: 'Alerta não encontrado',
        code: 'ALERT_NOT_FOUND'
      });
    }

    if (alert.user_id !== userId) {
      return res.status(403).json({
        error: 'Acesso negado a este alerta',
        code: 'ALERT_ACCESS_DENIED'
      });
    }

    await Alert.deleteById(alertId);

    res.json({
      message: 'Alerta deletado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar alerta:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/alerts/test - Criar alerta de teste (apenas premium)
router.post('/test', requirePlan('premium'), async (req, res) => {
  try {
    const userId = req.user.id;

    const testAlert = await Alert.createAlert({
      user_id: userId,
      device_id: null,
      tipo_alerta: 'palavra_chave',
      prioridade: 'media',
      titulo: 'Alerta de Teste',
      descricao: 'Este é um alerta de teste para verificar se o sistema está funcionando corretamente.',
      dados_extras: {
        test: true,
        created_by: 'user_request'
      }
    });

    res.status(201).json({
      message: 'Alerta de teste criado com sucesso',
      alert: testAlert
    });
  } catch (error) {
    console.error('Erro ao criar alerta de teste:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/alerts/export - Exportar alertas (CSV)
router.get('/export', async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30, format = 'csv' } = req.query;

    if (format !== 'csv') {
      return res.status(400).json({
        error: 'Formato não suportado. Use: csv',
        code: 'UNSUPPORTED_FORMAT'
      });
    }

    const start_date = new Date();
    start_date.setDate(start_date.getDate() - parseInt(days));

    const alerts = await Alert.findByUserId(userId, {
      start_date,
      limit: 10000 // Limite alto para exportação
    });

    // Gerar CSV
    const csvHeader = 'Data,Tipo,Prioridade,Título,Descrição,Lido,Device ID\n';
    const csvRows = alerts.map(alert => {
      const date = new Date(alert.data_hora).toLocaleString('pt-BR');
      const description = alert.descricao.replace(/"/g, '""'); // Escape quotes
      return `"${date}","${alert.tipo_alerta}","${alert.prioridade}","${alert.titulo}","${description}","${alert.lido ? 'Sim' : 'Não'}","${alert.device_id || ''}"`;
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="alertas_${days}dias.csv"`);
    res.send('\ufeff' + csvContent); // BOM para UTF-8
  } catch (error) {
    console.error('Erro ao exportar alertas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/alerts/summary - Resumo de alertas por período
router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 7 } = req.query;

    const stats = await Alert.getAlertStats(userId, parseInt(days));

    // Calcular tendências (comparar com período anterior)
    const previousPeriodStats = await Alert.getAlertStats(userId, parseInt(days) * 2);
    
    const currentTotal = stats.total_alerts;
    const previousTotal = previousPeriodStats.total_alerts - currentTotal;
    const trend = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal * 100) : 0;

    res.json({
      summary: {
        period_days: parseInt(days),
        total_alerts: currentTotal,
        unread_alerts: stats.unread_alerts,
        critical_alerts: stats.critical_alerts,
        trend_percentage: Math.round(trend * 100) / 100,
        by_type: {
          message_alerts: stats.message_alerts,
          call_alerts: stats.call_alerts,
          location_alerts: stats.location_alerts,
          media_alerts: stats.media_alerts
        },
        by_priority: {
          critical: stats.critical_alerts,
          high: stats.high_alerts,
          medium: stats.medium_alerts,
          low: stats.low_alerts
        },
        notifications: {
          email_sent: stats.email_sent,
          push_sent: stats.push_sent
        }
      }
    });
  } catch (error) {
    console.error('Erro ao gerar resumo:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;