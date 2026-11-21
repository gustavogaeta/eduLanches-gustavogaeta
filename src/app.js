// src/app.js — define todas as rotas Express; recebe pool por parâmetro
'use strict';

const express = require('express');
const path    = require('path');
const { validarItem, validarPedido, validarTransicaoStatus, calcularTotalPedido } = require('./logic');

/**
 * Cria e configura o app Express.
 * @param {import('pg').Pool} pool
 * @returns {import('express').Application}
 */
function criarApp(pool) {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ─── HEALTH ──────────────────────────────────────────────────────────────────
  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', banco: 'ok' });
    } catch {
      res.status(503).json({ status: 'erro', banco: 'indisponivel' });
    }
  });

  // ─── CATEGORIAS ──────────────────────────────────────────────────────────────
  app.get('/api/categorias', async (_req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM categorias ORDER BY nome');
      res.json(rows);
    } catch (err) {
      console.error('[app] GET /api/categorias', err.message);
      res.status(500).json({ erro: 'Erro interno' });
    }
  });

  // ─── ITENS DO CARDÁPIO ───────────────────────────────────────────────────────
  app.get('/api/itens', async (req, res) => {
    try {
      const { categoria_id, disponivel } = req.query;
      let sql = `
        SELECT i.*, c.nome AS categoria_nome
        FROM itens i
        JOIN categorias c ON c.id = i.categoria_id
        WHERE 1=1
      `;
      const params = [];

      if (categoria_id) {
        params.push(Number(categoria_id));
        sql += ` AND i.categoria_id = $${params.length}`;
      }
      if (disponivel !== undefined) {
        params.push(disponivel === 'true');
        sql += ` AND i.disponivel = $${params.length}`;
      }
      sql += ' ORDER BY c.nome, i.nome';

      const { rows } = await pool.query(sql, params);
      res.json(rows);
    } catch (err) {
      console.error('[app] GET /api/itens', err.message);
      res.status(500).json({ erro: 'Erro interno' });
    }
  });

  app.get('/api/itens/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(
        `SELECT i.*, c.nome AS categoria_nome
         FROM itens i JOIN categorias c ON c.id = i.categoria_id
         WHERE i.id = $1`,
        [id]
      );
      if (!rows[0]) return res.status(404).json({ erro: 'Item não encontrado' });
      res.json(rows[0]);
    } catch (err) {
      console.error('[app] GET /api/itens/:id', err.message);
      res.status(500).json({ erro: 'Erro interno' });
    }
  });

  app.post('/api/itens', async (req, res) => {
    const validacao = validarItem(req.body);
    if (!validacao.ok) return res.status(400).json({ erros: validacao.erros });

    const { nome, descricao, categoria_id, preco_cents } = validacao.valor;
    try {
      const { rows } = await pool.query(
        `INSERT INTO itens (nome, descricao, categoria_id, preco_cents)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [nome, descricao, categoria_id, preco_cents]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('[app] POST /api/itens', err.message);
      if (err.code === '23503') return res.status(400).json({ erros: ['categoria_id não existe'] });
      res.status(500).json({ erro: 'Erro interno' });
    }
  });

  app.patch('/api/itens/:id', async (req, res) => {
    const id = Number(req.params.id);
    // disponibilidade toggle ou edição parcial
    const campos = [];
    const params = [];

    if (req.body.disponivel !== undefined) {
      params.push(Boolean(req.body.disponivel));
      campos.push(`disponivel = $${params.length}`);
    }
    if (req.body.preco_cents !== undefined) {
      const preco = Number(req.body.preco_cents);
      if (!Number.isInteger(preco) || preco < 0)
        return res.status(400).json({ erros: ['preco_cents inválido'] });
      params.push(preco);
      campos.push(`preco_cents = $${params.length}`);
    }
    if (req.body.nome !== undefined) {
      const nome = req.body.nome.toString().trim();
      if (!nome) return res.status(400).json({ erros: ['nome não pode ser vazio'] });
      params.push(nome);
      campos.push(`nome = $${params.length}`);
    }
    if (campos.length === 0) return res.status(400).json({ erros: ['Nenhum campo para atualizar'] });

    params.push(id);
    try {
      const { rows } = await pool.query(
        `UPDATE itens SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );
      if (!rows[0]) return res.status(404).json({ erro: 'Item não encontrado' });
      res.json(rows[0]);
    } catch (err) {
      console.error('[app] PATCH /api/itens/:id', err.message);
      res.status(500).json({ erro: 'Erro interno' });
    }
  });

  app.delete('/api/itens/:id', async (req, res) => {
    const id = Number(req.params.id);
    try {
      const { rowCount } = await pool.query('DELETE FROM itens WHERE id = $1', [id]);
      if (!rowCount) return res.status(404).json({ erro: 'Item não encontrado' });
      res.status(204).end();
    } catch (err) {
      console.error('[app] DELETE /api/itens/:id', err.message);
      res.status(500).json({ erro: 'Erro interno' });
    }
  });

  // ─── PEDIDOS ─────────────────────────────────────────────────────────────────
  app.get('/api/pedidos', async (req, res) => {
    try {
      const { status } = req.query;
      let sql = 'SELECT * FROM pedidos WHERE 1=1';
      const params = [];

      if (status) {
        params.push(status);
        sql += ` AND status = $${params.length}`;
      }
      sql += ' ORDER BY criado_em DESC';

      const { rows } = await pool.query(sql, params);
      res.json(rows);
    } catch (err) {
      console.error('[app] GET /api/pedidos', err.message);
      res.status(500).json({ erro: 'Erro interno' });
    }
  });

  app.get('/api/pedidos/:id', async (req, res) => {
    const id = Number(req.params.id);
    try {
      const { rows: [pedido] } = await pool.query('SELECT * FROM pedidos WHERE id = $1', [id]);
      if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

      const { rows: itens } = await pool.query(
        `SELECT pi.*, i.nome AS item_nome
         FROM pedido_itens pi JOIN itens i ON i.id = pi.item_id
         WHERE pi.pedido_id = $1`,
        [id]
      );
      res.json({ ...pedido, itens });
    } catch (err) {
      console.error('[app] GET /api/pedidos/:id', err.message);
      res.status(500).json({ erro: 'Erro interno' });
    }
  });

  app.post('/api/pedidos', async (req, res) => {
    const validacao = validarPedido(req.body);
    if (!validacao.ok) return res.status(400).json({ erros: validacao.erros });

    const { cliente, itens } = validacao.valor;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Busca preços atuais dos itens
      const ids = itens.map((i) => i.item_id);
      const { rows: itensBanco } = await client.query(
        `SELECT id, nome, preco_cents, disponivel FROM itens WHERE id = ANY($1::int[])`,
        [ids]
      );

      // Validações de negócio
      const erros = [];
      const itensPedidoComPreco = [];

      for (const itemReq of itens) {
        const itemBanco = itensBanco.find((i) => i.id === itemReq.item_id);
        if (!itemBanco) {
          erros.push(`Item ${itemReq.item_id} não encontrado`);
          continue;
        }
        if (!itemBanco.disponivel) {
          erros.push(`Item "${itemBanco.nome}" está indisponível`);
          continue;
        }
        itensPedidoComPreco.push({
          item_id:     itemBanco.id,
          quantidade:  itemReq.quantidade,
          preco_cents: itemBanco.preco_cents,
        });
      }

      if (erros.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erros });
      }

      const totalCalc = calcularTotalPedido(itensPedidoComPreco);
      if (!totalCalc.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erros: totalCalc.erros });
      }

      // Insere pedido
      const { rows: [pedido] } = await client.query(
        `INSERT INTO pedidos (cliente, total_cents) VALUES ($1, $2) RETURNING *`,
        [cliente, totalCalc.resultado]
      );

      // Insere itens do pedido
      for (const item of itensPedidoComPreco) {
        await client.query(
          `INSERT INTO pedido_itens (pedido_id, item_id, quantidade, preco_cents)
           VALUES ($1, $2, $3, $4)`,
          [pedido.id, item.item_id, item.quantidade, item.preco_cents]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ ...pedido, itens: itensPedidoComPreco });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[app] POST /api/pedidos', err.message);
      res.status(500).json({ erro: 'Erro interno' });
    } finally {
      client.release();
    }
  });

  app.patch('/api/pedidos/:id/status', async (req, res) => {
    const id = Number(req.params.id);
    const novoStatus = (req.body.status || '').toString().trim();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [pedido] } = await client.query(
        'SELECT * FROM pedidos WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (!pedido) {
        await client.query('ROLLBACK');
        return res.status(404).json({ erro: 'Pedido não encontrado' });
      }

      const transicao = validarTransicaoStatus(pedido.status, novoStatus);
      if (!transicao.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erros: transicao.erros });
      }

      const { rows: [atualizado] } = await client.query(
        `UPDATE pedidos SET status = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *`,
        [novoStatus, id]
      );

      await client.query('COMMIT');
      res.json(atualizado);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[app] PATCH /api/pedidos/:id/status', err.message);
      res.status(500).json({ erro: 'Erro interno' });
    } finally {
      client.release();
    }
  });

  return app;
}

module.exports = { criarApp };
