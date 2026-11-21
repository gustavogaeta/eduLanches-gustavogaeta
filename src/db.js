// src/db.js — cria pool PostgreSQL, tabelas e seed inicial
'use strict';

const { Pool } = require('pg');

/**
 * Cria o pool de conexões e inicializa o schema do banco.
 * Retorna o pool pronto para uso.
 */
async function criarPool() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  await inicializarBanco(pool);
  return pool;
}

async function inicializarBanco(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Tabela de categorias do cardápio
    await client.query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id        SERIAL PRIMARY KEY,
        nome      VARCHAR(100) NOT NULL UNIQUE,
        criado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // Tabela de itens do cardápio (preço em centavos para evitar float)
    await client.query(`
      CREATE TABLE IF NOT EXISTS itens (
        id           SERIAL PRIMARY KEY,
        categoria_id INTEGER      NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
        nome         VARCHAR(150) NOT NULL,
        descricao    TEXT         NOT NULL DEFAULT '',
        preco_cents  INTEGER      NOT NULL CHECK (preco_cents >= 0),
        disponivel   BOOLEAN      NOT NULL DEFAULT TRUE,
        criado_em    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // Tabela de pedidos
    await client.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id          SERIAL PRIMARY KEY,
        cliente     VARCHAR(150) NOT NULL,
        status      VARCHAR(20)  NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente','preparando','pronto','entregue','cancelado')),
        total_cents INTEGER      NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
        criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Itens de cada pedido
    await client.query(`
      CREATE TABLE IF NOT EXISTS pedido_itens (
        id           SERIAL PRIMARY KEY,
        pedido_id    INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
        item_id      INTEGER NOT NULL REFERENCES itens(id),
        quantidade   INTEGER NOT NULL CHECK (quantidade > 0),
        preco_cents  INTEGER NOT NULL CHECK (preco_cents >= 0)
      )
    `);

    await client.query('COMMIT');

    // Seed: apenas se não houver categorias
    const { rows } = await client.query('SELECT COUNT(*)::int AS total FROM categorias');
    if (rows[0].total === 0) {
      await seedInicial(client);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('[db] banco pronto');
}

async function seedInicial(client) {
  // Categorias
  await client.query(`
    INSERT INTO categorias (nome) VALUES
      ('Lanches'),
      ('Bebidas'),
      ('Sobremesas')
  `);

  // Itens do cardápio (preços em centavos)
  await client.query(`
    INSERT INTO itens (categoria_id, nome, descricao, preco_cents) VALUES
      (1, 'X-Burguer',       'Hambúrguer artesanal com queijo e alface',  1290),
      (1, 'Hot Dog',         'Salsicha, molho e batata palha',             890),
      (1, 'Misto Quente',    'Pão de forma, presunto e queijo derretido',  650),
      (1, 'Coxinha',         'Coxinha de frango com requeijão',            350),
      (2, 'Suco de Laranja', 'Suco natural 300 ml',                        590),
      (2, 'Refrigerante',    'Lata 350 ml',                                450),
      (2, 'Água Mineral',    'Garrafa 500 ml',                             250),
      (3, 'Brigadeiro',      'Brigadeiro gourmet de chocolate',            300),
      (3, 'Pastel de Nata',  'Pastel de nata artesanal',                   420)
  `);

  console.log('[db] seed inicial inserido');
}

module.exports = { criarPool };
