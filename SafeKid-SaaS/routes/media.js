const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const Media = require('../models/Media');
const Alert = require('../models/Alert');
const { validate, mediaSchemas, querySchemas } = require('../middleware/validation');
const { authenticateToken, authenticateDevice, verifyDeviceAccess } = require('../middleware/auth');

const router = express.Router();

// Configuração do multer para upload de arquivos
const storage = multer.memoryStorage(); // Usar memória temporariamente
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB padrão
  },
  fileFilter: (req, file, cb) => {
    // Verificar tipos de arquivo permitidos
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|mp3|wav|m4a/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'));
    }
  }
});

// GET /api/media - Buscar mídias (para pais)
router.get('/', authenticateToken, validate(querySchemas.pagination, 'query'), async (req, res) => {
  try {
    const { device_id, tipo, origem, flagged, days = 7 } = req.query;
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
      tipo,
      origem,
      flagged: flagged === 'true' ? true : flagged === 'false' ? false : undefined,
      start_date
    };

    const media = await Media.findByDeviceId(device_id, options);
    const stats = await Media.getMediaStats(device_id, parseInt(days));

    res.json({
      media,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: media.length
      }
    });
  } catch (error) {
    console.error('Erro ao buscar mídias:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/media/recent - Buscar mídias recentes
router.get('/recent', authenticateToken, async (req, res) => {
  try {
    const { device_id, hours = 24, limit = 20 } = req.query;

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

    const recentMedia = await Media.findRecentMedia(device_id, parseInt(hours), parseInt(limit));

    res.json({
      recent_media: recentMedia,
      hours: parseInt(hours)
    });
  } catch (error) {
    console.error('Erro ao buscar mídias recentes:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/media/flagged - Buscar mídias flagged
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

    const flaggedMedia = await Media.findFlaggedMedia(device_id, {
      limit: parseInt(limit),
      offset
    });

    res.json({
      flagged_media: flaggedMedia,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar mídias flagged:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/media/by-origin/:origem - Buscar mídias por origem
router.get('/by-origin/:origem', authenticateToken, async (req, res) => {
  try {
    const { origem } = req.params;
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

    const mediaByOrigin = await Media.findByOrigin(device_id, origem, {
      limit: parseInt(limit),
      offset
    });

    res.json({
      media: mediaByOrigin,
      origem,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar mídias por origem:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/media/:mediaId - Buscar mídia específica
router.get('/:mediaId', authenticateToken, async (req, res) => {
  try {
    const { mediaId } = req.params;

    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({
        error: 'Mídia não encontrada',
        code: 'MEDIA_NOT_FOUND'
      });
    }

    // Verificar acesso
    const Device = require('../models/Device');
    const hasAccess = await Device.belongsToUser(media.device_id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a esta mídia',
        code: 'MEDIA_ACCESS_DENIED'
      });
    }

    res.json({ media });
  } catch (error) {
    console.error('Erro ao buscar mídia:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/media/:mediaId/download - Download de arquivo de mídia
router.get('/:mediaId/download', authenticateToken, async (req, res) => {
  try {
    const { mediaId } = req.params;

    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({
        error: 'Mídia não encontrada',
        code: 'MEDIA_NOT_FOUND'
      });
    }

    // Verificar acesso
    const Device = require('../models/Device');
    const hasAccess = await Device.belongsToUser(media.device_id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a esta mídia',
        code: 'MEDIA_ACCESS_DENIED'
      });
    }

    // Verificar se arquivo existe
    const fileExists = await Media.checkFileExists(mediaId);
    if (!fileExists) {
      return res.status(404).json({
        error: 'Arquivo não encontrado no servidor',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Enviar arquivo
    res.download(media.caminho_arquivo, media.nome_arquivo, (err) => {
      if (err) {
        console.error('Erro no download:', err);
        res.status(500).json({
          error: 'Erro ao baixar arquivo',
          code: 'DOWNLOAD_ERROR'
        });
      }
    });
  } catch (error) {
    console.error('Erro no download:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/media/upload - Upload de mídia (APK)
router.post('/upload', authenticateDevice, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Nenhum arquivo enviado',
        code: 'NO_FILE_UPLOADED'
      });
    }

    const { origem = 'camera', descricao, duracao, data_criacao } = req.body;
    const deviceId = req.device.id;

    const media = await Media.processFileUpload(req.file, deviceId, {
      origem,
      descricao,
      duracao: duracao ? parseInt(duracao) : null,
      data_criacao: data_criacao || new Date()
    });

    // Verificar se mídia é suspeita
    await checkSuspiciousMedia(media);

    res.status(201).json({
      message: 'Mídia enviada com sucesso',
      media_id: media.id,
      file_info: {
        size: req.file.size,
        type: media.tipo,
        mime_type: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/media - Criar registro de mídia (APK)
router.post('/', authenticateDevice, validate(mediaSchemas.create), async (req, res) => {
  try {
    const mediaData = req.body;
    
    // Verificar se device_id corresponde ao dispositivo autenticado
    if (mediaData.device_id !== req.device.id) {
      return res.status(403).json({
        error: 'Device ID não corresponde ao dispositivo autenticado',
        code: 'DEVICE_MISMATCH'
      });
    }

    const media = await Media.createMedia(mediaData);

    // Verificar se mídia é suspeita
    await checkSuspiciousMedia(media);

    res.status(201).json({
      message: 'Mídia registrada com sucesso',
      media_id: media.id
    });
  } catch (error) {
    console.error('Erro ao criar mídia:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// PUT /api/media/:mediaId/flag - Marcar/desmarcar mídia
router.put('/:mediaId/flag', authenticateToken, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { flagged = true } = req.body;

    // Verificar se mídia existe e usuário tem acesso
    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({
        error: 'Mídia não encontrada',
        code: 'MEDIA_NOT_FOUND'
      });
    }

    const Device = require('../models/Device');
    const hasAccess = await Device.belongsToUser(media.device_id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a esta mídia',
        code: 'MEDIA_ACCESS_DENIED'
      });
    }

    await Media.flagMedia(mediaId, flagged);

    res.json({
      message: `Mídia ${flagged ? 'marcada' : 'desmarcada'} com sucesso`
    });
  } catch (error) {
    console.error('Erro ao marcar mídia:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// DELETE /api/media/:mediaId - Deletar mídia
router.delete('/:mediaId', authenticateToken, async (req, res) => {
  try {
    const { mediaId } = req.params;

    // Verificar se mídia existe e usuário tem acesso
    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({
        error: 'Mídia não encontrada',
        code: 'MEDIA_NOT_FOUND'
      });
    }

    const Device = require('../models/Device');
    const hasAccess = await Device.belongsToUser(media.device_id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a esta mídia',
        code: 'MEDIA_ACCESS_DENIED'
      });
    }

    await Media.deleteMediaFile(mediaId);

    res.json({
      message: 'Mídia deletada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar mídia:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/media/stats/:deviceId - Estatísticas de mídia
router.get('/stats/:deviceId', authenticateToken, verifyDeviceAccess, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { days = 7 } = req.query;

    const stats = await Media.getMediaStats(deviceId, parseInt(days));

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

// Função auxiliar para verificar mídia suspeita
async function checkSuspiciousMedia(media) {
  try {
    let shouldAlert = false;
    let alertReason = '';

    const currentHour = new Date(media.data_hora).getHours();
    const isLateHour = currentHour >= 23 || currentHour <= 6;

    // Verificar horário suspeito para fotos/vídeos
    if ((media.tipo === 'foto' || media.tipo === 'video') && isLateHour) {
      shouldAlert = true;
      alertReason = 'Mídia capturada em horário suspeito (madrugada)';
    }

    // Verificar origem suspeita (muitos downloads)
    if (media.origem === 'download') {
      shouldAlert = true;
      alertReason = 'Mídia baixada da internet';
    }

    // Verificar tamanho muito grande de vídeo
    if (media.tipo === 'video' && media.tamanho_bytes > 100 * 1024 * 1024) { // 100MB
      shouldAlert = true;
      alertReason = 'Vídeo muito grande foi capturado/baixado';
    }

    if (shouldAlert) {
      // Buscar dados do dispositivo para obter user_id
      const Device = require('../models/Device');
      const Children = require('../models/Children');
      
      const device = await Device.findById(media.device_id);
      if (device) {
        const child = await Children.findById(device.child_id);
        if (child) {
          await Alert.createAlert({
            user_id: child.user_id,
            device_id: media.device_id,
            tipo_alerta: 'media_inapropriada',
            prioridade: isLateHour ? 'alta' : 'media',
            titulo: 'Mídia suspeita detectada',
            descricao: `${alertReason}. Arquivo: ${media.nome_arquivo}`,
            dados_extras: {
              media_id: media.id,
              tipo: media.tipo,
              origem: media.origem,
              tamanho_mb: Math.round((media.tamanho_bytes || 0) / (1024 * 1024) * 100) / 100,
              hora_captura: currentHour,
              reason: alertReason
            }
          });
        }
      }
    }
  } catch (error) {
    console.error('Erro ao verificar mídia suspeita:', error);
  }
}

module.exports = router;