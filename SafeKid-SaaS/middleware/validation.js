const Joi = require('joi');

// Middleware para validar dados da requisição
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      return res.status(400).json({
        error: 'Dados inválidos',
        code: 'VALIDATION_ERROR',
        details: errors
      });
    }

    // Substituir dados originais pelos validados
    req[property] = value;
    next();
  };
};

// Schemas de validação para usuários
const userSchemas = {
  register: Joi.object({
    nome: Joi.string().min(2).max(255).required().messages({
      'string.min': 'Nome deve ter pelo menos 2 caracteres',
      'string.max': 'Nome deve ter no máximo 255 caracteres',
      'any.required': 'Nome é obrigatório'
    }),
    email: Joi.string().email().max(255).required().messages({
      'string.email': 'Email deve ter um formato válido',
      'any.required': 'Email é obrigatório'
    }),
    senha: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required().messages({
      'string.min': 'Senha deve ter pelo menos 8 caracteres',
      'string.pattern.base': 'Senha deve conter pelo menos: 1 letra minúscula, 1 maiúscula, 1 número e 1 caractere especial',
      'any.required': 'Senha é obrigatória'
    }),
    plano_assinatura: Joi.string().valid('basico', 'premium').default('basico')
  }),

  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Email deve ter um formato válido',
      'any.required': 'Email é obrigatório'
    }),
    senha: Joi.string().required().messages({
      'any.required': 'Senha é obrigatória'
    }),
    remember_me: Joi.boolean().default(false)
  }),

  verify2FA: Joi.object({
    token: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      'string.length': 'Token deve ter 6 dígitos',
      'string.pattern.base': 'Token deve conter apenas números',
      'any.required': 'Token é obrigatório'
    })
  }),

  changePassword: Joi.object({
    senha_atual: Joi.string().required().messages({
      'any.required': 'Senha atual é obrigatória'
    }),
    nova_senha: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required().messages({
      'string.min': 'Nova senha deve ter pelo menos 8 caracteres',
      'string.pattern.base': 'Nova senha deve conter pelo menos: 1 letra minúscula, 1 maiúscula, 1 número e 1 caractere especial',
      'any.required': 'Nova senha é obrigatória'
    })
  })
};

// Schemas de validação para filhos
const childrenSchemas = {
  create: Joi.object({
    nome: Joi.string().min(2).max(255).required().messages({
      'string.min': 'Nome deve ter pelo menos 2 caracteres',
      'string.max': 'Nome deve ter no máximo 255 caracteres',
      'any.required': 'Nome é obrigatório'
    }),
    idade: Joi.number().integer().min(1).max(18).required().messages({
      'number.min': 'Idade deve ser pelo menos 1 ano',
      'number.max': 'Idade deve ser no máximo 18 anos',
      'any.required': 'Idade é obrigatória'
    }),
    foto_perfil: Joi.string().uri().optional()
  }),

  update: Joi.object({
    nome: Joi.string().min(2).max(255).optional(),
    idade: Joi.number().integer().min(1).max(18).optional(),
    foto_perfil: Joi.string().uri().optional(),
    ativo: Joi.boolean().optional()
  })
};

// Schemas de validação para dispositivos
const deviceSchemas = {
  register: Joi.object({
    child_id: Joi.string().uuid().required().messages({
      'string.guid': 'ID do filho deve ser um UUID válido',
      'any.required': 'ID do filho é obrigatório'
    }),
    tipo_dispositivo: Joi.string().valid('android', 'ios').required().messages({
      'any.only': 'Tipo de dispositivo deve ser android ou ios',
      'any.required': 'Tipo de dispositivo é obrigatório'
    }),
    uuid: Joi.string().min(10).max(255).required().messages({
      'string.min': 'UUID do dispositivo deve ter pelo menos 10 caracteres',
      'any.required': 'UUID do dispositivo é obrigatório'
    }),
    modelo: Joi.string().max(255).optional(),
    versao_os: Joi.string().max(50).optional(),
    app_version: Joi.string().max(20).optional()
  }),

  updateStatus: Joi.object({
    status_online: Joi.boolean().required().messages({
      'any.required': 'Status online é obrigatório'
    })
  })
};

// Schemas de validação para mensagens
const messageSchemas = {
  create: Joi.object({
    device_id: Joi.string().uuid().required(),
    tipo_app: Joi.string().valid('whatsapp', 'telegram', 'sms').required(),
    contato: Joi.string().min(1).max(255).required(),
    mensagem: Joi.string().required(),
    direcao: Joi.string().valid('enviada', 'recebida').required(),
    grupo: Joi.string().max(255).optional(),
    is_grupo: Joi.boolean().default(false),
    attachment_path: Joi.string().max(500).optional(),
    attachment_type: Joi.string().valid('image', 'video', 'audio', 'document').optional(),
    data_hora: Joi.date().iso().required()
  }),

  bulk_create: Joi.array().items(
    Joi.object({
      device_id: Joi.string().uuid().required(),
      tipo_app: Joi.string().valid('whatsapp', 'telegram', 'sms').required(),
      contato: Joi.string().min(1).max(255).required(),
      mensagem: Joi.string().required(),
      direcao: Joi.string().valid('enviada', 'recebida').required(),
      grupo: Joi.string().max(255).optional(),
      is_grupo: Joi.boolean().default(false),
      attachment_path: Joi.string().max(500).optional(),
      attachment_type: Joi.string().valid('image', 'video', 'audio', 'document').optional(),
      data_hora: Joi.date().iso().required()
    })
  ).max(100).required()
};

