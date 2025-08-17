const express = require('express');
const Device = require('../models/Device');
const Children = require('../models/Children');
const { validate, deviceSchemas } = require('../middleware/validation');
const { authenticateToken, authenticateDevice, verifyChildAccess } = require('../middleware/auth');

const router = express.Router();

// GET /api/devices - Listar dispositivos do usuário
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { child_id, include_stats } = req.query;

    let devices;

    if (child_id) {
      // Verificar se filho pertence ao usuário
      const hasAccess = await Children.belongsToUser(child_id, userId);
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Acesso negado a este filho',
          code: 'CHILD_ACCESS_DENIED'
        });
      }

      devices = await Device.findByChildId(child_id);
    } else {
      // Buscar todos os dispositivos do usuário
      devices = await Device.getLastSyncByUser(userId);
    }

    // Adicionar estatísticas se solicitado
    if (include_stats === 'true') {
      for (let device of devices) {
        device.stats = await Device.getDeviceStats(device.id);
      }
    }

    res.json({
      devices,
      total: devices.length
    });
  } catch (error) {
    console.error('Erro ao listar dispositivos:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/devices/register - Registrar novo dispositivo (usado pelo APK)
router.post('/register', authenticateDevice, validate(deviceSchemas.register), async (req, res) => {
  try {
    const { child_id, tipo_dispositivo, uuid, modelo, versao_os, app_version } = req.body;

    // Verificar se o child_id existe
    const child = await Children.findById(child_id);
    if (!child) {
      return res.status(404).json({
        error: 'Filho não encontrado',
        code: 'CHILD_NOT_FOUND'
      });
    }

    // Registrar ou atualizar dispositivo
    const device = await Device.registerDevice({
      child_id,
      tipo_dispositivo,
      uuid,
      modelo,
      versao_os,
      app_version
    });

    res.status(201).json({
      message: 'Dispositivo registrado com sucesso',
      device: {
        id: device.id,
        child_id: device.child_id,
        tipo_dispositivo: device.tipo_dispositivo,
        status_online: device.status_online,
        ultimo_sync: device.ultimo_sync
      }
    });
  } catch (error) {
    console.error('Erro ao registrar dispositivo:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/devices/:deviceId/heartbeat - Heartbeat do dispositivo (manter online)
router.post('/:deviceId/heartbeat', authenticateDevice, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { app_version } = req.body;

    // Verificar se dispositivo existe
    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({
        error: 'Dispositivo não encontrado',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    // Atualizar status e sync
    await Device.updateOnlineStatus(deviceId, true);

    // Atualizar versão do app se fornecida
    if (app_version) {
      await Device.updateAppInfo(deviceId, app_version);
    }

    res.json({
      message: 'Heartbeat recebido',
      timestamp: new Date(),
      device_id: deviceId,
      status: 'online'
    });
  } catch (error) {
    console.error('Erro no heartbeat:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/devices/:deviceId - Buscar dispositivo específico
router.get('/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;

    // Verificar se dispositivo pertence ao usuário
    const hasAccess = await Device.belongsToUser(deviceId, userId);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a este dispositivo',
        code: 'DEVICE_ACCESS_DENIED'
      });
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({
        error: 'Dispositivo não encontrado',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    // Buscar estatísticas
    const stats = await Device.getDeviceStats(deviceId);

    res.json({
      device: {
        ...device,
        stats
      }
    });
  } catch (error) {
    console.error('Erro ao buscar dispositivo:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// PUT /api/devices/:deviceId/status - Atualizar status do dispositivo
router.put('/:deviceId/status', authenticateToken, validate(deviceSchemas.updateStatus), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { status_online } = req.body;
    const userId = req.user.id;

    // Verificar acesso
    const hasAccess = await Device.belongsToUser(deviceId, userId);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a este dispositivo',
        code: 'DEVICE_ACCESS_DENIED'
      });
    }

    const updatedDevice = await Device.updateOnlineStatus(deviceId, status_online);

    res.json({
      message: 'Status atualizado com sucesso',
      device: updatedDevice
    });
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// DELETE /api/devices/:deviceId - Remover dispositivo
router.delete('/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;

    // Verificar acesso
    const hasAccess = await Device.belongsToUser(deviceId, userId);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a este dispositivo',
        code: 'DEVICE_ACCESS_DENIED'
      });
    }

    const deleted = await Device.deleteById(deviceId);

    if (!deleted) {
      return res.status(404).json({
        error: 'Dispositivo não encontrado',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    res.json({
      message: 'Dispositivo removido com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar dispositivo:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/devices/offline/check - Verificar dispositivos offline
router.get('/offline/check', authenticateToken, async (req, res) => {
  try {
    const { minutes = 10 } = req.query;
    
    const offlineDevices = await Device.findOfflineDevices(parseInt(minutes));
    
    // Filtrar apenas dispositivos do usuário atual
    const userOfflineDevices = offlineDevices.filter(device => device.user_id === req.user.id);

    res.json({
      offline_devices: userOfflineDevices,
      total: userOfflineDevices.length,
      threshold_minutes: parseInt(minutes)
    });
  } catch (error) {
    console.error('Erro ao verificar dispositivos offline:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;