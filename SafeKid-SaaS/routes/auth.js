const express = require('express');
const jwt = require('jsonwebtoken');
const qrcode = require('qrcode');
const User = require('../models/User');
const { validate, userSchemas } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register - Cadastro de usuário
router.post('/register', validate(userSchemas.register), async (req, res) => {
  try {
    const { nome, email, senha, plano_assinatura } = req.body;

    // Verificar se email já existe
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        error: 'Email já está em uso',
        code: 'EMAIL_ALREADY_EXISTS'
      });
    }

    // Criar usuário
    const newUser = await User.createUser({
      nome,
      email,
      senha,
      plano_assinatura
    });

    // Gerar token JWT
    const token = jwt.sign(
      { 
        userId: newUser.id,
        email: newUser.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: {
        id: newUser.id,
        nome: newUser.nome,
        email: newUser.email,
        plano_assinatura: newUser.plano_assinatura,
        created_at: newUser.created_at
      },
      token
    });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/auth/login - Login de usuário
router.post('/login', validate(userSchemas.login), async (req, res) => {
  try {
    const { email, senha, remember_me } = req.body;

    // Buscar usuário
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        error: 'Email ou senha incorretos',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verificar senha
    const isValidPassword = await User.verifyPassword(senha, user.senha_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Email ou senha incorretos',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verificar se usuário tem 2FA ativado
    if (user['2fa_secret']) {
      // Gerar token temporário para 2FA
      const tempToken = jwt.sign(
        { 
          userId: user.id,
          email: user.email,
          requires2FA: true 
        },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );

      return res.json({
        message: 'Token 2FA requerido',
        requires_2fa: true,
        temp_token: tempToken
      });
    }

    // Atualizar último login
    await User.updateLastLogin(user.id);

    // Gerar token JWT
    const expiresIn = remember_me ? '30d' : '7d';
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email 
      },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    res.json({
      message: 'Login realizado com sucesso',
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        plano_assinatura: user.plano_assinatura,
        ultimo_login: new Date()
      },
      token
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/auth/verify-2fa - Verificação do 2FA
router.post('/verify-2fa', validate(userSchemas.verify2FA), async (req, res) => {
  try {
    const { token: twoFAToken } = req.body;
    const tempToken = req.headers['authorization']?.split(' ')[1];

    if (!tempToken) {
      return res.status(401).json({
        error: 'Token temporário requerido',
        code: 'TEMP_TOKEN_REQUIRED'
      });
    }

    // Verificar token temporário
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        error: 'Token temporário inválido ou expirado',
        code: 'INVALID_TEMP_TOKEN'
      });
    }

    if (!decoded.requires2FA) {
      return res.status(400).json({
        error: 'Token não requer 2FA',
        code: 'INVALID_TOKEN_TYPE'
      });
    }

    // Verificar código 2FA
    const isValid2FA = await User.verify2FA(decoded.userId, twoFAToken);
    if (!isValid2FA) {
      return res.status(401).json({
        error: 'Código 2FA inválido',
        code: 'INVALID_2FA_CODE'
      });
    }

    // Buscar dados do usuário
    const user = await User.findById(decoded.userId);
    
    // Atualizar último login
    await User.updateLastLogin(user.id);

    // Gerar token JWT final
    const finalToken = jwt.sign(
      { 
        userId: user.id,
        email: user.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login com 2FA realizado com sucesso',
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        plano_assinatura: user.plano_assinatura,
        ultimo_login: new Date()
      },
      token: finalToken
    });
  } catch (error) {
    console.error('Erro na verificação 2FA:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/auth/enable-2fa - Ativar 2FA
router.post('/enable-2fa', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Gerar secret para 2FA
    const { secret, qrCode } = await User.generate2FASecret(userId);

    // Gerar QR Code
    const qrCodeImage = await qrcode.toDataURL(qrCode);

    res.json({
      message: '2FA configurado com sucesso',
      secret,
      qr_code: qrCodeImage,
      instructions: 'Use um app como Google Authenticator para escanear o QR Code'
    });
  } catch (error) {
    console.error('Erro ao ativar 2FA:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/auth/disable-2fa - Desativar 2FA
router.post('/disable-2fa', authenticateToken, validate(userSchemas.verify2FA), async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    // Verificar código 2FA antes de desativar
    const isValid2FA = await User.verify2FA(userId, token);
    if (!isValid2FA) {
      return res.status(401).json({
        error: 'Código 2FA inválido',
        code: 'INVALID_2FA_CODE'
      });
    }

    // Remover 2FA
    await User.updateById(userId, { '2fa_secret': null });

    res.json({
      message: '2FA desativado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao desativar 2FA:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/auth/change-password - Alterar senha
router.post('/change-password', authenticateToken, validate(userSchemas.changePassword), async (req, res) => {
  try {
    const { senha_atual, nova_senha } = req.body;
    const userId = req.user.id;

    // Buscar usuário
    const user = await User.findById(userId);
    
    // Verificar senha atual
    const isValidPassword = await User.verifyPassword(senha_atual, user.senha_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Senha atual incorreta',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Alterar senha
    await User.changePassword(userId, nova_senha);

    res.json({
      message: 'Senha alterada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/auth/me - Dados do usuário logado
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findWithChildren(userId);

    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        plano_assinatura: user.plano_assinatura,
        email_verificado: user.email_verificado,
        ultimo_login: user.ultimo_login,
        has_2fa: !!user['2fa_secret'],
        children: user.children,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Erro ao buscar dados do usuário:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/auth/logout - Logout (invalidar token seria necessário usar Redis/blacklist)
router.post('/logout', authenticateToken, (req, res) => {
  // Em uma implementação completa, você adicionaria o token a uma blacklist
  // Por enquanto, apenas retornamos sucesso
  res.json({
    message: 'Logout realizado com sucesso'
  });
});

module.exports = router;