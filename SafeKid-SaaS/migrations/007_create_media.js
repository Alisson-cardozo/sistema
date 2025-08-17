/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('media', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.enum('tipo', ['foto', 'video', 'audio']).notNullable();
    table.enum('origem', ['camera', 'galeria', 'download', 'whatsapp', 'telegram']).notNullable();
    table.string('caminho_arquivo', 500).notNullable();
    table.string('nome_arquivo', 255).notNullable();
    table.bigInteger('tamanho_bytes').nullable();
    table.string('mime_type', 100).nullable();
    table.integer('duracao').nullable(); // para vídeos/áudios em segundos
    table.text('descricao').nullable();
    table.boolean('flagged').defaultTo(false);
    table.boolean('backup_cloud').defaultTo(false);
    table.timestamp('data_criacao').notNullable(); // quando foi criado no dispositivo
    table.timestamp('data_hora').notNullable(); // quando foi coletado
    table.timestamps(true, true);
    
    // Índices
    table.index(['device_id']);
    table.index(['tipo']);
    table.index(['origem']);
    table.index(['data_hora']);
    table.index(['flagged']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('media');
};