const BaseModel = require('./BaseModel');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');

class User extends BaseModel {
  constructor() {
    super('users');
  }

  // Criar usuário com senha hasheada
  async createUser(userData) {
    try {
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(userData.senha, saltRounds);

      const newUser = await this.create({
        nome: userData.nome,
        email: userData.email.toLowerCase(),
        senha_hash: hashedPassword,
        plano_assinatura: userData.plano_assinatura || 'basico'
      });

      // Remover senha do retorno
      delete newUser.senha_hash;
      return newUser;
    } catch (error) {
      throw new Error(`Erro ao criar usuário: ${error.message}`);
    }
  }

  // Buscar usuário por email
  async findByEmail(email) {
    try {
      const user = await this.findOne({ email: email.toLowerCase() });
      return user;
    } catch (error) {
      throw new Error(`Erro ao buscar usuário por email: ${error.message}`);
    }
  }

  // Verificar senha
  async verifyPassword(plainPassword, hashedPassword) {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      throw new Error(`Erro ao verificar senha: ${error.message}`);
    }
  }

  // Gerar secret para 2FA
  async generate2FASecret(userId) {
    try {
      const secret = speakeasy.generateSecret({
        name: 'SafeKid',
        length: 32
      });

      await this.updateById(userId, {
        '2fa_secret': secret.base32
      });

      return {
        secret: secret.base32,
        qrCode: secret.otpauth_url
      };
    } catch (error) {
      throw new Error(`Erro ao gerar 2FA: ${error.message}`);
    }
  }

  // Verificar token 2FA
  async verify2FA(userId, token) {
    try {
      const user = await this.findById(userId);
      if (!user || !user['2fa_secret']) {
        return false;
      }

      return speakeasy.totp.verify({
        secret: user['2fa_secret'],
        encoding: 'base32',
        token: token,
        window: 2
      });
    } catch (error) {
      throw new Error(`Erro ao verificar 2FA: ${error.message}`);
    }
  }

  // Atualizar último login
  async updateLastLogin(userId) {
    try {
      return await this.updateById(userId, {
        ultimo_login: new Date()
      });
    } catch (error) {
      throw new Error(`Erro ao atualizar último login: ${error.message}`);
    }
  }

  // Alterar senha
  async changePassword(userId, newPassword) {
    try {
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      return await this.updateById(userId, {
        senha_hash: hashedPassword
      });
    } catch (error) {
      throw new Error(`Erro ao alterar senha: ${error.message}`);
    }
  }

  // Buscar usuário com filhos
  async findWithChildren(userId) {
    try {
      const user = await this.db('users')
        .select('users.*')
        .where('users.id', userId)
        .first();

      if (!user) return null;

      const children = await this.db('children')
        .where('user_id', userId)
        .orderBy('created_at', 'desc');

      delete user.senha_hash;
      return {
        ...user,
        children
      };
    } catch (error) {
      throw new Error(`Erro ao buscar usuário com filhos: ${error.message}`);
    }
  }

  // Verificar se pode adicionar mais filhos baseado no plano
  async canAddMoreChildren(userId) {
    try {
      const user = await this.findById(userId);
      const childrenCount = await this.db('children')
        .where('user_id', userId)
        .count('* as count')
        .first();

      const count = parseInt(childrenCount.count);
      
      if (user.plano_assinatura === 'basico') {
        return count < 2; // Plano básico: máximo 2 filhos
      } else if (user.plano_assinatura === 'premium') {
        return count < 10; // Plano premium: máximo 10 filhos
      }

      return false;
    } catch (error) {
      throw new Error(`Erro ao verificar limite de filhos: ${error.message}`);
    }
  }
}

module.exports = new User();