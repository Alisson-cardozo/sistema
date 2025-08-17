const BaseModel = require('./BaseModel');

class Location extends BaseModel {
  constructor() {
    super('locations');
  }

  // Criar localização individual
  async createLocation(locationData) {
    try {
      return await this.create({
        ...locationData,
        data_hora: new Date(locationData.data_hora)
      });
    } catch (error) {
      throw new Error(`Erro ao criar localização: ${error.message}`);
    }
  }

  // Criar múltiplas localizações (bulk insert)
  async createBulkLocations(locationsData) {
    try {
      const locations = locationsData.map(loc => ({
        ...loc,
        data_hora: new Date(loc.data_hora),
        created_at: new Date(),
        updated_at: new Date()
      }));

      return await this.db(this.tableName).insert(locations).returning('*');
    } catch (error) {
      throw new Error(`Erro ao criar localizações em lote: ${error.message}`);
    }
  }

  // Buscar última localização do dispositivo
  async getLastLocation(deviceId) {
    try {
      return await this.db(this.tableName)
        .where('device_id', deviceId)
        .orderBy('data_hora', 'desc')
        .first();
    } catch (error) {
      throw new Error(`Erro ao buscar última localização: ${error.message}`);
    }
  }

  // Buscar localizações por dispositivo
  async findByDeviceId(deviceId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        start_date,
        end_date,
        is_safe_zone
      } = options;

      let query = this.db(this.tableName).where('device_id', deviceId);

      // Filtros
      if (start_date) query = query.where('data_hora', '>=', start_date);
      if (end_date) query = query.where('data_hora', '<=', end_date);
      if (is_safe_zone !== undefined) query = query.where('is_safe_zone', is_safe_zone);

      const locations = await query
        .orderBy('data_hora', 'desc')
        .limit(limit)
        .offset(offset);

