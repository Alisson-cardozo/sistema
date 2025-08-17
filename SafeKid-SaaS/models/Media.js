const BaseModel = require('./BaseModel');
const path = require('path');
const fs = require('fs').promises;

class Media extends BaseModel {
  constructor() {
    super('media');
  }

  // Criar mídia individual
  async createMedia(mediaData) {
    try {
      return await this.create({
        ...mediaData,
        data_criacao: new Date(mediaData.data_criacao),
        data_hora: new Date(mediaData.data_hora)
      });
    } catch (error) {
      throw new Error(`Erro ao criar mídia: ${error.message}`);
    }
  }

  // Buscar mídias por dispositivo
  async findByDeviceId(deviceId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        tipo,
        origem,
        flagged,
        start_date,
        end_date
      } = options;

      let query = this.db(this.tableName).where('device_id', deviceId);

      // Filtros
      if (tipo) query = query.where('tipo', tipo);
      if (origem) query = query.where('origem', origem);
      if (flagged !== undefined) query = query.where('flagged', flagged);
      if (start_date) query = query.where('data_hora', '>=', start_date);
      if (end_date) query = query.where('data_hora', '<=', end_date);

      const media = await query
        .orderBy('data_hora', 'desc')
        .limit(limit)
        .offset(offset);

      return media;
    } catch (error) {
      throw new Error(`Erro ao buscar mídias: ${error.message}`);
    }
  }

  // Processar upload de arquivo
  async processFileUpload(file, deviceId, mediaData) {
    try {
      // Gerar nome único para o arquivo
      const fileExtension = path.extname(file.originalname);
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${fileExtension}`;
      
      // Definir caminho de armazenamento
      const uploadDir = path.join(process.env.UPLOAD_PATH || './uploads', 'media', deviceId);
      const filePath = path.join(uploadDir, fileName);
      
      // Criar diretório se não existir
      await fs.mkdir(uploadDir, { recursive: true });
      
      // Mover arquivo para destino
      await fs.writeFile(filePath, file.buffer);

      // Criar registro no banco
      const media = await this.createMedia({
        device_id: deviceId,
        tipo: this.detectMediaType(file.mimetype),
        origem: mediaData.origem || 'camera',
        caminho_arquivo: filePath,
        nome_arquivo: file.originalname,
        tamanho_bytes: file.size,
        mime_type: file.mimetype,
        duracao: mediaData.duracao || null,
        descricao: mediaData.descricao || null,
        data_criacao: mediaData.data_criacao || new Date(),
        data_hora: new Date()
      });

      return media;
    } catch (error) {
      throw new Error(`Erro ao processar upload: ${error.message}`);
    }
  }

  // Detectar tipo de mídia baseado no MIME type
  detectMediaType(mimeType) {
    if (mimeType.startsWith('image/')) return 'foto';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'foto'; // default
  }

  // Marcar mídia como flagged
  async flagMedia(mediaId, flagged = true) {
    try {
      return await this.updateById(mediaId, { flagged });
    } catch (error) {
      throw new Error(`Erro ao marcar mídia: ${error.message}`);
    }
  }

  // Buscar mídias flagged
  async findFlaggedMedia(deviceId, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      return await this.db(this.tableName)
        .where({
          device_id: deviceId,
          flagged: true
        })
        .orderBy('data_hora', 'desc')
        .limit(limit)
        .offset(offset);
    } catch (error) {
      throw new Error(`Erro ao buscar mídias flagged: ${error.message}`);
    }
  }

  // Estatísticas de mídia
  async getMediaStats(deviceId, days = 7) {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      const stats = await this.db(this.tableName)
        .where('device_id', deviceId)
        .where('data_hora', '>=', daysAgo)
        .select([
          this.db.raw('COUNT(*) as total_media'),
          this.db.raw('COUNT(*) FILTER (WHERE tipo = ?) as photos_count', ['foto']),
          this.db.raw('COUNT(*) FILTER (WHERE tipo = ?) as videos_count', ['video']),
          this.db.raw('COUNT(*) FILTER (WHERE tipo = ?) as audios_count', ['audio']),
          this.db.raw('COUNT(*) FILTER (WHERE origem = ?) as camera_media', ['camera']),
          this.db.raw('COUNT(*) FILTER (WHERE origem = ?) as gallery_media', ['galeria']),
          this.db.raw('COUNT(*) FILTER (WHERE origem = ?) as whatsapp_media', ['whatsapp']),
          this.db.raw('COUNT(*) FILTER (WHERE origem = ?) as telegram_media', ['telegram']),
          this.db.raw('COUNT(*) FILTER (WHERE flagged = true) as flagged_media'),
          this.db.raw('SUM(tamanho_bytes) as total_size_bytes'),
          this.db.raw('AVG(tamanho_bytes) as avg_size_bytes')
        ])
        .first();

      return {
        total_media: parseInt(stats.total_media),
        photos_count: parseInt(stats.photos_count),
        videos_count: parseInt(stats.videos_count),
        audios_count: parseInt(stats.audios_count),
        camera_media: parseInt(stats.camera_media),
        gallery_media: parseInt(stats.gallery_media),
        whatsapp_media: parseInt(stats.whatsapp_media),
        telegram_media: parseInt(stats.telegram_media),
        flagged_media: parseInt(stats.flagged_media),
        total_size_mb: Math.round((parseInt(stats.total_size_bytes || 0)) / (1024 * 1024) * 100) / 100,
        avg_size_mb: Math.round((parseFloat(stats.avg_size_bytes || 0)) / (1024 * 1024) * 100) / 100
      };
    } catch (error) {
      throw new Error(`Erro ao buscar estatísticas de mídia: ${error.message}`);
    }
  }

  // Buscar mídias recentes
  async findRecentMedia(deviceId, hours = 24, limit = 20) {
    try {
      const hoursAgo = new Date();
      hoursAgo.setHours(hoursAgo.getHours() - hours);

      return await this.db(this.tableName)
        .where('device_id', deviceId)
        .where('data_hora', '>=', hoursAgo)
        .orderBy('data_hora', 'desc')
        .limit(limit);
    } catch (error) {
      throw new Error(`Erro ao buscar mídias recentes: ${error.message}`);
    }
  }

  // Buscar mídias por origem
  async findByOrigin(deviceId, origem, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      return await this.db(this.tableName)
        .where({
          device_id: deviceId,
          origem
        })
        .orderBy('data_hora', 'desc')
        .limit(limit)
        .offset(offset);
    } catch (error) {
      throw new Error(`Erro ao buscar mídias por origem: ${error.message}`);
    }
  }

  // Verificar se arquivo existe
  async checkFileExists(mediaId) {
    try {
      const media = await this.findById(mediaId);
      if (!media) return false;

      try {
        await fs.access(media.caminho_arquivo);
        return true;
      } catch {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  // Deletar arquivo físico e registro
  async deleteMediaFile(mediaId) {
    try {
      const media = await this.findById(mediaId);
      if (!media) {
        throw new Error('Mídia não encontrada');
      }

      // Tentar deletar arquivo físico
      try {
        await fs.unlink(media.caminho_arquivo);
      } catch (error) {
        console.warn(`Erro ao deletar arquivo ${media.caminho_arquivo}:`, error.message);
      }

      // Deletar registro do banco
      return await this.deleteById(mediaId);
    } catch (error) {
      throw new Error(`Erro ao deletar mídia: ${error.message}`);
    }
  }

  // Limpar mídias antigas
  async cleanupOldMedia(days = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const oldMedia = await this.db(this.tableName)
        .where('data_hora', '<', cutoffDate)
        .where('flagged', false); // Não deletar mídias flagged

      let deletedCount = 0;
      for (const media of oldMedia) {
        try {
          await this.deleteMediaFile(media.id);
          deletedCount++;
        } catch (error) {
          console.warn(`Erro ao deletar mídia ${media.id}:`, error.message);
        }
      }

      return {
        total_found: oldMedia.length,
        total_deleted: deletedCount
      };
    } catch (error) {
      throw new Error(`Erro na limpeza de mídias: ${error.message}`);
    }
  }

  // Marcar backup em nuvem
  async markCloudBackup(mediaId, backedUp = true) {
    try {
      return await this.updateById(mediaId, { backup_cloud: backedUp });
    } catch (error) {
      throw new Error(`Erro ao marcar backup: ${error.message}`);
    }
  }

  // Buscar mídias sem backup
  async findUnbackedMedia(deviceId) {
    try {
      return await this.db(this.tableName)
        .where({
          device_id: deviceId,
          backup_cloud: false
        })
        .orderBy('data_hora', 'asc');
    } catch (error) {
      throw new Error(`Erro ao buscar mídias sem backup: ${error.message}`);
    }
  }
}

module.exports = new Media();