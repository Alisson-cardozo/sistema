const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.init();
  }

  // Inicializar configuração do email
  async init() {
    try {
      this.transporter = nodemailer.createTransporter({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: false, // true para 465, false para outros ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // Verificar conexão
      await this.transporter.verify();
      this.initialized = true;
      console.log('✅ Serviço de email inicializado com sucesso');
    } catch (error) {
      console.error('❌ Erro ao inicializar serviço de email:', error.message);
      this.initialized = false;
    }
  }

  // Verificar se serviço está disponível
  isAvailable() {
    return this.initialized && this.transporter;
  }

  // Enviar email genérico
  async sendEmail(to, subject, htmlContent, textContent = null) {
    try {
      if (!this.isAvailable()) {
        throw new Error('Serviço de email não está disponível');
      }

      const mailOptions = {
        from: {
          name: 'SafeKid',
          address: process.env.EMAIL_USER
        },
        to: to,
        subject: subject,
        html: htmlContent,
        text: textContent || this.htmlToText(htmlContent)
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`📧 Email enviado para ${to}: ${subject}`);
      return {
        success: true,
        messageId: result.messageId,
        response: result.response
      };
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Enviar email de boas-vindas
  async sendWelcomeEmail(userEmail, userName) {
    const subject = 'Bem-vindo ao SafeKid!';
    const htmlContent = this.generateWelcomeTemplate(userName);
    
    return await this.sendEmail(userEmail, subject, htmlContent);
  }

  // Enviar email de verificação
  async sendVerificationEmail(userEmail, userName, verificationToken) {
    const subject = 'Verifique seu email - SafeKid';
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    const htmlContent = this.generateVerificationTemplate(userName, verificationUrl);
    
    return await this.sendEmail(userEmail, subject, htmlContent);
  }

  // Enviar email de alerta crítico
  async sendCriticalAlert(userEmail, userName, alert) {
    const subject = `🚨 ALERTA CRÍTICO: ${alert.titulo}`;
    const htmlContent = this.generateAlertTemplate(userName, alert, 'critica');
    
    return await this.sendEmail(userEmail, subject, htmlContent);
  }

  // Enviar email de alerta alto
  async sendHighAlert(userEmail, userName, alert) {
    const subject = `⚠️ ALERTA: ${alert.titulo}`;
    const htmlContent = this.generateAlertTemplate(userName, alert, 'alta');
    
    return await this.sendEmail(userEmail, subject, htmlContent);
  }

  // Enviar resumo diário
  async sendDailySummary(userEmail, userName, summary) {
    const subject = 'Resumo Diário - SafeKid';
    const htmlContent = this.generateDailySummaryTemplate(userName, summary);
    
    return await this.sendEmail(userEmail, subject, htmlContent);
  }

  // Enviar email de recuperação de senha
  async sendPasswordReset(userEmail, userName, resetToken) {
    const subject = 'Recuperação de Senha - SafeKid';
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const htmlContent = this.generatePasswordResetTemplate(userName, resetUrl);
    
    return await this.sendEmail(userEmail, subject, htmlContent);
  }

  // Enviar notificação de novo dispositivo
  async sendNewDeviceAlert(userEmail, userName, deviceInfo, childName) {
    const subject = `Novo dispositivo conectado - ${childName}`;
    const htmlContent = this.generateNewDeviceTemplate(userName, deviceInfo, childName);
    
    return await this.sendEmail(userEmail, subject, htmlContent);
  }

  // Template de boas-vindas
  generateWelcomeTemplate(userName) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bem-vindo ao SafeKid</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
            .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🛡️ SafeKid</h1>
            <h2>Bem-vindo à família SafeKid!</h2>
        </div>
        <div class="content">
            <h3>Olá, ${userName}!</h3>
            <p>Obrigado por escolher o SafeKid para proteger sua família. Agora você tem acesso a:</p>
            <ul>
                <li>🔍 Monitoramento em tempo real</li>
                <li>📱 Rastreamento de mensagens e chamadas</li>
                <li>📍 Localização GPS precisa</li>
                <li>🚨 Alertas inteligentes</li>
                <li>📊 Relatórios detalhados</li>
            </ul>
            <p>Para começar, acesse seu painel:</p>
            <p style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Acessar Painel</a>
            </p>
            <p><strong>Precisa de ajuda?</strong> Nossa equipe está sempre disponível para te apoiar.</p>
        </div>
        <div class="footer">
            <p>SafeKid - Protegendo famílias com tecnologia</p>
            <p>Este email foi enviado para ${userName}</p>
        </div>
    </body>
    </html>`;
  }

  // Template de verificação de email
  generateVerificationTemplate(userName, verificationUrl) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verificar Email</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
            .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>✉️ Verificação de Email</h1>
        </div>
        <div class="content">
            <h3>Olá, ${userName}!</h3>
            <p>Para completar seu cadastro no SafeKid, precisamos verificar seu email.</p>
            <p>Clique no botão abaixo para verificar:</p>
            <p style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verificar Email</a>
            </p>
            <p><strong>Importante:</strong> Este link expira em 24 horas.</p>
            <p>Se você não criou uma conta no SafeKid, ignore este email.</p>
        </div>
        <div class="footer">
            <p>SafeKid - Protegendo famílias com tecnologia</p>
        </div>
    </body>
    </html>`;
  }

  // Template de alerta
  generateAlertTemplate(userName, alert, priority) {
    const priorityColors = {
      'critica': '#f44336',
      'alta': '#ff9800',
      'media': '#2196f3',
      'baixa': '#4caf50'
    };

    const priorityIcons = {
      'critica': '🚨',
      'alta': '⚠️',
      'media': '📢',
      'baixa': 'ℹ️'
    };

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Alerta SafeKid</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .header { background: ${priorityColors[priority]}; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .alert-box { background: white; border-left: 4px solid ${priorityColors[priority]}; padding: 15px; margin: 10px 0; }
            .button { display: inline-block; background: ${priorityColors[priority]}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
            .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>${priorityIcons[priority]} ALERTA SAFEKID</h1>
            <h2>${alert.titulo}</h2>
        </div>
        <div class="content">
            <h3>Olá, ${userName}!</h3>
            <div class="alert-box">
                <p><strong>Tipo:</strong> ${alert.tipo_alerta}</p>
                <p><strong>Prioridade:</strong> ${priority.toUpperCase()}</p>
                <p><strong>Hora:</strong> ${new Date(alert.data_hora).toLocaleString('pt-BR')}</p>
                <p><strong>Descrição:</strong> ${alert.descricao}</p>
                ${alert.dados_extras ? `<p><strong>Detalhes:</strong> ${JSON.stringify(alert.dados_extras, null, 2)}</p>` : ''}
            </div>
            <p style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/alerts/${alert.id}" class="button">Ver Detalhes</a>
            </p>
        </div>
        <div class="footer">
            <p>SafeKid - Protegendo famílias com tecnologia</p>
        </div>
    </body>
    </html>`;
  }

  // Template de resumo diário
  generateDailySummaryTemplate(userName, summary) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resumo Diário</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .header { background: #2196f3; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .summary-box { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; }
            .stats { display: flex; justify-content: space-around; }
            .stat { text-align: center; }
            .button { display: inline-block; background: #2196f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
            .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📊 Resumo Diário</h1>
        </div>
        <div class="content">
            <h3>Olá, ${userName}!</h3>
            <p>Aqui está o resumo das atividades de hoje:</p>
            
            <div class="summary-box">
                <h4>📱 Atividades</h4>
                <div class="stats">
                    <div class="stat">
                        <strong>${summary.messages || 0}</strong><br>
                        Mensagens
                    </div>
                    <div class="stat">
                        <strong>${summary.calls || 0}</strong><br>
                        Chamadas
                    </div>
                    <div class="stat">
                        <strong>${summary.locations || 0}</strong><br>
                        Localizações
                    </div>
                </div>
            </div>

            <div class="summary-box">
                <h4>🚨 Alertas</h4>
                <p>Total de alertas: <strong>${summary.total_alerts || 0}</strong></p>
                <p>Alertas críticos: <strong>${summary.critical_alerts || 0}</strong></p>
            </div>

            <p style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Ver Painel Completo</a>
            </p>
        </div>
        <div class="footer">
            <p>SafeKid - Protegendo famílias com tecnologia</p>
        </div>
    </body>
    </html>`;
  }

  // Template de recuperação de senha
  generatePasswordResetTemplate(userName, resetUrl) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recuperação de Senha</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .header { background: #ff9800; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .button { display: inline-block; background: #ff9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
            .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🔐 Recuperação de Senha</h1>
        </div>
        <div class="content">
            <h3>Olá, ${userName}!</h3>
            <p>Recebemos uma solicitação para redefinir sua senha no SafeKid.</p>
            <p>Clique no botão abaixo para criar uma nova senha:</p>
            <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Redefinir Senha</a>
            </p>
            <p><strong>Importante:</strong> Este link expira em 1 hora por segurança.</p>
            <p>Se você não solicitou a recuperação de senha, ignore este email.</p>
        </div>
        <div class="footer">
            <p>SafeKid - Protegendo famílias com tecnologia</p>
        </div>
    </body>
    </html>`;
  }

  // Template de novo dispositivo
  generateNewDeviceTemplate(userName, deviceInfo, childName) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Novo Dispositivo Conectado</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .header { background: #4caf50; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .device-box { background: white; border-left: 4px solid #4caf50; padding: 15px; margin: 10px 0; }
            .button { display: inline-block; background: #4caf50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
            .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📱 Novo Dispositivo Conectado</h1>
        </div>
        <div class="content">
            <h3>Olá, ${userName}!</h3>
            <p>Um novo dispositivo foi conectado ao SafeKid para <strong>${childName}</strong>:</p>
            
            <div class="device-box">
                <p><strong>Tipo:</strong> ${deviceInfo.tipo_dispositivo}</p>
                <p><strong>Modelo:</strong> ${deviceInfo.modelo || 'Não informado'}</p>
                <p><strong>Sistema:</strong> ${deviceInfo.versao_os || 'Não informado'}</p>
                <p><strong>Conectado em:</strong> ${new Date().toLocaleString('pt-BR')}</p>
            </div>

            <p>O monitoramento já está ativo. Verifique o painel para mais detalhes:</p>
            <p style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/devices" class="button">Ver Dispositivos</a>
            </p>
        </div>
        <div class="footer">
            <p>SafeKid - Protegendo famílias com tecnologia</p>
        </div>
    </body>
    </html>`;
  }

  // Converter HTML para texto simples
  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, '') // Remove tags HTML
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Enviar email com retry
  async sendEmailWithRetry(to, subject, htmlContent, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.sendEmail(to, subject, htmlContent);
        if (result.success) {
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

  // Verificar status do serviço
  async getStatus() {
    try {
      if (!this.isAvailable()) {
        return { status: 'offline', error: 'Serviço não inicializado' };
      }

      await this.transporter.verify();
      return { status: 'online', message: 'Serviço funcionando normalmente' };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }
}

module.exports = new EmailService();