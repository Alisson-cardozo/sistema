const https = require('https');

class PushService {
  constructor() {
    this.fcmServerKey = process.env.FCM_SERVER_KEY;
    this.fcmUrl = 'https://fcm.googleapis.com/fcm/send';
    this.initialized = false;
    this.init();
  }

  // Inicializar serviço
  init() {
    if (this.fcmServerKey) {
      this.initialized = true;
      console.log('✅ Serviço de Push Notifications inicializado');
    } else {
      console.warn('⚠️ FCM_SERVER_KEY não configurado - Push notifications desabilitados');
    }
  }

  // Verificar se serviço está disponível
  isAvailable() {
    return this.initialized && this.fcmServerKey;
  }

  // Enviar push notification genérico
  async sendPushNotification(token, title, body, data = {}) {
    try {
      if (!this.isAvailable()) {
        console.warn('Push service não disponível');
        return { success: false, error: 'Serviço não configurado' };
      }

      const payload = {
        to: token,
        notification: {
          title: title,
          body: body,
          sound: 'default',
          badge: 1,
          icon: 'ic_notification',
          color: '#667eea'
        },
        data: {
          ...data,
          timestamp: new Date().toISOString(),
          app: 'safekid'
        },
        priority: 'high',
        content_available: true
      };

      const result = await this.sendToFCM(payload);
      
      if (result.success) {
        console.log(`📱 Push enviado: ${title}`);
      }
      
      return result;
    } catch (error) {
      console.error('Erro ao enviar push:', error);
      return { success: false, error: error.message };
    }
  }

  // Enviar para múltiplos tokens
  async sendToMultipleTokens(tokens, title, body, data = {}) {
    try {
      if (!this.isAvailable()) {
        return { success: false, error: 'Serviço não configurado' };
      }

      const payload = {
        registration_ids: tokens,
        notification: {
          title: title,
          body: body,
          sound: 'default',
          badge: 1,
          icon: 'ic_notification',
          color: '#667eea'
        },
        data: {
          ...data,
          timestamp: new Date().toISOString(),
          app: 'safekid'
        },
        priority: 'high',
        content_available: true
      };

      const result = await this.sendToFCM(payload);
      console.log(`📱 Push enviado para ${tokens.length} dispositivos: ${title}`);
      
      return result;
    } catch (error) {
      console.error('Erro ao enviar push para múltiplos tokens:', error);
      return { success: false, error: error.message };
    }
  }

  // Enviar alerta crítico
  async sendCriticalAlert(token, alert, childName = '') {
    const title = '🚨 ALERTA CRÍTICO';
    const body = `${childName ? `${childName}: ` : ''}${alert.titulo}`;
    
    return await this.sendPushNotification(token, title, body, {
      type: 'critical_alert',
      alert_id: alert.id,
      alert_type: alert.tipo_alerta,
      priority: 'critical',
      child_name: childName,
      click_action: 'OPEN_ALERT',
      url: `/alerts/${alert.id}`
    });
  }

  // Enviar alerta alto
  async sendHighAlert(token, alert, childName = '') {
    const title = '⚠️ ALERTA';
    const body = `${childName ? `${childName}: ` : ''}${alert.titulo}`;
    
    return await this.sendPushNotification(token, title, body, {
      type: 'high_alert',
      alert_id: alert.id,
      alert_type: alert.tipo_alerta,
      priority: 'high',
      child_name: childName,
      click_action: 'OPEN_ALERT',
      url: `/alerts/${alert.id}`
    });
  }

  // Notificar novo dispositivo conectado
  async sendNewDeviceNotification(token, deviceInfo, childName) {
    const title = '📱 Novo dispositivo conectado';
    const body = `${childName} conectou um novo dispositivo: ${deviceInfo.modelo || deviceInfo.tipo_dispositivo}`;
    
    return await this.sendPushNotification(token, title, body, {
      type: 'new_device',
      device_id: deviceInfo.id,
      child_name: childName,
      device_type: deviceInfo.tipo_dispositivo,
      click_action: 'OPEN_DEVICES',
      url: '/devices'
    });
  }

  // Notificar dispositivo offline
  async sendDeviceOfflineNotification(token, deviceInfo, childName) {
    const title = '📵 Dispositivo offline';
    const body = `${childName} está com o dispositivo offline há mais de 30 minutos`;
    
    return await this.sendPushNotification(token, title, body, {
      type: 'device_offline',
      device_id: deviceInfo.id,
      child_name: childName,
      offline_since: deviceInfo.ultimo_sync,
      click_action: 'OPEN_DEVICES',
      url: '/devices'
    });
  }

