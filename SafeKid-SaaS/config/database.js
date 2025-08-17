const knex = require('knex');
const knexConfig = require('../knexfile');

const environment = process.env.NODE_ENV || 'development';
const config = knexConfig[environment];

const db = knex(config);

// Teste de conexão
db.raw('SELECT 1')
  .then(() => {
    console.log('✅ Conexão com PostgreSQL estabelecida com sucesso!');
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar com PostgreSQL:', err.message);
    process.exit(1);
  });

module.exports = db;