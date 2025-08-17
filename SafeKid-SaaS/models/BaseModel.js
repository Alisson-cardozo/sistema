const db = require('../config/database');

class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
    this.db = db;
  }

  // Criar registro
  async create(data) {
    try {
      const [result] = await this.db(this.tableName)
        .insert(data)
        .returning('*');
      return result;
    } catch (error) {
      throw new Error(`Erro ao criar ${this.tableName}: ${error.message}`);
    }
  }

  // Buscar por ID
  async findById(id) {
    try {
      const result = await this.db(this.tableName)
        .where({ id })
        .first();
      return result;
    } catch (error) {
      throw new Error(`Erro ao buscar ${this.tableName} por ID: ${error.message}`);
    }
  }

  // Buscar todos com filtros
  async findAll(filters = {}, options = {}) {
    try {
      let query = this.db(this.tableName);

      // Aplicar filtros
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null) {
          query = query.where(key, filters[key]);
        }
      });

      // Ordenação
      if (options.orderBy) {
        query = query.orderBy(options.orderBy, options.order || 'asc');
      }

      // Paginação
      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.offset) {
        query = query.offset(options.offset);
      }

      const results = await query;
      return results;
    } catch (error) {
      throw new Error(`Erro ao buscar ${this.tableName}: ${error.message}`);
    }
  }

  // Atualizar por ID
  async updateById(id, data) {
    try {
      const [result] = await this.db(this.tableName)
        .where({ id })
        .update({
          ...data,
          updated_at: new Date()
        })
        .returning('*');
      return result;
    } catch (error) {
      throw new Error(`Erro ao atualizar ${this.tableName}: ${error.message}`);
    }
  }

  // Deletar por ID
  async deleteById(id) {
    try {
      const result = await this.db(this.tableName)
        .where({ id })
        .del();
      return result > 0;
    } catch (error) {
      throw new Error(`Erro ao deletar ${this.tableName}: ${error.message}`);
    }
  }

  // Contar registros
  async count(filters = {}) {
    try {
      let query = this.db(this.tableName);

      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null) {
          query = query.where(key, filters[key]);
        }
      });

      const [{ count }] = await query.count('* as count');
      return parseInt(count);
    } catch (error) {
      throw new Error(`Erro ao contar ${this.tableName}: ${error.message}`);
    }
  }

  // Buscar um registro com condições customizadas
  async findOne(conditions) {
    try {
      const result = await this.db(this.tableName)
        .where(conditions)
        .first();
      return result;
    } catch (error) {
      throw new Error(`Erro ao buscar ${this.tableName}: ${error.message}`);
    }
  }

  // Buscar com joins
  async findWithJoin(joins = [], filters = {}, options = {}) {
    try {
      let query = this.db(this.tableName);

      // Aplicar joins
      joins.forEach(join => {
        query = query.join(join.table, join.first, join.second);
      });

      // Aplicar filtros
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null) {
          query = query.where(key, filters[key]);
        }
      });

      // Ordenação
      if (options.orderBy) {
        query = query.orderBy(options.orderBy, options.order || 'asc');
      }

      const results = await query;
      return results;
    } catch (error) {
      throw new Error(`Erro ao buscar ${this.tableName} com join: ${error.message}`);
    }
  }
}

module.exports = BaseModel;