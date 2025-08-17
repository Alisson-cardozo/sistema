/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.enum('tipo_app', ['whatsapp', 'telegram', 'sms']).notNullable();
    table.string('contato', 255).notNullable();
    table.text('mensagem').notNullable();
    table.enum('direcao', ['enviada', 'recebida']).notNullable();
    table.string('grupo', 255).nullable();
    table.boolean('is_grupo').defaultTo(false);
    table.string('attachment_path', 500).nullable();
    table.enum('attachment_type', ['image', 'video', 'audio', 'document']).nullable();
    table.boolean('flagged').defaultTo(false);
    table.timestamp('data_hora').notNullable();
    table.timestamps(true, true);
    
    // Índices
    table.index(['device_id']);
    table.index(['tipo_app']);
    table.index(['data_hora']);
    table.index(['flagged']);
    table.index(['contato']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('messages');
};