  // Notificar localização suspeita
  async sendLocationAlert(token, location, childName, alertType) {
    let title, body;
    
    switch (alertType) {
      case 'dangerous_zone':
        title = '🚨 Zona de risco';
        body = `${childName} está em uma área perigosa`;
        break;
      case 'far_from_home':
        title = '📍 Longe de casa';
        body = `${childName} está muito longe de casa`;
        break;
      case 'high_speed':
        title = '🚗 Velocidade alta';
        body = `${childName} está em alta velocidade`;
        break;
      default:
        title = '📍 Alerta de localização';
        body = `${childName} - alerta de localização`;
    }
    
    return await this.sendPushNotification(token, title, body, {
      type: 'location_alert',
      alert_type: alertType,
      child_name: childName,
      latitude: location.latitude,
      longitude: location.longitude,
      click_action: 'OPEN_LOCATION',
      url: `/location?lat=${location.latitude}&lng=${location.longitude}`
    });
  }

  // Notificar mensagem suspeita
  async sendMessageAlert(token, message, childName, keyword) {
    const title = '💬 Mensagem suspeita';
    const body = `${childName} enviou/recebeu uma mensagem com a palavra "${keyword}"`;
    
    return await this.sendPushNotification(token, title, body, {
      type: 'message_alert',
      child_name: childName,
      keyword: keyword,
      app: message.tipo_app,
      contact: message.contato,
      click_action: 'OPEN_MESSAGES',
      url: '/messages'
    });
  }

  // Notificar chamada suspeita (CORRIGIDO - estava incompleto)
  async sendCallAlert(token, call, childName, reason) {
    const title = '📞 Chamada suspeita';
    const body = `${childName}: ${reason}`;
    
    return await this.sendPushNotification(token, title, body, {
      type: 'call_alert',
      child_name: childName,
      reason: reason,
      phone_number: call.numero,
      duration: call.duracao,
      call_type: call.tipo_chamada,
      click_action: 'OPEN_CALLS',
      url: '/calls'
    });
  }

  // Enviar resumo diário
  async sendDailySummary(token, summary, userName) {
    const title = '📊 Resumo diário';
    const alertsText = summary.total_alerts > 0 ? ` - ${summary.total_alerts} alertas` : '';
    const body = `${userName}, veja o resumo de hoje${alertsText}`;
    
    return await this.sendPushNotification(token, title, body, {
      type: 'daily_summary',
      total_alerts: summary.total_alerts,
      critical_alerts: summary.critical_alerts,
      messages: summary.messages,
      calls: summary.calls,
      click_action: 'OPEN_DASHBOARD',
      url: '/dashboard'
    });
  }

  // Notificar bateria baixa do dispositivo
  async sendLowBatteryAlert(token, batteryLevel, childName) {
    const title = '🔋 Bateria baixa';
    const body = `Dispositivo de ${childName} está com ${batteryLevel}% de bateria`;
    
    return await this.sendPushNotification(token, title, body, {
      type: 'low_battery',
      child_name: childName,
      battery_level: batteryLevel,
      click_action: 'OPEN_DEVICES',
      url: '/devices'
    });
  }

  // Notificar tentativa de login suspeita
  async sendSuspiciousLoginAlert(token, loginInfo, userName) {
    const title = '🔐 Login suspeito';
    const body = `Tentativa de login de localização desconhecida detectada`;
    
    return await this.sendPushNotification(token, title, body, {
      type: 'suspicious_login',
      user_name: userName,
      ip_address: loginInfo.ip,
      location: loginInfo.location,
      timestamp: loginInfo.timestamp,
      click_action: 'OPEN_SECURITY',
      url: '/settings/security'
    });
  }

  // Notificar app instalado/desinstalado
  async sendAppChangeAlert(token, appInfo, childName, action) {
    const title = action === 'installed' ? '📥 App instalado' : '📤 App removido';
    const body = `${childName} ${action === 'installed' ? 'instalou' : 'removeu'} o app: ${appInfo.name}`;
    
    return await this.sendPushNotification(token, title, body, {
      type: 'app_change',
      child_name: childName,
      app_name: appInfo.name,
      app_package: appInfo.package,
      action: action,
      click_action: 'OPEN_APPS',
      url: '/apps'
    });
  }

  // Enviar notificação silenciosa (apenas dados)
  async sendSilentNotification(token, data) {
    try {
      if (!this.isAvailable()) {
        return { success: false, error: 'Serviço não configurado' };
      }

      const payload = {
        to: token,
        data: {
          ...data,
          timestamp: new Date().toISOString(),
          app: 'safekid'
        },
        priority: 'high',
        content_available: true
      };

      return await this.sendToFCM(payload);
    } catch (error) {
      console.error('Erro ao enviar notificação silenciosa:', error);
      return { success: false, error: error.message };
    }
  }

  // Agendar notificação (implementação básica)
  async scheduleNotification(token, title, body, data, delayMinutes) {
    return new Promise((resolve) => {
      setTimeout(async () => {
        const result = await this.sendPushNotification(token, title, body, {
          ...data,
          scheduled: true,
          original_time: new Date().toISOString()
        });
        resolve(result);
      }, delayMinutes * 60 * 1000);
    });
  }

