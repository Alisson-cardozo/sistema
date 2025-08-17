/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('children', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('nome', 255).notNullable();
    table.integer('idade').notNullable();
    table.string('foto_perfil', 500).nullable();
    table.boolean('ativo').defaultTo(true);
    table.timestamps(true, true);
    
    // Índices
    table.index(['user_id']);
    table.index(['ativo']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('children');
};