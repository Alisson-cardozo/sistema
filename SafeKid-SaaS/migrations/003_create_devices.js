/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
    table.enum('tipo_dispositivo', ['android', 'ios']).notNullable();
    table.string('uuid', 255).unique().notNullable();
    table.string('modelo', 255).nullable();
    table.string('versao_os', 50).nullable();
    table.boolean('status_online').defaultTo(false);
    table.timestamp('ultimo_sync').nullable();
    table.string('app_version', 20).nullable();
    table.timestamps(true, true);
    
    // Índices
    table.index(['child_id']);
    table.index(['uuid']);
    table.index(['status_online']);
    table.index(['ultimo_sync']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('devices');
};