// Schemas de validação para chamadas
const callSchemas = {
  create: Joi.object({
    device_id: Joi.string().uuid().required(),
    tipo_chamada: Joi.string().valid('celular', 'whatsapp', 'telegram').required(),
    numero: Joi.string().min(1).max(50).required(),
    contato_nome: Joi.string().max(255).optional(),
    direcao: Joi.string().valid('enviada', 'recebida', 'perdida').required(),
    duracao: Joi.number().integer().min(0).default(0),
    data_hora: Joi.date().iso().required()
  }),

  bulk_create: Joi.array().items(
    Joi.object({
      device_id: Joi.string().uuid().required(),
      tipo_chamada: Joi.string().valid('celular', 'whatsapp', 'telegram').required(),
      numero: Joi.string().min(1).max(50).required(),
      contato_nome: Joi.string().max(255).optional(),
      direcao: Joi.string().valid('enviada', 'recebida', 'perdida').required(),
      duracao: Joi.number().integer().min(0).default(0),
      data_hora: Joi.date().iso().required()
    })
  ).max(100).required()
};

// Schemas de validação para localização
const locationSchemas = {
  create: Joi.object({
    device_id: Joi.string().uuid().required(),
    latitude: Joi.number().min(-90).max(90).required().messages({
      'number.min': 'Latitude deve estar entre -90 e 90',
      'number.max': 'Latitude deve estar entre -90 e 90'
    }),
    longitude: Joi.number().min(-180).max(180).required().messages({
      'number.min': 'Longitude deve estar entre -180 e 180',
      'number.max': 'Longitude deve estar entre -180 e 180'
    }),
    accuracy: Joi.number().positive().optional(),
    altitude: Joi.number().optional(),
    speed: Joi.number().min(0).optional(),
    endereco: Joi.string().max(500).optional(),
    lugar_nome: Joi.string().max(255).optional(),
    data_hora: Joi.date().iso().required()
  }),

  bulk_create: Joi.array().items(
    Joi.object({
      device_id: Joi.string().uuid().required(),
      latitude: Joi.number().min(-90).max(90).required(),
      longitude: Joi.number().min(-180).max(180).required(),
      accuracy: Joi.number().positive().optional(),
      altitude: Joi.number().optional(),
      speed: Joi.number().min(0).optional(),
      endereco: Joi.string().max(500).optional(),
      lugar_nome: Joi.string().max(255).optional(),
      data_hora: Joi.date().iso().required()
    })
  ).max(50).required()
};

// Schemas de validação para mídia
const mediaSchemas = {
  create: Joi.object({
    device_id: Joi.string().uuid().required(),
    tipo: Joi.string().valid('foto', 'video', 'audio').required(),
    origem: Joi.string().valid('camera', 'galeria', 'download', 'whatsapp', 'telegram').required(),
    nome_arquivo: Joi.string().min(1).max(255).required(),
    tamanho_bytes: Joi.number().integer().positive().optional(),
    mime_type: Joi.string().max(100).optional(),
    duracao: Joi.number().integer().positive().optional(),
    descricao: Joi.string().optional(),
    data_criacao: Joi.date().iso().required(),
    data_hora: Joi.date().iso().required()
  })
};

// Schemas de validação para alertas
const alertSchemas = {
  create: Joi.object({
    user_id: Joi.string().uuid().required(),
    device_id: Joi.string().uuid().optional(),
    tipo_alerta: Joi.string().valid(
      'mensagem_suspeita',
      'chamada_suspeita',
      'localizacao_risco',
      'media_inapropriada',
      'app_bloqueado',
      'dispositivo_offline',
      'palavra_chave',
      'horario_limite'
    ).required(),
    prioridade: Joi.string().valid('baixa', 'media', 'alta', 'critica').default('media'),
    titulo: Joi.string().min(1).max(255).required(),
    descricao: Joi.string().required(),
    dados_extras: Joi.object().optional()
  }),

  markAsRead: Joi.object({
    alert_ids: Joi.array().items(Joi.string().uuid()).min(1).max(100).required()
  })
};

// Schemas de validação para query parameters
const querySchemas = {
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort_by: Joi.string().optional(),
    sort_order: Joi.string().valid('asc', 'desc').default('desc')
  }),

  dateRange: Joi.object({
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
    days: Joi.number().integer().min(1).max(365).optional()
  }).and('start_date', 'end_date'),

  messageFilters: Joi.object({
    tipo_app: Joi.string().valid('whatsapp', 'telegram', 'sms').optional(),
    contato: Joi.string().optional(),
    flagged: Joi.boolean().optional(),
    is_grupo: Joi.boolean().optional()
  }),

  locationFilters: Joi.object({
    is_safe_zone: Joi.boolean().optional(),
    radius: Joi.number().positive().optional(),
    center_lat: Joi.number().min(-90).max(90).optional(),
    center_lng: Joi.number().min(-180).max(180).optional()
  })
};

module.exports = {
  validate,
  userSchemas,
  childrenSchemas,
  deviceSchemas,
  messageSchemas,
  callSchemas,
  locationSchemas,
  mediaSchemas,
  alertSchemas,
  querySchemas
};