const BaseModel = require('./BaseModel');

class Call extends BaseModel {
  constructor() {
    super('calls');
  }

  // Criar chamada individual
  async createCall(callData) {
    try {
      return await this.create({
        ...callData,
        data_hora: new Date(callData.data_hora)
      });
    } catch (error) {
      throw new Error(`Erro ao criar chamada: ${error.message}`);
    }
  }

  // Criar múltiplas chamadas (bulk insert)
  async createBulkCalls(callsData) {
    try {
      const calls = callsData.map(call => ({
        ...call,
        data_hora: new Date(call.data_hora),
        created_at: new Date(),
        updated_at: new Date()
      }));

      return await this.db(this.tableName).insert(calls).returning('*');
    } catch (error) {
      throw new Error(`Erro ao criar chamadas em lote: ${error.message}`);
    }
  }

  // Buscar chamadas por dispositivo
  async findByDeviceId(deviceId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        tipo_chamada,
        direcao,
        flagged,
        start_date,
        end_date
      } = options;

      let query = this.db(this.tableName).where('device_id', deviceId);

      // Filtros
      if (tipo_chamada) query = query.where('tipo_chamada', tipo_chamada);
      if (direcao) query = query.where('direcao', direcao);
      if (flagged !== undefined) query = query.where('flagged', flagged);
      if (start_date) query = query.where('data_hora', '>=', start_date);
      if (end_date) query = query.where('data_hora', '<=', end_date);

      const calls = await query
        .orderBy('data_hora', 'desc')
        .limit(limit)
        .offset(offset);

      return calls;
    } catch (error) {
      throw new Error(`Erro ao buscar chamadas: ${error.message}`);
    }
  }

  // Marcar chamada como flagged
  async flagCall(callId, flagged = true) {
    try {
      return await this.updateById(callId, { flagged });
    } catch (error) {
      throw new Error(`Erro ao marcar chamada: ${error.message}`);
    }
  }

  // Estatísticas de chamadas
  async getCallStats(deviceId, days = 7) {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      const stats = await this.db(this.tableName)
        .where('device_id', deviceId)
        .where('data_hora', '>=', daysAgo)
        .select([
          this.db.raw('COUNT(*) as total_calls'),
          this.db.raw('COUNT(*) FILTER (WHERE direcao = ?) as outgoing_calls', ['enviada']),
          this.db.raw('COUNT(*) FILTER (WHERE direcao = ?) as incoming_calls', ['recebida']),
          this.db.raw('COUNT(*) FILTER (WHERE direcao = ?) as missed_calls', ['perdida']),
          this.db.raw('COUNT(*) FILTER (WHERE tipo_chamada = ?) as phone_calls', ['celular']),
          this.db.raw('COUNT(*) FILTER (WHERE tipo_chamada = ?) as whatsapp_calls', ['whatsapp']),
          this.db.raw('COUNT(*) FILTER (WHERE tipo_chamada = ?) as telegram_calls', ['telegram']),
          this.db.raw('SUM(duracao) as total_duration'),
          this.db.raw('AVG(duracao) as avg_duration'),
          this.db.raw('COUNT(*) FILTER (WHERE flagged = true) as flagged_calls')
        ])
        .first();

      return {
        total_calls: parseInt(stats.total_calls),
        outgoing_calls: parseInt(stats.outgoing_calls),
        incoming_calls: parseInt(stats.incoming_calls),
        missed_calls: parseInt(stats.missed_calls),
        phone_calls: parseInt(stats.phone_calls),
        whatsapp_calls: parseInt(stats.whatsapp_calls),
        telegram_calls: parseInt(stats.telegram_calls),
        total_duration: parseInt(stats.total_duration || 0),
        avg_duration: Math.round(parseFloat(stats.avg_duration || 0)),
        flagged_calls: parseInt(stats.flagged_calls)
      };
    } catch (error) {
      throw new Error(`Erro ao buscar estatísticas de chamadas: ${error.message}`);
    }
  }

  // Buscar chamadas suspeitas (baseado em critérios)
  async findSuspiciousCalls(deviceId, criteria = {}) {
    try {
      const {
        min_duration = 300, // 5 minutos
        late_hour_start = 23, // 23h
        early_hour_end = 6,   // 6h
        unknown_numbers = true
      } = criteria;

      let query = this.db(this.tableName).where('device_id', deviceId);

      // Chamadas longas OU em horários suspeitos OU números desconhecidos
      query = query.where(function() {
        // Chamadas muito longas
        this.where('duracao', '>', min_duration)
        // OU chamadas tarde da noite/madrugada
        .orWhereRaw('EXTRACT(HOUR FROM data_hora) >= ? OR EXTRACT(HOUR FROM data_hora) <= ?', [late_hour_start, early_hour_end]);
        
        // OU números sem nome de contato (se habilitado)
        if (unknown_numbers) {
          this.orWhereNull('contato_nome');
        }
      });

      return await query
        .orderBy('data_hora', 'desc')
        .limit(100);
    } catch (error) {
      throw new Error(`Erro ao buscar chamadas suspeitas: ${error.message}`);
    }
  }

  // Buscar chamadas por contato
  async findByContact(deviceId, numero, options = {}) {
    try {
      const { limit = 20, offset = 0 } = options;

      return await this.db(this.tableName)
        .where({
          device_id: deviceId,
          numero
        })
        .orderBy('data_hora', 'desc')
        .limit(limit)
        .offset(offset);
    } catch (error) {
      throw new Error(`Erro ao buscar chamadas por contato: ${error.message}`);
    }
  }

  // Buscar top contatos mais chamados
  async getTopContacts(deviceId, days = 30, limit = 10) {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      return await this.db(this.tableName)
        .where('device_id', deviceId)
        .where('data_hora', '>=', daysAgo)
        .select([
          'numero',
          'contato_nome',
          this.db.raw('COUNT(*) as call_count'),
          this.db.raw('SUM(duracao) as total_duration'),
          this.db.raw('MAX(data_hora) as last_call')
        ])
        .groupBy(['numero', 'contato_nome'])
        .orderBy('call_count', 'desc')
        .limit(limit);
    } catch (error) {
      throw new Error(`Erro ao buscar top contatos: ${error.message}`);
    }
  }

  // Buscar chamadas flagged
  async findFlaggedCalls(deviceId, options = {}) {
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
      throw new Error(`Erro ao buscar chamadas flagged: ${error.message}`);
    }
  }
}

module.exports = new Call();