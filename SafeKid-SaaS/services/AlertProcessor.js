const Alert = require('../models/Alert');
const User = require('../models/User');
const EmailService = require('./EmailService');
const PushService = require('./PushService');

class AlertProcessor {
  constructor() {
    this.processingQueue = [];
    this.isProcessing = false;
    this.processInterval = 5000; // 5 segundos
    this.maxRetries = 3;
    
    // Configurações de throttling
    this.throttleConfig = {
      'mensagem_suspeita': { maxPerHour: 10, cooldownMinutes: 15 },
      'chamada_suspeita': { maxPerHour: 5, cooldownMinutes: 30 },
      'localizacao_risco': { maxPerHour: 8, cooldownMinutes: 20 },
      'media_inapropriada': { maxPerHour: 6, cooldownMinutes: 25 },
      'dispositivo_offline': { maxPerHour: 2, cooldownMinutes: 60 },
      'palavra_chave': { maxPerHour: 15, cooldownMinutes: 10 }
    };
    
    // Cache de alertas recentes para throttling
    this.recentAlerts = new Map();
    
    this.init();
  }

  // Inicializar processador
  init() {
    console.log('✅ Processador de Alertas inicializado');
    this.startProcessing();
    
    // Limpar cache a cada hora
    setInterval(() => {
      this.cleanupRecentAlerts();
    }, 60 * 60 * 1000);
  }

  // Iniciar processamento contínuo
  startProcessing() {
    if (!this.isProcessing) {
      this.isProcessing = true;
      this.processQueue();
    }
  }

  // Parar processamento
  stopProcessing() {
    this.isProcessing = false;
  }

  // Adicionar alerta à fila de processamento
  async addAlert(alertData) {
    try {
      // Verificar throttling
      if (this.shouldThrottle(alertData)) {
        console.log(`⏸️ Alerta throttled: ${alertData.tipo_alerta} para usuário ${alertData.user_id}`);
        return { success: false, reason: 'throttled' };
      }

      // Criar alerta no banco
      const alert = await Alert.createAlert(alertData);
      
      // Adicionar à fila de processamento
      this.processingQueue.push({
        alert,
        retries: 0,
        createdAt: Date.now()
      });

      // Marcar no cache para throttling
      this.markAlertInCache(alertData);

      console.log(`🚨 Alerta adicionado à fila: ${alert.titulo}`);
      
      // Se for crítico, processar imediatamente
      if (alert.prioridade === 'critica') {
        await this.processAlertImmediately(alert);
      }

      return { success: true, alertId: alert.id };
    } catch (error) {
      console.error('Erro ao adicionar alerta:', error);
      return { success: false, error: error.message };
    }
  }

  // Verificar se deve aplicar throttling
  shouldThrottle(alertData) {
    const config = this.throttleConfig[alertData.tipo_alerta];
    if (!config) return false;

    const cacheKey = `${alertData.user_id}:${alertData.tipo_alerta}`;
    const recentAlerts = this.recentAlerts.get(cacheKey) || [];
    
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Filtrar alertas da última hora
    const recentAlertsThisHour = recentAlerts.filter(timestamp => timestamp > oneHourAgo);
    
    // Verificar limite por hora
    if (recentAlertsThisHour.length >= config.maxPerHour) {
      return true;
    }

    // Verificar cooldown
    const lastAlert = Math.max(...recentAlertsThisHour, 0);
    const cooldownMs = config.cooldownMinutes * 60 * 1000;
    
    if (now - lastAlert < cooldownMs) {
      return true;
    }

    return false;
  }

  // Marcar alerta no cache
  markAlertInCache(alertData) {
    const cacheKey = `${alertData.user_id}:${alertData.tipo_alerta}`;
    const recentAlerts = this.recentAlerts.get(cacheKey) || [];
    
    recentAlerts.push(Date.now());
    this.recentAlerts.set(cacheKey, recentAlerts);
  }

  // Processar alerta imediatamente (para críticos)
  async processAlertImmediately(alert) {
    try {
      console.log(`⚡ Processando alerta crítico imediatamente: ${alert.titulo}`);
      
      // Buscar dados do usuário
      const user = await User.findById(alert.user_id);
      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      // Enviar notificações imediatas
      const notifications = await Promise.allSettled([
        this.sendEmailNotification(alert, user),
        this.sendPushNotification(alert, user)
      ]);

      // Marcar como enviadas
      await this.updateAlertNotificationStatus(alert, notifications);

      console.log(`✅ Alerta crítico processado: ${alert.id}`);
    } catch (error) {
      console.error('Erro ao processar alerta crítico:', error);
    }
  }

  // Processar fila de alertas
  async processQueue() {
    while (this.isProcessing) {
      try {
        if (this.processingQueue.length === 0) {
          await this.sleep(this.processInterval);
          continue;
        }

        const alertItem = this.processingQueue.shift();
        await this.processAlert(alertItem);
        
      } catch (error) {
        console.error('Erro no processamento da fila:', error);
        await this.sleep(this.processInterval);
      }
    }
  }

