const BaseModel = require('./BaseModel');

class Children extends BaseModel {
  constructor() {
    super('children');
  }

  // Buscar filhos de um usuário
  async findByUserId(userId, includeDevices = false) {
    try {
      if (!includeDevices) {
        return await this.findAll({ user_id: userId }, { orderBy: 'created_at', order: 'desc' });
      }

      // Buscar filhos com dispositivos
      const children = await this.db('children')
        .select(
          'children.*',
          'devices.id as device_id',
          'devices.tipo_dispositivo',
          'devices.status_online',
          'devices.ultimo_sync',
          'devices.modelo'
        )
        .leftJoin('devices', 'children.id', 'devices.child_id')
        .where('children.user_id', userId)
        .orderBy('children.created_at', 'desc');

      // Agrupar dispositivos por filho
      const groupedChildren = children.reduce((acc, row) => {
        const childId = row.id;
        
        if (!acc[childId]) {
          acc[childId] = {
            id: row.id,
            user_id: row.user_id,
            nome: row.nome,
            idade: row.idade,
            foto_perfil: row.foto_perfil,
            ativo: row.ativo,
            created_at: row.created_at,
            updated_at: row.updated_at,
            devices: []
          };
        }

        if (row.device_id) {
          acc[childId].devices.push({
            id: row.device_id,
            tipo_dispositivo: row.tipo_dispositivo,
            status_online: row.status_online,
            ultimo_sync: row.ultimo_sync,
            modelo: row.modelo
          });
        }

        return acc;
      }, {});

      return Object.values(groupedChildren);
    } catch (error) {
      throw new Error(`Erro ao buscar filhos: ${error.message}`);
    }
  }

  // Buscar filho com estatísticas
  async findWithStats(childId, userId) {
    try {
      const child = await this.db('children')
        .where({ id: childId, user_id: userId })
        .first();

      if (!child) return null;

      // Buscar dispositivos
      const devices = await this.db('devices')
        .where('child_id', childId);

      if (devices.length === 0) {
        return { ...child, devices: [], stats: {} };
      }

      const deviceIds = devices.map(d => d.id);

      // Estatísticas dos últimos 7 dias
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [
        messagesCount,
        callsCount,
        mediaCount,
        alertsCount
      ] = await Promise.all([
        this.db('messages').whereIn('device_id', deviceIds).where('created_at', '>=', sevenDaysAgo).count('* as count').first(),
        this.db('calls').whereIn('device_id', deviceIds).where('created_at', '>=', sevenDaysAgo).count('* as count').first(),
        this.db('media').whereIn('device_id', deviceIds).where('created_at', '>=', sevenDaysAgo).count('* as count').first(),
        this.db('alerts').where('user_id', userId).whereIn('device_id', deviceIds).where('created_at', '>=', sevenDaysAgo).count('* as count').first()
      ]);

      // Última localização
      const lastLocation = await this.db('locations')
        .whereIn('device_id', deviceIds)
        .orderBy('data_hora', 'desc')
        .first();

      return {
        ...child,
        devices,
        stats: {
          messages_7_days: parseInt(messagesCount.count),
          calls_7_days: parseInt(callsCount.count),
          media_7_days: parseInt(mediaCount.count),
          alerts_7_days: parseInt(alertsCount.count),
          last_location: lastLocation
        }
      };
    } catch (error) {
      throw new Error(`Erro ao buscar filho com estatísticas: ${error.message}`);
    }
  }

  // Verificar se o filho pertence ao usuário
  async belongsToUser(childId, userId) {
    try {
      const child = await this.findOne({ id: childId, user_id: userId });
      return child !== null;
    } catch (error) {
      throw new Error(`Erro ao verificar propriedade: ${error.message}`);
    }
  }

  // Ativar/Desativar monitoramento
  async toggleMonitoring(childId, userId, ativo) {
    try {
      const child = await this.findOne({ id: childId, user_id: userId });
      if (!child) {
        throw new Error('Filho não encontrado');
      }

      return await this.updateById(childId, { ativo });
    } catch (error) {
      throw new Error(`Erro ao alterar monitoramento: ${error.message}`);
    }
  }

  // Buscar filhos com alertas não lidos
  async findWithUnreadAlerts(userId) {
    try {
      const children = await this.db('children')
        .select(
          'children.*',
          this.db.raw('COUNT(alerts.id) as unread_alerts')
        )
        .leftJoin('devices', 'children.id', 'devices.child_id')
        .leftJoin('alerts', function() {
          this.on('alerts.device_id', 'devices.id')
              .andOn('alerts.user_id', '=', this.db.raw('?', [userId]))
              .andOn('alerts.lido', '=', this.db.raw('false'));
        })
        .where('children.user_id', userId)
        .groupBy('children.id')
        .orderBy('children.created_at', 'desc');

      return children;
    } catch (error) {
      throw new Error(`Erro ao buscar filhos com alertas: ${error.message}`);
    }
  }
}

module.exports = new Children();