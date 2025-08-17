const express = require('express');
const Children = require('../models/Children');
const User = require('../models/User');
const { validate, childrenSchemas, querySchemas } = require('../middleware/validation');
const { authenticateToken, verifyChildAccess } = require('../middleware/auth');

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// GET /api/children - Listar filhos do usuário
router.get('/', validate(querySchemas.pagination, 'query'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { include_devices, include_stats } = req.query;

    let children;
    
    if (include_stats === 'true') {
      // Buscar filhos com alertas não lidos
      children = await Children.findWithUnreadAlerts(userId);
    } else {
      // Buscar filhos normalmente
      children = await Children.findByUserId(userId, include_devices === 'true');
    }

    res.json({
      children,
      total: children.length,
      user_plan: req.user.plano_assinatura
    });
  } catch (error) {
    console.error('Erro ao listar filhos:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/children/:childId - Buscar filho específico
router.get('/:childId', verifyChildAccess, async (req, res) => {
  try {
    const { childId } = req.params;
    const userId = req.user.id;
    const { include_stats } = req.query;

    let child;
    
    if (include_stats === 'true') {
      child = await Children.findWithStats(childId, userId);
    } else {
      child = await Children.findById(childId);
    }

    if (!child) {
      return res.status(404).json({
        error: 'Filho não encontrado',
        code: 'CHILD_NOT_FOUND'
      });
    }

    res.json({ child });
  } catch (error) {
    console.error('Erro ao buscar filho:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/children - Criar novo filho
router.post('/', validate(childrenSchemas.create), async (req, res) => {
  try {
    const userId = req.user.id;
    const { nome, idade, foto_perfil } = req.body;

    // Verificar se usuário pode adicionar mais filhos
    const canAdd = await User.canAddMoreChildren(userId);
    if (!canAdd) {
      return res.status(403).json({
        error: 'Limite de filhos atingido para seu plano',
        code: 'CHILDREN_LIMIT_REACHED',
        current_plan: req.user.plano_assinatura
      });
    }

    // Criar filho
    const newChild = await Children.create({
      user_id: userId,
      nome,
      idade,
      foto_perfil
    });

    res.status(201).json({
      message: 'Filho adicionado com sucesso',
      child: newChild
    });
  } catch (error) {
    console.error('Erro ao criar filho:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// PUT /api/children/:childId - Atualizar filho
router.put('/:childId', verifyChildAccess, validate(childrenSchemas.update), async (req, res) => {
  try {
    const { childId } = req.params;
    const updateData = req.body;

    const updatedChild = await Children.updateById(childId, updateData);

    if (!updatedChild) {
      return res.status(404).json({
        error: 'Filho não encontrado',
        code: 'CHILD_NOT_FOUND'
      });
    }

    res.json({
      message: 'Filho atualizado com sucesso',
      child: updatedChild
    });
  } catch (error) {
    console.error('Erro ao atualizar filho:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/children/:childId/toggle-monitoring - Ativar/Desativar monitoramento
router.post('/:childId/toggle-monitoring', verifyChildAccess, async (req, res) => {
  try {
    const { childId } = req.params;
    const userId = req.user.id;
    const { ativo } = req.body;

    if (typeof ativo !== 'boolean') {
      return res.status(400).json({
        error: 'Campo ativo deve ser boolean',
        code: 'INVALID_ACTIVE_VALUE'
      });
    }

    const updatedChild = await Children.toggleMonitoring(childId, userId, ativo);

    res.json({
      message: `Monitoramento ${ativo ? 'ativado' : 'desativado'} com sucesso`,
      child: updatedChild
    });
  } catch (error) {
    console.error('Erro ao alterar monitoramento:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// DELETE /api/children/:childId - Deletar filho
router.delete('/:childId', verifyChildAccess, async (req, res) => {
  try {
    const { childId } = req.params;

    const deleted = await Children.deleteById(childId);

    if (!deleted) {
      return res.status(404).json({
        error: 'Filho não encontrado',
        code: 'CHILD_NOT_FOUND'
      });
    }

    res.json({
      message: 'Filho removido com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar filho:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;