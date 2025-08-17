const BaseModel = require('./BaseModel');

class Alert extends BaseModel {
  constructor() {
    super('alerts');
  }

  // Criar alerta
  async createAlert(alertData) {
    try {
      return await this.create({
        ...alertData,
        data_hora: new Date(alertData.data_hora || new Date())
      });
    } catch (error) {
      throw new Error(`Erro ao criar alerta: ${error.message}`);
    }
  }

  // Buscar alertas por usuário
  async findByUserId(userId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        tipo_alerta,
        prioridade,
        lido,
        start_date,
        end_date
      } = options;

      let query = this.db(this.tableName).where('user_id', userId);

      // Filtros
      if (tipo_alerta) query = query.where('tipo_alerta', tipo_alerta);
      if (prioridade) query = query.where('prioridade', prioridade);
      if (lido !== undefined) query = query.where('lido', lido);
      if (start_date) query = query.where('data_hora', '>=', start_date);
      if (end_date) query = query.where('data_hora', '<=', end_date);

      const alerts = await query
        .orderBy('data_hora', 'desc')
        .limit(limit)
        .offset(offset);

      return alerts;
    } catch (error) {
      throw new Error(`Erro ao buscar alertas: ${error.message}`);
    }
  }

  // Buscar alertas não lidos
  async findUnreadAlerts(userId, limit = 20) {
    try {
      return await this.db(this.tableName)
        .where({
          user_id: userId,
          lido: false
        })
        .orderBy([
          { column: 'prioridade', order: 'desc' },
          { column: 'data_hora', order: 'desc' }
        ])
        .limit(limit);
    } catch (error) {
      throw new Error(`Erro ao buscar alertas não lidos: ${error.message}`);
    }
  }

  // Marcar alertas como lidos
  async markAsRead(alertIds, userId) {
    try {
      return await this.db(this.tableName)
        .whereIn('id', alertIds)
        .where('user_id', userId)
        .update({
          lido: true,
          updated_at: new Date()
        });
    } catch (error) {
      throw new Error(`Erro ao marcar alertas como lidos: ${error.message}`);
    }
  }

  // Marcar todos como lidos
  async markAllAsRead(userId) {
    try {
      return await this.db(this.tableName)
        .where({
          user_id: userId,
          lido: false
        })
        .update({
          lido: true,
          updated_at: new Date()
        });
    } catch (error) {
      throw new Error(`Erro ao marcar todos como lidos: ${error.message}`);
    }
  }

  // Contar alertas não lidos
  async countUnreadAlerts(userId) {
    try {
      const result = await this.db(this.tableName)
        .where({
          user_id: userId,
          lido: false
        })
        .count('* as count')
        .first();

      return parseInt(result.count);
    } catch (error) {
      throw new Error(`Erro ao contar alertas não lidos: ${error.message}`);
    }
  }

  // Buscar alertas por dispositivo
  async findByDeviceId(deviceId, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      return await this.db(this.tableName)
        .where('device_id', deviceId)
        .orderBy('data_hora', 'desc')
        .limit(limit)
        .offset(offset);
    } catch (error) {
      throw new Error(`Erro ao buscar alertas por dispositivo: ${error.message}`);
    }
  }

  // Buscar alertas por prioridade
  async findByPriority(userId, prioridade, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      return await this.db(this.tableName)
        .where({
          user_id: userId,
          prioridade
        })
        .orderBy('data_hora', 'desc')
        .limit(limit)
        .offset(offset);
    } catch (error) {
      throw new Error(`Erro ao buscar alertas por prioridade: ${error.message}`);
    }
  }

  // Estatísticas de alertas
  async getAlertStats(userId, days = 7) {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      const stats = await this.db(this.tableName)
        .where('user_id', userId)
        .where('data_hora', '>=', daysAgo)
        .select([
          this.db.raw('COUNT(*) as total_alerts'),
          this.db.raw('COUNT(*) FILTER (WHERE lido = false) as unread_alerts'),
          this.db.raw('COUNT(*) FILTER (WHERE prioridade = ?) as critical_alerts', ['critica']),
          this.db.raw('COUNT(*) FILTER (WHERE prioridade = ?) as high_alerts', ['alta']),
          this.db.raw('COUNT(*) FILTER (WHERE prioridade = ?) as medium_alerts', ['media']),
          this.db.raw('COUNT(*) FILTER (WHERE prioridade = ?) as low_alerts', ['baixa']),
          this.db.raw('COUNT(*) FILTER (WHERE tipo_alerta = ?) as message_alerts', ['mensagem_suspeita']),
          this.db.raw('COUNT(*) FILTER (WHERE tipo_alerta = ?) as call_alerts', ['chamada_suspeita']),
          this.db.raw('COUNT(*) FILTER (WHERE tipo_alerta = ?) as location_alerts', ['localizacao_risco']),
          this.db.raw('COUNT(*) FILTER (WHERE tipo_alerta = ?) as media_alerts', ['media_inapropriada']),
          this.db.raw('COUNT(*) FILTER (WHERE email_enviado = true) as email_sent'),
          this.db.raw('COUNT(*) FILTER (WHERE push_enviado = true) as push_sent')
        ])
        .first();

      return {
        total_alerts: parseInt(stats.total_alerts),
        unread_alerts: parseInt(stats.unread_alerts),
        critical_alerts: parseInt(stats.critical_alerts),
        high_alerts: parseInt(stats.high_alerts),
        medium_alerts: parseInt(stats.medium_alerts),
        low_alerts: parseInt(stats.low_alerts),
        message_alerts: parseInt(stats.message_alerts),
        call_alerts: parseInt(stats.call_alerts),
        location_alerts: parseInt(stats.location_alerts),
        media_alerts: parseInt(stats.media_alerts),
        email_sent: parseInt(stats.email_sent),
        push_sent: parseInt(stats.push_sent)
      };
    } catch (error) {
      throw new Error(`Erro ao buscar estatísticas de alertas: ${error.message}`);
    }
  }

  // Buscar alertas recentes críticos
  async findRecentCriticalAlerts(userId, hours = 24) {
    try {
      const hoursAgo = new Date();
      hoursAgo.setHours(hoursAgo.getHours() - hours);

      return await this.db(this.tableName)
        .where({
          user_id: userId,
          prioridade: 'critica'
        })
        .where('data_hora', '>=', hoursAgo)
        .orderBy('data_hora', 'desc');
    } catch (error) {
      throw new Error(`Erro ao buscar alertas críticos recentes: ${error.message}`);
    }
  }

  // Atualizar status de envio de email
  async markEmailSent(alertId) {
    try {
      return await this.updateById(alertId, {
        email_enviado: true,
        updated_at: new Date()
      });
    } catch (error) {
      throw new Error(`Erro ao marcar email enviado: ${error.message}`);
    }
  }

  // Atualizar status de envio de push
  async markPushSent(alertId) {
    try {
      return await this.updateById(alertId, {
        push_enviado: true,
        updated_at: new Date()
      });
    } catch (error) {
      throw new Error(`Erro ao marcar push enviado: ${error.message}`);
    }
  }

  // Buscar alertas para envio de notificação
  async findAlertsForNotification() {
    try {
      return await this.db(this.tableName)
        .select('alerts.*', 'users.email', 'users.nome as user_name')
        .join('users', 'alerts.user_id', 'users.id')
        .where('alerts.email_enviado', false)
        .whereIn('alerts.prioridade', ['alta', 'critica'])
        .where('alerts.data_hora', '>=', this.db.raw("NOW() - INTERVAL '1 hour'"))
        .orderBy('alerts.prioridade', 'desc')
        .orderBy('alerts.data_hora', 'desc');
    } catch (error) {
      throw new Error(`Erro ao buscar alertas para notificação: ${error.message}`);
    }
  }

  // Criar alerta de palavra-chave
  async createKeywordAlert(userId, deviceId, keyword, message, messageData) {
    try {
      return await this.createAlert({
        user_id: userId,
        device_id: deviceId,
        tipo_alerta: 'palavra_chave',
        prioridade: 'media',
        titulo: `Palavra-chave detectada: "${keyword}"`,
        descricao: `A palavra "${keyword}" foi detectada na mensagem: "${message.substring(0, 100)}..."`,
        dados_extras: {
          keyword,
          message_id: messageData.id,
          app: messageData.tipo_app,
          contact: messageData.contato,
          full_message: message
        }
      });
    } catch (error) {
      throw new Error(`Erro ao criar alerta de palavra-chave: ${error.message}`);
    }
  }

  // Criar alerta de localização
  async createLocationAlert(userId, deviceId, location, alertType) {
    try {
      let titulo, descricao, prioridade;

      switch (alertType) {
        case 'zona_perigo':
          titulo = 'Localização em zona de risco';
          descricao = `Dispositivo detectado em zona de risco: ${location.endereco || 'Localização desconhecida'}`;
          prioridade = 'alta';
          break;
        case 'fora_horario':
          titulo = 'Fora de casa em horário inadequado';
          descricao = `Dispositivo fora de casa durante horário não permitido`;
          prioridade = 'media';
          break;
        default:
          titulo = 'Alerta de localização';
          descricao = 'Alerta relacionado à localização do dispositivo';
          prioridade = 'media';
      }

      return await this.createAlert({
        user_id: userId,
        device_id: deviceId,
        tipo_alerta: 'localizacao_risco',
        prioridade,
        titulo,
        descricao,
        dados_extras: {
          latitude: location.latitude,
          longitude: location.longitude,
          endereco: location.endereco,
          alert_type: alertType
        }
      });
    } catch (error) {
      throw new Error(`Erro ao criar alerta de localização: ${error.message}`);
    }
  }

  // Criar alerta de dispositivo offline
  async createOfflineAlert(userId, deviceId, deviceName, lastSeen) {
    try {
      return await this.createAlert({
        user_id: userId,
        device_id: deviceId,
        tipo_alerta: 'dispositivo_offline',
        prioridade: 'media',
        titulo: 'Dispositivo offline',
        descricao: `O dispositivo ${deviceName} está offline desde ${lastSeen}`,
        dados_extras: {
          device_name: deviceName,
          last_seen: lastSeen
        }
      });
    } catch (error) {
      throw new Error(`Erro ao criar alerta offline: ${error.message}`);
    }
  }

  // Deletar alertas antigos
  async cleanupOldAlerts(days = 60) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const deletedCount = await this.db(this.tableName)
        .where('data_hora', '<', cutoffDate)
        .where('lido', true) // Só deletar alertas já lidos
        .del();

      return deletedCount;
    } catch (error) {
      throw new Error(`Erro na limpeza de alertas: ${error.message}`);
    }
  }
}

module.exports = new Alert();