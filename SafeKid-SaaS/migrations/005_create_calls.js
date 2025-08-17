/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('calls', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.enum('tipo_chamada', ['celular', 'whatsapp', 'telegram']).notNullable();
    table.string('numero', 50).notNullable();
    table.string('contato_nome', 255).nullable();
    table.enum('direcao', ['enviada', 'recebida', 'perdida']).notNullable();
    table.integer('duracao').defaultTo(0); // em segundos
    table.boolean('flagged').defaultTo(false);
    table.timestamp('data_hora').notNullable();
    table.timestamps(true, true);
    
    // Índices
    table.index(['device_id']);
    table.index(['tipo_chamada']);
    table.index(['data_hora']);
    table.index(['numero']);
    table.index(['flagged']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('calls');
};