      return locations;
    } catch (error) {
      throw new Error(`Erro ao buscar localizações: ${error.message}`);
    }
  }

  // Buscar localizações em um raio específico
  async findNearby(deviceId, centerLat, centerLng, radiusKm, options = {}) {
    try {
      const { limit = 50, start_date, end_date } = options;

      let query = this.db(this.tableName)
        .where('device_id', deviceId)
        .whereRaw(`
          (6371 * acos(
            cos(radians(?)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians(?)) +
            sin(radians(?)) * sin(radians(latitude))
          )) <= ?
        `, [centerLat, centerLng, centerLat, radiusKm]);

      if (start_date) query = query.where('data_hora', '>=', start_date);
      if (end_date) query = query.where('data_hora', '<=', end_date);

      return await query
        .orderBy('data_hora', 'desc')
        .limit(limit);
    } catch (error) {
      throw new Error(`Erro ao buscar localizações próximas: ${error.message}`);
    }
  }

  // Calcular distância entre duas coordenadas (em km)
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Raio da Terra em km
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI/180);
  }

  // Buscar trajeto do dia
  async getDayRoute(deviceId, date) {
    try {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      const locations = await this.db(this.tableName)
        .where('device_id', deviceId)
        .whereBetween('data_hora', [startDate, endDate])
        .orderBy('data_hora', 'asc');

      // Calcular distância total percorrida
      let totalDistance = 0;
      for (let i = 1; i < locations.length; i++) {
        const prev = locations[i-1];
        const curr = locations[i];
        totalDistance += this.calculateDistance(
          parseFloat(prev.latitude),
          parseFloat(prev.longitude),
          parseFloat(curr.latitude),
          parseFloat(curr.longitude)
        );
      }

      return {
        locations,
        total_distance_km: Math.round(totalDistance * 100) / 100,
        total_points: locations.length,
        start_time: locations[0]?.data_hora,
        end_time: locations[locations.length - 1]?.data_hora
      };
    } catch (error) {
      throw new Error(`Erro ao buscar trajeto do dia: ${error.message}`);
    }
  }

  // Detectar paradas (locais onde ficou mais tempo)
  async detectStops(deviceId, date, minStayMinutes = 15, maxRadiusMeters = 100) {
    try {
      const dayRoute = await this.getDayRoute(deviceId, date);
      const locations = dayRoute.locations;

      if (locations.length < 2) return [];

      const stops = [];
      let currentStop = null;

      for (const location of locations) {
        if (!currentStop) {
          currentStop = {
            latitude: parseFloat(location.latitude),
            longitude: parseFloat(location.longitude),
            start_time: location.data_hora,
            end_time: location.data_hora,
            location_count: 1,
            endereco: location.endereco,
            lugar_nome: location.lugar_nome
          };
          continue;
        }

        const distance = this.calculateDistance(
          currentStop.latitude,
          currentStop.longitude,
          parseFloat(location.latitude),
          parseFloat(location.longitude)
        ) * 1000; // converter para metros

        if (distance <= maxRadiusMeters) {
          // Ainda na mesma parada
          currentStop.end_time = location.data_hora;
          currentStop.location_count++;
          // Atualizar endereço se disponível
          if (location.endereco && !currentStop.endereco) {
            currentStop.endereco = location.endereco;
          }
          if (location.lugar_nome && !currentStop.lugar_nome) {
            currentStop.lugar_nome = location.lugar_nome;
          }
        } else {
          // Mudou de local - verificar se a parada anterior é válida
          const stayMinutes = (new Date(currentStop.end_time) - new Date(currentStop.start_time)) / (1000 * 60);
          
          if (stayMinutes >= minStayMinutes) {
            stops.push({
              ...currentStop,
              stay_duration_minutes: Math.round(stayMinutes)
            });
          }

          // Iniciar nova parada
          currentStop = {
            latitude: parseFloat(location.latitude),
            longitude: parseFloat(location.longitude),
            start_time: location.data_hora,
            end_time: location.data_hora,
            location_count: 1,
            endereco: location.endereco,
            lugar_nome: location.lugar_nome
          };
        }
      }

      // Verificar última parada
      if (currentStop) {
        const stayMinutes = (new Date(currentStop.end_time) - new Date(currentStop.start_time)) / (1000 * 60);
        if (stayMinutes >= minStayMinutes) {
          stops.push({
            ...currentStop,
            stay_duration_minutes: Math.round(stayMinutes)
          });
        }
      }

      return stops;
    } catch (error) {
      throw new Error(`Erro ao detectar paradas: ${error.message}`);
    }
  }

  // Marcar zona como segura/perigosa
  async markSafeZone(locationId, isSafe = true) {
    try {
      return await this.updateById(locationId, { is_safe_zone: isSafe });
    } catch (error) {
      throw new Error(`Erro ao marcar zona: ${error.message}`);
    }
  }

  // Buscar estatísticas de localização
  async getLocationStats(deviceId, days = 7) {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      const stats = await this.db(this.tableName)
        .where('device_id', deviceId)
        .where('data_hora', '>=', daysAgo)
        .select([
          this.db.raw('COUNT(*) as total_locations'),
          this.db.raw('COUNT(DISTINCT DATE(data_hora)) as active_days'),
          this.db.raw('COUNT(*) FILTER (WHERE is_safe_zone = true) as safe_zone_locations'),
          this.db.raw('AVG(accuracy) as avg_accuracy'),
          this.db.raw('MIN(data_hora) as first_location'),
          this.db.raw('MAX(data_hora) as last_location')
        ])
        .first();

      return {
        total_locations: parseInt(stats.total_locations),
        active_days: parseInt(stats.active_days),
        safe_zone_locations: parseInt(stats.safe_zone_locations),
        avg_accuracy: Math.round(parseFloat(stats.avg_accuracy || 0)),
        first_location: stats.first_location,
        last_location: stats.last_location
      };
    } catch (error) {
      throw new Error(`Erro ao buscar estatísticas de localização: ${error.message}`);
    }
  }
}

module.exports = new Location();