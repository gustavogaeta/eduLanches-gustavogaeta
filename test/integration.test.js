// test/integration.test.js — testes de integração: API real + banco real via DATABASE_URL
'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const { Pool } = require('pg');
const { criarApp } = require('../src/app');
const { criarPool } = require('../src/db');

// Exige DATABASE_URL configurado
assert.ok(
  process.env.DATABASE_URL,
  'DATABASE_URL deve estar definida para os testes de integração. Ex: postgres://user:pass@localhost:5432/db'
);

let baseUrl;
let pool;
let server;

// ── HELPERS ──────────────────────────────────────────────────────────────────
function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url     = new URL(path, baseUrl);
    const payload = body ? JSON.stringify(body) : undefined;
    const opts = {
      method,
      hostname: url.hostname,
      port:     url.port,
      path:     url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function get(path)        { return req('GET',    path); }
function post(path, body) { return req('POST',   path, body); }
function patch(path, body){ return req('PATCH',  path, body); }
function del(path)        { return req('DELETE', path); }

// ── SETUP / TEARDOWN ─────────────────────────────────────────────────────────
test.before(async () => {
  pool   = await criarPool();
  const app = criarApp(pool);
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[integration] servidor em ${baseUrl}`);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

// ── TESTES ───────────────────────────────────────────────────────────────────

test('GET /health retorna status ok', async () => {
  const r = await get('/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
  assert.equal(r.body.banco,  'ok');
});

test('GET /api/categorias retorna lista não-vazia', async () => {
  const r = await get('/api/categorias');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body), 'deve ser array');
  assert.ok(r.body.length > 0, 'deve ter categorias do seed');
  assert.ok(r.body[0].id,   'cada categoria tem id');
  assert.ok(r.body[0].nome, 'cada categoria tem nome');
});

test('GET /api/itens retorna itens do seed', async () => {
  const r = await get('/api/itens');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.ok(r.body.length > 0);
  const item = r.body[0];
  assert.ok(item.id);
  assert.ok(item.nome);
  assert.ok(typeof item.preco_cents === 'number');
  assert.ok(item.categoria_nome);
});

test('GET /api/itens?disponivel=true filtra apenas disponíveis', async () => {
  const r = await get('/api/itens?disponivel=true');
  assert.equal(r.status, 200);
  assert.ok(r.body.every((i) => i.disponivel === true));
});

// ── CRUD de itens ─────────────────────────────────────────────────────────────
let itemCriado;

test('POST /api/itens cria novo item com dados válidos', async () => {
  // Pega id de categoria
  const cats = await get('/api/categorias');
  const catId = cats.body[0].id;

  const r = await post('/api/itens', {
    nome:         'Teste Integration',
    descricao:    'Item criado pelo teste',
    categoria_id: catId,
    preco_cents:  999,
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.nome, 'Teste Integration');
  assert.equal(r.body.preco_cents, 999);
  itemCriado = r.body;
});

test('GET /api/itens/:id retorna o item criado', async () => {
  const r = await get(`/api/itens/${itemCriado.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.id, itemCriado.id);
});

test('POST /api/itens com dados inválidos retorna 400', async () => {
  const r = await post('/api/itens', { nome: '', categoria_id: 1, preco_cents: -10 });
  assert.equal(r.status, 400);
  assert.ok(Array.isArray(r.body.erros));
  assert.ok(r.body.erros.length > 0);
});

test('PATCH /api/itens/:id atualiza disponibilidade', async () => {
  const r = await patch(`/api/itens/${itemCriado.id}`, { disponivel: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.disponivel, false);
});

// ── CRUD de pedidos ───────────────────────────────────────────────────────────
let pedidoCriado;

test('POST /api/pedidos cria pedido completo', async () => {
  // Pega um item disponível
  const itensR = await get('/api/itens?disponivel=true');
  assert.ok(itensR.body.length > 0, 'precisa de pelo menos 1 item disponível para o teste');

  const item = itensR.body[0];
  const r = await post('/api/pedidos', {
    cliente: 'Cliente Integration Test',
    itens:   [{ item_id: item.id, quantidade: 2 }],
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.id);
  assert.equal(r.body.cliente, 'Cliente Integration Test');
  assert.equal(r.body.total_cents, item.preco_cents * 2);
  assert.equal(r.body.status, 'pendente');
  pedidoCriado = r.body;
});

test('GET /api/pedidos retorna lista com o pedido criado', async () => {
  const r = await get('/api/pedidos');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.ok(r.body.some((p) => p.id === pedidoCriado.id));
});

test('GET /api/pedidos/:id retorna detalhes com itens', async () => {
  const r = await get(`/api/pedidos/${pedidoCriado.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.id, pedidoCriado.id);
  assert.ok(Array.isArray(r.body.itens));
  assert.ok(r.body.itens.length > 0);
});

test('PATCH /api/pedidos/:id/status avança para preparando', async () => {
  const r = await patch(`/api/pedidos/${pedidoCriado.id}/status`, { status: 'preparando' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'preparando');
});

test('PATCH /api/pedidos/:id/status transição inválida retorna 400', async () => {
  // Pedido está em 'preparando', tentar voltar para 'pendente' é inválido
  const r = await patch(`/api/pedidos/${pedidoCriado.id}/status`, { status: 'pendente' });
  assert.equal(r.status, 400);
  assert.ok(Array.isArray(r.body.erros));
});

test('POST /api/pedidos com cliente vazio retorna 400', async () => {
  const r = await post('/api/pedidos', { cliente: '', itens: [{ item_id: 1, quantidade: 1 }] });
  assert.equal(r.status, 400);
  assert.ok(r.body.erros.some((e) => e.includes('cliente')));
});

test('POST /api/pedidos com item inexistente retorna 400', async () => {
  const r = await post('/api/pedidos', { cliente: 'Teste', itens: [{ item_id: 999999, quantidade: 1 }] });
  assert.equal(r.status, 400);
});

test('GET /api/pedidos/:id inexistente retorna 404', async () => {
  const r = await get('/api/pedidos/999999');
  assert.equal(r.status, 404);
});

test('DELETE /api/itens/:id remove o item de teste', async () => {
  const r = await del(`/api/itens/${itemCriado.id}`);
  assert.equal(r.status, 204);
});

test('GET /api/itens/:id após exclusão retorna 404', async () => {
  const r = await get(`/api/itens/${itemCriado.id}`);
  assert.equal(r.status, 404);
});