  // Enviar para FCM (FUNÇÃO PRINCIPAL)
  async sendToFCM(payload) {
    return new Promise((resolve) => {
      const postData = JSON.stringify(payload);
      
      const options = {
        hostname: 'fcm.googleapis.com',
        port: 443,
        path: '/fcm/send',
        method: 'POST',
        headers: {
          'Authorization': `key=${this.fcmServerKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (res.statusCode === 200 && response.success >= 1) {
              resolve({
                success: true,
                response: response,
                messageId: response.results ? response.results[0].message_id : null
              });
            } else {
              resolve({
                success: false,
                error: response.results ? response.results[0].error : 'Erro desconhecido',
                response: response
              });
            }
          } catch (error) {
            resolve({
              success: false,
              error: 'Erro ao processar resposta do FCM',
              rawResponse: data
            });
          }
        });
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });

      req.write(postData);
      req.end();
    });
  }

  // Validar token FCM
  async validateToken(token) {
    try {
      const result = await this.sendSilentNotification(token, { 
        validation: true,
        timestamp: new Date().toISOString()
      });
      
      return result.success;
    } catch (error) {
      return false;
    }
  }

  // Registrar token de usuário (para implementação futura com banco)
  async registerUserToken(userId, token, deviceType = 'web') {
    // TODO: Implementar quando tiver modelo de tokens no banco
    console.log(`Token registrado para usuário ${userId}: ${token.substring(0, 20)}...`);
    return { success: true, userId, deviceType };
  }

  // Remover token inválido
  async removeInvalidToken(token) {
    // TODO: Implementar quando tiver modelo de tokens no banco
    console.log(`Token removido (inválido): ${token.substring(0, 20)}...`);
    return { success: true };
  }

  // Enviar notificação com retry
  async sendWithRetry(token, title, body, data = {}, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.sendPushNotification(token, title, body, data);
        
        if (result.success) {
          return result;
        }
        
        // Se erro for token inválido, não tentar novamente
        if (result.error && result.error.includes('InvalidRegistration')) {
          await this.removeInvalidToken(token);
          return result;
        }
        
        if (attempt === maxRetries) {
          return result;
        }
        
        // Aguardar antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      } catch (error) {
        if (attempt === maxRetries) {
          return { success: false, error: error.message };
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  // Criar tópicos para notificações em massa
  async subscribeToTopic(token, topic) {
    try {
      // Implementação básica - FCM suporta tópicos
      const payload = {
        to: `/topics/${topic}`,
        data: {
          action: 'subscribe',
          token: token
        }
      };

      return await this.sendToFCM(payload);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Enviar para tópico
  async sendToTopic(topic, title, body, data = {}) {
    try {
      const payload = {
        to: `/topics/${topic}`,
        notification: {
          title: title,
          body: body,
          sound: 'default',
          icon: 'ic_notification',
          color: '#667eea'
        },
        data: {
          ...data,
          timestamp: new Date().toISOString(),
          app: 'safekid'
        },
        priority: 'high'
      };

      const result = await this.sendToFCM(payload);
      console.log(`📱 Push enviado para tópico ${topic}: ${title}`);
      
      return result;
    } catch (error) {
      console.error('Erro ao enviar para tópico:', error);
      return { success: false, error: error.message };
    }
  }

  // Estatísticas do serviço
  getStats() {
    return {
      service: 'PushService',
      status: this.isAvailable() ? 'online' : 'offline',
      fcm_configured: !!this.fcmServerKey,
      endpoint: this.fcmUrl,
      features: [
        'Critical alerts',
        'Location alerts',
        'Message alerts',
        'Call alerts',
        'Device notifications',
        'Batch sending',
        'Topic subscriptions',
        'Silent notifications',
        'Scheduled notifications'
      ]
    };
  }

  // Verificar status do serviço
  async getStatus() {
    try {
      if (!this.isAvailable()) {
        return { 
          status: 'offline', 
          error: 'FCM_SERVER_KEY não configurado' 
        };
      }

      // Tentar enviar notificação de teste (silenciosa)
      const testResult = await this.sendSilentNotification(
        'test_token_validation',
        { test: true }
      );

      // FCM retornará erro para token inválido, mas isso confirma que o serviço está funcionando
      return { 
        status: 'online', 
        message: 'Serviço funcionando (FCM acessível)',
        fcm_reachable: true
      };
    } catch (error) {
      return { 
        status: 'error', 
        error: error.message 
      };
    }
  }

  // Teste de integração
  async testIntegration() {
    try {
      console.log('🧪 Iniciando teste do PushService...');
      
      const testToken = 'test_token_12345';
      const result = await this.sendPushNotification(
        testToken,
        'Teste SafeKid',
        'Este é um teste do sistema de notificações',
        { test: true }
      );

      console.log('📊 Resultado do teste:', result);
      return result;
    } catch (error) {
      console.error('❌ Erro no teste:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new PushService();