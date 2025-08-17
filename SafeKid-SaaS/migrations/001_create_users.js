/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('nome', 255).notNullable();
    table.string('email', 255).unique().notNullable();
    table.string('senha_hash', 255).notNullable();
    table.string('2fa_secret', 255).nullable();
    table.enum('plano_assinatura', ['basico', 'premium']).defaultTo('basico');
    table.boolean('email_verificado').defaultTo(false);
    table.string('verification_token', 255).nullable();
    table.timestamp('ultimo_login').nullable();
    table.timestamps(true, true);
    
    // Índices
    table.index(['email']);
    table.index(['plano_assinatura']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('users');
};