  // Processar alerta individual
  async processAlert(alertItem) {
    try {
      const { alert, retries } = alertItem;
      
      console.log(`🔄 Processando alerta: ${alert.titulo} (tentativa ${retries + 1})`);

      // Buscar dados do usuário
      const user = await User.findById(alert.user_id);
      if (!user) {
        console.error(`Usuário não encontrado para alerta ${alert.id}`);
        return;
      }

      // Determinar tipo de notificação baseado na prioridade
      const shouldSendEmail = this.shouldSendEmail(alert);
      const shouldSendPush = this.shouldSendPush(alert);

      const notifications = [];

      // Enviar email se necessário
      if (shouldSendEmail) {
        notifications.push(this.sendEmailNotification(alert, user));
      }

      // Enviar push se necessário
      if (shouldSendPush) {
        notifications.push(this.sendPushNotification(alert, user));
      }

      // Aguardar todas as notificações
      const results = await Promise.allSettled(notifications);

      // Atualizar status das notificações
      await this.updateAlertNotificationStatus(alert, results);

      // Verificar se houve falhas
      const failures = results.filter(result => result.status === 'rejected' || !result.value?.success);
      
      if (failures.length > 0 && retries < this.maxRetries) {
        // Recolocar na fila para retry
        alertItem.retries++;
        this.processingQueue.push(alertItem);
        console.log(`🔄 Alerta ${alert.id} recolocado na fila (retry ${alertItem.retries})`);
      } else {
        console.log(`✅ Alerta processado com sucesso: ${alert.id}`);
      }

    } catch (error) {
      console.error('Erro ao processar alerta:', error);
      
      // Retry se não excedeu o limite
      if (alertItem.retries < this.maxRetries) {
        alertItem.retries++;
        this.processingQueue.push(alertItem);
      }
    }
  }

  // Determinar se deve enviar email
  shouldSendEmail(alert) {
    // Email para prioridades alta e crítica
    return ['alta', 'critica'].includes(alert.prioridade);
  }

  // Determinar se deve enviar push
  shouldSendPush(alert) {
    // Push para todas as prioridades exceto baixa
    return alert.prioridade !== 'baixa';
  }

  // Enviar notificação por email
  async sendEmailNotification(alert, user) {
    try {
      let result;

      switch (alert.prioridade) {
        case 'critica':
          result = await EmailService.sendCriticalAlert(user.email, user.nome, alert);
          break;
        case 'alta':
          result = await EmailService.sendHighAlert(user.email, user.nome, alert);
          break;
        default:
          // Para prioridades médias e baixas, não enviar email
          return { success: true, skipped: true, reason: 'Prioridade não requer email' };
      }

      return result;
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      return { success: false, error: error.message };
    }
  }

  // Enviar notificação push
  async sendPushNotification(alert, user) {
    try {
      // Aqui você precisaria implementar o sistema de tokens de usuários
      // Por enquanto, vamos simular
      const userToken = await this.getUserPushToken(user.id);
      
      if (!userToken) {
        return { success: true, skipped: true, reason: 'Token push não encontrado' };
      }

      let result;

      switch (alert.prioridade) {
        case 'critica':
          result = await PushService.sendCriticalAlert(userToken, alert);
          break;
        case 'alta':
          result = await PushService.sendHighAlert(userToken, alert);
          break;
        default:
          result = await PushService.sendPushNotification(
            userToken,
            alert.titulo,
            alert.descricao,
            { alert_id: alert.id, priority: alert.prioridade }
          );
      }

      return result;
    } catch (error) {
      console.error('Erro ao enviar push:', error);
      return { success: false, error: error.message };
    }
  }

  // Obter token push do usuário (implementação futura)
  async getUserPushToken(userId) {
    // TODO: Implementar quando tiver modelo de tokens no banco
    // Por enquanto retorna null
    return null;
  }

  // Atualizar status das notificações no alerta
  async updateAlertNotificationStatus(alert, notificationResults) {
    try {
      const emailResult = notificationResults.find(r => r.value && !r.value.skipped && r.value.messageId);
      const pushResult = notificationResults.find(r => r.value && !r.value.skipped && !r.value.messageId);

      const emailSent = emailResult?.status === 'fulfilled' && emailResult.value?.success;
      const pushSent = pushResult?.status === 'fulfilled' && pushResult.value?.success;

      await Alert.updateById(alert.id, {
        email_enviado: emailSent,
        push_enviado: pushSent
      });

      if (emailSent) {
        await Alert.markEmailSent(alert.id);
      }
      
      if (pushSent) {
        await Alert.markPushSent(alert.id);
      }

    } catch (error) {
      console.error('Erro ao atualizar status das notificações:', error);
    }
  }

