const BaseModel = require('./BaseModel');

class Device extends BaseModel {
  constructor() {
    super('devices');
  }

  // Registrar novo dispositivo
  async registerDevice(deviceData) {
    try {
      // Verificar se UUID já existe
      const existingDevice = await this.findOne({ uuid: deviceData.uuid });
      if (existingDevice) {
        // Atualizar informações do dispositivo existente
        return await this.updateById(existingDevice.id, {
          tipo_dispositivo: deviceData.tipo_dispositivo,
          modelo: deviceData.modelo,
          versao_os: deviceData.versao_os,
          app_version: deviceData.app_version,
          status_online: true,
          ultimo_sync: new Date()
        });
      }

      // Criar novo dispositivo
      return await this.create({
        child_id: deviceData.child_id,
        tipo_dispositivo: deviceData.tipo_dispositivo,
        uuid: deviceData.uuid,
        modelo: deviceData.modelo,
        versao_os: deviceData.versao_os,
        app_version: deviceData.app_version,
        status_online: true,
        ultimo_sync: new Date()
      });
    } catch (error) {
      throw new Error(`Erro ao registrar dispositivo: ${error.message}`);
    }
  }

  // Atualizar status online
  async updateOnlineStatus(deviceId, isOnline) {
    try {
      return await this.updateById(deviceId, {
        status_online: isOnline,
        ultimo_sync: new Date()
      });
    } catch (error) {
      throw new Error(`Erro ao atualizar status: ${error.message}`);
    }
  }

  // Buscar dispositivos de um filho
  async findByChildId(childId) {
    try {
      return await this.findAll({ child_id: childId }, { orderBy: 'created_at', order: 'desc' });
    } catch (error) {
      throw new Error(`Erro ao buscar dispositivos: ${error.message}`);
    }
  }

  // Buscar dispositivo por UUID
  async findByUUID(uuid) {
    try {
      return await this.findOne({ uuid });
    } catch (error) {
      throw new Error(`Erro ao buscar por UUID: ${error.message}`);
    }
  }

  // Verificar se dispositivo pertence ao usuário
  async belongsToUser(deviceId, userId) {
    try {
      const device = await this.db('devices')
        .join('children', 'devices.child_id', 'children.id')
        .where('devices.id', deviceId)
        .where('children.user_id', userId)
        .first();

      return device !== null;
    } catch (error) {
      throw new Error(`Erro ao verificar propriedade: ${error.message}`);
    }
  }

  // Buscar dispositivos offline há mais de X minutos
  async findOfflineDevices(minutesOffline = 10) {
    try {
      const timeThreshold = new Date();
      timeThreshold.setMinutes(timeThreshold.getMinutes() - minutesOffline);

      return await this.db('devices')
        .select('devices.*', 'children.nome as child_name', 'users.id as user_id', 'users.email')
        .join('children', 'devices.child_id', 'children.id')
        .join('users', 'children.user_id', 'users.id')
        .where('devices.ultimo_sync', '<', timeThreshold)
        .orWhere('devices.status_online', false);
    } catch (error) {
      throw new Error(`Erro ao buscar dispositivos offline: ${error.message}`);
    }
  }

  // Buscar estatísticas do dispositivo
  async getDeviceStats(deviceId, days = 7) {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      const [
        messagesCount,
        callsCount,
        mediaCount,
        locationsCount
      ] = await Promise.all([
        this.db('messages').where('device_id', deviceId).where('created_at', '>=', daysAgo).count('* as count').first(),
        this.db('calls').where('device_id', deviceId).where('created_at', '>=', daysAgo).count('* as count').first(),
        this.db('media').where('device_id', deviceId).where('created_at', '>=', daysAgo).count('* as count').first(),
        this.db('locations').where('device_id', deviceId).where('created_at', '>=', daysAgo).count('* as count').first()
      ]);

      return {
        messages: parseInt(messagesCount.count),
        calls: parseInt(callsCount.count),
        media: parseInt(mediaCount.count),
        locations: parseInt(locationsCount.count)
      };
    } catch (error) {
      throw new Error(`Erro ao buscar estatísticas: ${error.message}`);
    }
  }

  // Atualizar informações do app
  async updateAppInfo(deviceId, appVersion) {
    try {
      return await this.updateById(deviceId, {
        app_version: appVersion,
        ultimo_sync: new Date()
      });
    } catch (error) {
      throw new Error(`Erro ao atualizar versão do app: ${error.message}`);
    }
  }

  // Buscar último sync de todos os dispositivos de um usuário
  async getLastSyncByUser(userId) {
    try {
      return await this.db('devices')
        .select('devices.*', 'children.nome as child_name')
        .join('children', 'devices.child_id', 'children.id')
        .where('children.user_id', userId)
        .orderBy('devices.ultimo_sync', 'desc');
    } catch (error) {
      throw new Error(`Erro ao buscar último sync: ${error.message}`);
    }
  }
}

module.exports = new Device();