const express = require('express');
const Location = require('../models/Location');
const Alert = require('../models/Alert');
const { validate, locationSchemas, querySchemas } = require('../middleware/validation');
const { authenticateToken, authenticateDevice, verifyDeviceAccess } = require('../middleware/auth');

const router = express.Router();

// GET /api/locations - Buscar localizações (para pais)
router.get('/', authenticateToken, validate(querySchemas.pagination, 'query'), async (req, res) => {
  try {
    const { device_id, is_safe_zone, days = 1 } = req.query;
    const { page = 1, limit = 100 } = req.query;
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
      is_safe_zone: is_safe_zone === 'true' ? true : is_safe_zone === 'false' ? false : undefined,
      start_date
    };

    const locations = await Location.findByDeviceId(device_id, options);
    const stats = await Location.getLocationStats(device_id, parseInt(days));

    res.json({
      locations,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: locations.length
      }
    });
  } catch (error) {
    console.error('Erro ao buscar localizações:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/locations/current - Última localização do dispositivo
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const { device_id } = req.query;

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

    const lastLocation = await Location.getLastLocation(device_id);

    if (!lastLocation) {
      return res.status(404).json({
        error: 'Nenhuma localização encontrada',
        code: 'NO_LOCATION_FOUND'
      });
    }

    res.json({
      current_location: lastLocation
    });
  } catch (error) {
    console.error('Erro ao buscar localização atual:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/locations/route/:date - Trajeto do dia
router.get('/route/:date', authenticateToken, async (req, res) => {
  try {
    const { date } = req.params;
    const { device_id } = req.query;

    if (!device_id) {
      return res.status(400).json({
        error: 'device_id é obrigatório',
        code: 'DEVICE_ID_REQUIRED'
      });
    }

    // Verificar formato da data
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'Formato de data inválido. Use YYYY-MM-DD',
        code: 'INVALID_DATE_FORMAT'
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

    const route = await Location.getDayRoute(device_id, date);

    res.json({
      route,
      date
    });
  } catch (error) {
    console.error('Erro ao buscar trajeto:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/locations/stops/:date - Paradas do dia
router.get('/stops/:date', authenticateToken, async (req, res) => {
  try {
    const { date } = req.params;
    const { device_id, min_stay_minutes = 15, max_radius_meters = 100 } = req.query;

    if (!device_id) {
      return res.status(400).json({
        error: 'device_id é obrigatório',
        code: 'DEVICE_ID_REQUIRED'
      });
    }

    // Verificar formato da data
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'Formato de data inválido. Use YYYY-MM-DD',
        code: 'INVALID_DATE_FORMAT'
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

    const stops = await Location.detectStops(
      device_id, 
      date, 
      parseInt(min_stay_minutes), 
      parseInt(max_radius_meters)
    );

    res.json({
      stops,
      date,
      criteria: {
        min_stay_minutes: parseInt(min_stay_minutes),
        max_radius_meters: parseInt(max_radius_meters)
      }
    });
  } catch (error) {
    console.error('Erro ao detectar paradas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/locations/nearby - Buscar localizações próximas
router.get('/nearby', authenticateToken, async (req, res) => {
  try {
    const { device_id, lat, lng, radius_km = 1, days = 7 } = req.query;

    if (!device_id || !lat || !lng) {
      return res.status(400).json({
        error: 'device_id, lat e lng são obrigatórios',
        code: 'MISSING_PARAMETERS'
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

    const start_date = new Date();
    start_date.setDate(start_date.getDate() - parseInt(days));

    const nearbyLocations = await Location.findNearby(
      device_id,
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(radius_km),
      { start_date }
    );

    res.json({
      nearby_locations: nearbyLocations,
      search_center: {
        latitude: parseFloat(lat),
        longitude: parseFloat(lng)
      },
      radius_km: parseFloat(radius_km),
      period_days: parseInt(days)
    });
  } catch (error) {
    console.error('Erro ao buscar localizações próximas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/locations - Criar localização individual (APK)
router.post('/', authenticateDevice, validate(locationSchemas.create), async (req, res) => {
  try {
    const locationData = req.body;
    
    // Verificar se device_id corresponde ao dispositivo autenticado
    if (locationData.device_id !== req.device.id) {
      return res.status(403).json({
        error: 'Device ID não corresponde ao dispositivo autenticado',
        code: 'DEVICE_MISMATCH'
      });
    }

    const location = await Location.createLocation(locationData);

    // Verificar alertas de localização
    await checkLocationAlerts(location);

    res.status(201).json({
      message: 'Localização registrada com sucesso',
      location_id: location.id
    });
  } catch (error) {
    console.error('Erro ao criar localização:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/locations/bulk - Criar múltiplas localizações (APK)
router.post('/bulk', authenticateDevice, validate(locationSchemas.bulk_create), async (req, res) => {
  try {
    const locationsData = req.body;
    
    // Verificar se todos os device_ids correspondem ao dispositivo autenticado
    const invalidLocations = locationsData.filter(loc => loc.device_id !== req.device.id);
    if (invalidLocations.length > 0) {
      return res.status(403).json({
        error: 'Algumas localizações têm device_id inválido',
        code: 'DEVICE_MISMATCH'
      });
    }

    const locations = await Location.createBulkLocations(locationsData);

    // Verificar alertas apenas para a localização mais recente
    if (locations.length > 0) {
      const latestLocation = locations.reduce((latest, current) => 
        new Date(latest.data_hora) > new Date(current.data_hora) ? latest : current
      );
      await checkLocationAlerts(latestLocation);
    }

    res.status(201).json({
      message: 'Localizações registradas com sucesso',
      total_created: locations.length
    });
  } catch (error) {
    console.error('Erro ao criar localizações em lote:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// PUT /api/locations/:locationId/safe-zone - Marcar zona como segura/perigosa
router.put('/:locationId/safe-zone', authenticateToken, async (req, res) => {
  try {
    const { locationId } = req.params;
    const { is_safe = true } = req.body;

    // Verificar se localização existe e usuário tem acesso
    const location = await Location.findById(locationId);
    if (!location) {
      return res.status(404).json({
        error: 'Localização não encontrada',
        code: 'LOCATION_NOT_FOUND'
      });
    }

    const Device = require('../models/Device');
    const hasAccess = await Device.belongsToUser(location.device_id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Acesso negado a esta localização',
        code: 'LOCATION_ACCESS_DENIED'
      });
    }

    await Location.markSafeZone(locationId, is_safe);

    res.json({
      message: `Localização marcada como ${is_safe ? 'segura' : 'perigosa'} com sucesso`
    });
  } catch (error) {
    console.error('Erro ao marcar zona:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/locations/stats/:deviceId - Estatísticas de localização
router.get('/stats/:deviceId', authenticateToken, verifyDeviceAccess, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { days = 7 } = req.query;

    const stats = await Location.getLocationStats(deviceId, parseInt(days));

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

// Função auxiliar para verificar alertas de localização
async function checkLocationAlerts(location) {
  try {
    const currentHour = new Date(location.data_hora).getHours();
    const isLateHour = currentHour >= 22 || currentHour <= 6; // 22h às 6h

    // Buscar dados do dispositivo para obter user_id
    const Device = require('../models/Device');
    const Children = require('../models/Children');
    
    const device = await Device.findById(location.device_id);
    if (!device) return;

    const child = await Children.findById(device.child_id);
    if (!child) return;

    // 1. Verificar se está em horário inadequado fora de casa
    if (isLateHour) {
      await Alert.createLocationAlert(
        child.user_id,
        location.device_id,
        location,
        'fora_horario'
      );
    }

    // 2. Verificar velocidade suspeita (possível veículo)
    const speed = parseFloat(location.speed) || 0;
    const speedKmh = speed * 3.6; // converter m/s para km/h
    
    if (speedKmh > 80) { // Velocidade suspeita (mais de 80 km/h)
      await Alert.createAlert({
        user_id: child.user_id,
        device_id: location.device_id,
        tipo_alerta: 'localizacao_risco',
        prioridade: 'alta',
        titulo: 'Velocidade alta detectada',
        descricao: `Dispositivo detectado em alta velocidade: ${Math.round(speedKmh)} km/h`,
        dados_extras: {
          latitude: location.latitude,
          longitude: location.longitude,
          speed_kmh: speedKmh,
          endereco: location.endereco,
          alert_type: 'high_speed'
        }
      });
    }

    // 3. Verificar se está muito longe de casa (baseado em histórico)
    await checkDistanceFromHome(location, child.user_id);

    // 4. Verificar zonas de perigo predefinidas
    await checkDangerousZones(location, child.user_id);

    // 5. Verificar se está fora da escola em horário letivo
    await checkSchoolHours(location, child.user_id, currentHour);

  } catch (error) {
    console.error('Erro ao verificar alertas de localização:', error);
  }
}

// Função auxiliar para verificar distância de casa
async function checkDistanceFromHome(location, userId) {
  try {
    // Buscar localizações mais frequentes (assumindo que seja "casa")
    // Implementação simplificada - você pode melhorar com ML/IA
    const recentLocations = await Location.findByDeviceId(location.device_id, {
      limit: 200,
      start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // últimos 30 dias
    });

    if (recentLocations.length < 10) return; // Poucos dados para análise

    // Agrupar localizações por proximidade para encontrar "casa"
    const locationClusters = [];
    const clusterRadius = 0.2; // 200 metros

    for (const loc of recentLocations) {
      let addedToCluster = false;
      
      for (const cluster of locationClusters) {
        const distance = Location.calculateDistance(
          parseFloat(loc.latitude),
          parseFloat(loc.longitude),
          cluster.center_lat,
          cluster.center_lng
        );

        if (distance <= clusterRadius) {
          cluster.count++;
          addedToCluster = true;
          break;
        }
      }

      if (!addedToCluster) {
        locationClusters.push({
          center_lat: parseFloat(loc.latitude),
          center_lng: parseFloat(loc.longitude),
          count: 1
        });
      }
    }

    // Encontrar o cluster com mais ocorrências (provavelmente casa)
    const homeCluster = locationClusters.reduce((max, cluster) => 
      cluster.count > max.count ? cluster : max, { count: 0 }
    );

    if (homeCluster.count < 5) return; // Poucos pontos para definir casa

    // Calcular distância atual de casa
    const distanceFromHome = Location.calculateDistance(
      parseFloat(location.latitude),
      parseFloat(location.longitude),
      homeCluster.center_lat,
      homeCluster.center_lng
    );

    // Alertar se estiver muito longe de casa
    if (distanceFromHome > 10) { // Mais de 10km de casa
      await Alert.createAlert({
        user_id: userId,
        device_id: location.device_id,
        tipo_alerta: 'localizacao_risco',
        prioridade: 'media',
        titulo: 'Muito longe de casa',
        descricao: `Dispositivo está a ${Math.round(distanceFromHome * 100) / 100}km de casa`,
        dados_extras: {
          latitude: location.latitude,
          longitude: location.longitude,
          distance_from_home_km: distanceFromHome,
          home_lat: homeCluster.center_lat,
          home_lng: homeCluster.center_lng,
          alert_type: 'far_from_home'
        }
      });
    }
  } catch (error) {
    console.error('Erro ao verificar distância de casa:', error);
  }
}

// Função auxiliar para verificar zonas de perigo
async function checkDangerousZones(location, userId) {
  try {
    // Zonas de perigo predefinidas (você pode expandir essa lista)
    const dangerousZones = [
      {
        name: 'Centro da cidade - área de risco',
        lat: -23.550520,
        lng: -46.633308,
        radius: 2, // km
        risk_level: 'alto'
      },
      {
        name: 'Área industrial - periculosa',
        lat: -23.520000,
        lng: -46.620000,
        radius: 1.5,
        risk_level: 'medio'
      }
      // Adicione mais zonas conforme necessário
    ];

    for (const zone of dangerousZones) {
      const distance = Location.calculateDistance(
        parseFloat(location.latitude),
        parseFloat(location.longitude),
        zone.lat,
        zone.lng
      );

      if (distance <= zone.radius) {
        const priority = zone.risk_level === 'alto' ? 'critica' : 
                        zone.risk_level === 'medio' ? 'alta' : 'media';

        await Alert.createAlert({
          user_id: userId,
          device_id: location.device_id,
          tipo_alerta: 'localizacao_risco',
          prioridade: priority,
          titulo: 'Zona de risco detectada',
          descricao: `Dispositivo detectado em ${zone.name}`,
          dados_extras: {
            latitude: location.latitude,
            longitude: location.longitude,
            zone_name: zone.name,
            risk_level: zone.risk_level,
            distance_from_center: distance,
            alert_type: 'dangerous_zone'
          }
        });
        break; // Apenas um alerta por zona
      }
    }
  } catch (error) {
    console.error('Erro ao verificar zonas de perigo:', error);
  }
}

// Função auxiliar para verificar horário escolar
async function checkSchoolHours(location, userId, currentHour) {
  try {
    const now = new Date(location.data_hora);
    const dayOfWeek = now.getDay(); // 0 = Domingo, 1 = Segunda, etc.
    
    // Verificar se é dia de semana e horário escolar
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isSchoolHour = currentHour >= 7 && currentHour <= 17;

    if (!isWeekday || !isSchoolHour) return;

    // Buscar localizações da escola (implementação simplificada)
    // Em uma implementação real, você permitiria que os pais definissem a localização da escola
    const schoolLocations = await Location.findByDeviceId(location.device_id, {
      limit: 100,
      start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // última semana
    });

    // Filtrar apenas localizações em horário escolar de dias de semana
    const schoolTimeLocations = schoolLocations.filter(loc => {
      const locDate = new Date(loc.data_hora);
      const locDay = locDate.getDay();
      const locHour = locDate.getHours();
      return locDay >= 1 && locDay <= 5 && locHour >= 7 && locHour <= 17;
    });

    if (schoolTimeLocations.length < 5) return; // Poucos dados

    // Encontrar cluster mais comum em horário escolar (provavelmente escola)
    const schoolCluster = findMostCommonLocation(schoolTimeLocations);
    
    if (!schoolCluster) return;

    // Verificar se está longe da escola em horário letivo
    const distanceFromSchool = Location.calculateDistance(
      parseFloat(location.latitude),
      parseFloat(location.longitude),
      schoolCluster.lat,
      schoolCluster.lng
    );

    if (distanceFromSchool > 2) { // Mais de 2km da escola
      await Alert.createAlert({
        user_id: userId,
        device_id: location.device_id,
        tipo_alerta: 'localizacao_risco',
        prioridade: 'media',
        titulo: 'Fora da escola em horário letivo',
        descricao: `Dispositivo não está na escola durante horário letivo (${currentHour}h)`,
        dados_extras: {
          latitude: location.latitude,
          longitude: location.longitude,
          distance_from_school_km: distanceFromSchool,
          school_lat: schoolCluster.lat,
          school_lng: schoolCluster.lng,
          current_hour: currentHour,
          alert_type: 'out_of_school'
        }
      });
    }
  } catch (error) {
    console.error('Erro ao verificar horário escolar:', error);
  }
}

// Função auxiliar para encontrar localização mais comum
function findMostCommonLocation(locations, radiusKm = 0.5) {
  if (locations.length === 0) return null;

  const clusters = [];
  
  for (const loc of locations) {
    let addedToCluster = false;
    
    for (const cluster of clusters) {
      const distance = Location.calculateDistance(
        parseFloat(loc.latitude),
        parseFloat(loc.longitude),
        cluster.lat,
        cluster.lng
      );

      if (distance <= radiusKm) {
        cluster.count++;
        addedToCluster = true;
        break;
      }
    }

    if (!addedToCluster) {
      clusters.push({
        lat: parseFloat(loc.latitude),
        lng: parseFloat(loc.longitude),
        count: 1
      });
    }
  }

  return clusters.reduce((max, cluster) => 
    cluster.count > max.count ? cluster : max, { count: 0 }
  );
}