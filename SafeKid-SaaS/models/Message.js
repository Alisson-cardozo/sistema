const BaseModel = require('./BaseModel');

class Message extends BaseModel {
  constructor() {
    super('messages');
  }

  // Criar mensagem individual
  async createMessage(messageData) {
    try {
      return await this.create({
        ...messageData,
        data_hora: new Date(messageData.data_hora)
      });
    } catch (error) {
      throw new Error(`Erro ao criar mensagem: ${error.message}`);
    }
  }

  // Criar múltiplas mensagens (bulk insert)
  async createBulkMessages(messagesData) {
    try {
      const messages = messagesData.map(msg => ({
        ...msg,
        data_hora: new Date(msg.data_hora),
        created_at: new Date(),
        updated_at: new Date()
      }));

      return await this.db(this.tableName).insert(messages).returning('*');
    } catch (error) {
      throw new Error(`Erro ao criar mensagens em lote: ${error.message}`);
    }
  }

  // Buscar mensagens por dispositivo
  async findByDeviceId(deviceId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        tipo_app,
        contato,
        flagged,
        is_grupo,
        start_date,
        end_date
      } = options;

      let query = this.db(this.tableName).where('device_id', deviceId);

      // Filtros
      if (tipo_app) query = query.where('tipo_app', tipo_app);
      if (contato) query = query.whereILike('contato', `%${contato}%`);
      if (flagged !== undefined) query = query.where('flagged', flagged);
      if (is_grupo !== undefined) query = query.where('is_grupo', is_grupo);
      if (start_date) query = query.where('data_hora', '>=', start_date);
      if (end_date) query = query.where('data_hora', '<=', end_date);

      const messages = await query
        .orderBy('data_hora', 'desc')
        .limit(limit)
        .offset(offset);

      return messages;
    } catch (error) {
      throw new Error(`Erro ao buscar mensagens: ${error.message}`);
    }
  }

  // Buscar mensagens por palavra-chave suspeita
  async findSuspiciousMessages(deviceId, keywords) {
    try {
      let query = this.db(this.tableName).where('device_id', deviceId);

      // Buscar por palavras-chave
      keywords.forEach((keyword, index) => {
        if (index === 0) {
          query = query.whereILike('mensagem', `%${keyword}%`);
        } else {
          query = query.orWhereILike('mensagem', `%${keyword}%`);
        }
      });

      return await query
        .orderBy('data_hora', 'desc')
        .limit(100);
    } catch (error) {
      throw new Error(`Erro ao buscar mensagens suspeitas: ${error.message}`);
    }
  }

  // Marcar mensagem como flagged
  async flagMessage(messageId, flagged = true) {
    try {
      return await this.updateById(messageId, { flagged });
    } catch (error) {
      throw new Error(`Erro ao marcar mensagem: ${error.message}`);
    }
  }

  // Estatísticas de mensagens
  async getMessageStats(deviceId, days = 7) {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      const stats = await this.db(this.tableName)
        .where('device_id', deviceId)
        .where('data_hora', '>=', daysAgo)
        .select([
          this.db.raw('COUNT(*) as total_messages'),
          this.db.raw('COUNT(*) FILTER (WHERE direcao = ?) as sent_messages', ['enviada']),
          this.db.raw('COUNT(*) FILTER (WHERE direcao = ?) as received_messages', ['recebida']),
          this.db.raw('COUNT(*) FILTER (WHERE tipo_app = ?) as whatsapp_messages', ['whatsapp']),
          this.db.raw('COUNT(*) FILTER (WHERE tipo_app = ?) as telegram_messages', ['telegram']),
          this.db.raw('COUNT(*) FILTER (WHERE tipo_app = ?) as sms_messages', ['sms']),
          this.db.raw('COUNT(*) FILTER (WHERE is_grupo = true) as group_messages'),
          this.db.raw('COUNT(*) FILTER (WHERE flagged = true) as flagged_messages')
        ])
        .first();

      return {
        total_messages: parseInt(stats.total_messages),
        sent_messages: parseInt(stats.sent_messages),
        received_messages: parseInt(stats.received_messages),
        whatsapp_messages: parseInt(stats.whatsapp_messages),
        telegram_messages: parseInt(stats.telegram_messages),
        sms_messages: parseInt(stats.sms_messages),
        group_messages: parseInt(stats.group_messages),
        flagged_messages: parseInt(stats.flagged_messages)
      };
    } catch (error) {
      throw new Error(`Erro ao buscar estatísticas: ${error.message}`);
    }
  }

  // Buscar conversas (agrupadas por contato)
  async findConversations(deviceId, options = {}) {
    try {
      const { limit = 20, offset = 0 } = options;

      const conversations = await this.db(this.tableName)
        .where('device_id', deviceId)
        .select([
          'contato',
          'tipo_app',
          'is_grupo',
          'grupo',
          this.db.raw('COUNT(*) as message_count'),
          this.db.raw('MAX(data_hora) as last_message_time'),
          this.db.raw('MAX(mensagem) as last_message'),
          this.db.raw('COUNT(*) FILTER (WHERE flagged = true) as flagged_count')
        ])
        .groupBy(['contato', 'tipo_app', 'is_grupo', 'grupo'])
        .orderBy('last_message_time', 'desc')
        .limit(limit)
        .offset(offset);

      return conversations.map(conv => ({
        ...conv,
        message_count: parseInt(conv.message_count),
        flagged_count: parseInt(conv.flagged_count)
      }));
    } catch (error) {
      throw new Error(`Erro ao buscar conversas: ${error.message}`);
    }
  }

  // Buscar mensagens de uma conversa específica
  async findConversationMessages(deviceId, contato, tipo_app, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      return await this.db(this.tableName)
        .where({
          device_id: deviceId,
          contato,
          tipo_app
        })
        .orderBy('data_hora', 'desc')
        .limit(limit)
        .offset(offset);
    } catch (error) {
      throw new Error(`Erro ao buscar mensagens da conversa: ${error.message}`);
    }
  }

  // Buscar mensagens flagged
  async findFlaggedMessages(deviceId, options = {}) {
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
      throw new Error(`Erro ao buscar mensagens flagged: ${error.message}`);
    }
  }
}

module.exports = new Message();