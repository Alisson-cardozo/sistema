/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('device_id').nullable().references('id').inTable('devices').onDelete('CASCADE');
    table.enum('tipo_alerta', [
      'mensagem_suspeita',
      'chamada_suspeita', 
      'localizacao_risco',
      'media_inapropriada',
      'app_bloqueado',
      'dispositivo_offline',
      'palavra_chave',
      'horario_limite'
    ]).notNullable();
    table.enum('prioridade', ['baixa', 'media', 'alta', 'critica']).defaultTo('media');
    table.string('titulo', 255).notNullable();
    table.text('descricao').notNullable();
    table.json('dados_extras').nullable(); // dados específicos do alerta
    table.boolean('lido').defaultTo(false);
    table.boolean('email_enviado').defaultTo(false);
    table.boolean('push_enviado').defaultTo(false);
    table.timestamp('data_hora').notNullable();
    table.timestamps(true, true);
    
    // Índices
    table.index(['user_id']);
    table.index(['device_id']);
    table.index(['tipo_alerta']);
    table.index(['prioridade']);
    table.index(['lido']);
    table.index(['data_hora']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('alerts');
};