/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('locations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.decimal('latitude', 10, 8).notNullable();
    table.decimal('longitude', 11, 8).notNullable();
    table.decimal('accuracy', 6, 2).nullable(); // precisão em metros
    table.decimal('altitude', 8, 2).nullable();
    table.decimal('speed', 6, 2).nullable(); // velocidade em m/s
    table.string('endereco', 500).nullable();
    table.string('lugar_nome', 255).nullable(); // ex: "Casa", "Escola"
    table.boolean('is_safe_zone').defaultTo(false);
    table.timestamp('data_hora').notNullable();
    table.timestamps(true, true);
    
    // Índices
    table.index(['device_id']);
    table.index(['data_hora']);
    table.index(['is_safe_zone']);
    table.index(['latitude', 'longitude']); // índice composto para buscas geográficas
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('locations');
};