  // Criar alerta de palavra-chave
  async createKeywordAlert(userId, deviceId, keyword, message, messageData) {
    return await this.addAlert({
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
  }

  // Criar alerta de localização
  async createLocationAlert(userId, deviceId, location, alertType) {
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
      case 'far_from_home':
        titulo = 'Muito longe de casa';
        descricao = `Dispositivo está a mais de 10km de casa`;
        prioridade = 'media';
        break;
      case 'high_speed':
        titulo = 'Velocidade alta detectada';
        descricao = `Dispositivo em alta velocidade: ${location.dados_extras?.speed_kmh}km/h`;
        prioridade = 'alta';
        break;
      default:
        titulo = 'Alerta de localização';
        descricao = 'Alerta relacionado à localização do dispositivo';
        prioridade = 'media';
    }

    return await this.addAlert({
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
  }

  // Criar alerta de chamada suspeita
  async createCallAlert(userId, deviceId, call, reason) {
    return await this.addAlert({
      user_id: userId,
      device_id: deviceId,
      tipo_alerta: 'chamada_suspeita',
      prioridade: reason.includes('madrugada') ? 'alta' : 'media',
      titulo: 'Chamada suspeita detectada',
      descricao: `${reason}. Número: ${call.numero}, Duração: ${Math.round(call.duracao / 60)} minutos`,
      dados_extras: {
        call_id: call.id,
        numero: call.numero,
        duracao: call.duracao,
        tipo_chamada: call.tipo_chamada,
        reason: reason
      }
    });
  }

  // Criar alerta de mídia suspeita
  async createMediaAlert(userId, deviceId, media, reason) {
    return await this.addAlert({
      user_id: userId,
      device_id: deviceId,
      tipo_alerta: 'media_inapropriada',
      prioridade: reason.includes('madrugada') ? 'alta' : 'media',
      titulo: 'Mídia suspeita detectada',
      descricao: `${reason}. Arquivo: ${media.nome_arquivo}`,
      dados_extras: {
        media_id: media.id,
        tipo: media.tipo,
        origem: media.origem,
        tamanho_mb: Math.round((media.tamanho_bytes || 0) / (1024 * 1024) * 100) / 100,
        reason: reason
      }
    });
  }

  // Criar alerta de dispositivo offline
  async createOfflineAlert(userId, deviceId, deviceName, lastSeen) {
    return await this.addAlert({
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
  }

  // Processar alertas pendentes (para executar periodicamente)
  async processPendingAlerts() {
    try {
      const pendingAlerts = await Alert.findAlertsForNotification();
      
      for (const alert of pendingAlerts) {
        await this.addAlert(alert);
      }

      console.log(`📋 Processados ${pendingAlerts.length} alertas pendentes`);
    } catch (error) {
      console.error('Erro ao processar alertas pendentes:', error);
    }
  }

  // Enviar resumo diário
  async sendDailySummary(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) return;

      // Buscar estatísticas do dia
      const stats = await Alert.getAlertStats(userId, 1);
      
      // Buscar outras estatísticas (mensagens, chamadas, etc.)
      // TODO: Implementar busca de estatísticas gerais

      const summary = {
        total_alerts: stats.total_alerts,
        critical_alerts: stats.critical_alerts,
        messages: 0, // TODO: buscar do modelo Message
        calls: 0,    // TODO: buscar do modelo Call
        locations: 0 // TODO: buscar do modelo Location
      };

      await EmailService.sendDailySummary(user.email, user.nome, summary);
      
      console.log(`📊 Resumo diário enviado para ${user.email}`);
    } catch (error) {
      console.error('Erro ao enviar resumo diário:', error);
    }
  }

  // Limpar cache de alertas antigos
  cleanupRecentAlerts() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [key, timestamps] of this.recentAlerts.entries()) {
      const validTimestamps = timestamps.filter(ts => ts > oneHourAgo);
      
      if (validTimestamps.length === 0) {
        this.recentAlerts.delete(key);
      } else {
        this.recentAlerts.set(key, validTimestamps);
      }
    }
    
    console.log('🧹 Cache de alertas limpo');
  }

  // Função de sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Obter estatísticas do processador
  getStats() {
    return {
      queueLength: this.processingQueue.length,
      isProcessing: this.isProcessing,
      cacheSize: this.recentAlerts.size,
      throttleConfig: this.throttleConfig,
      maxRetries: this.maxRetries,
      processInterval: this.processInterval
    };
  }

  // Parar processador graciosamente
  async shutdown() {
    console.log('🛑 Parando processador de alertas...');
    this.stopProcessing();
    
    // Aguardar fila esvaziar (máximo 30 segundos)
    let attempts = 0;
    while (this.processingQueue.length > 0 && attempts < 30) {
      await this.sleep(1000);
      attempts++;
    }
    
    console.log('✅ Processador de alertas parado');
  }
}

module.exports = new AlertProcessor();