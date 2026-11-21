// test/unit.test.js — testes unitários de logic.js (sem banco, sem rede)
'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  validarItem,
  validarPedido,
  validarTransicaoStatus,
  calcularTotalPedido,
  formatarPreco,
} = require('../src/logic');

// ─────────────────────────────────────────────────────────────────────────────
// validarItem
// ─────────────────────────────────────────────────────────────────────────────
test('validarItem — válido com todos os campos', () => {
  const r = validarItem({ nome: 'X-Burguer', descricao: 'Lanche', categoria_id: 1, preco_cents: 1290 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erros, []);
  assert.equal(r.valor.nome, 'X-Burguer');
  assert.equal(r.valor.preco_cents, 1290);
});

test('validarItem — válido com preco_cents zero', () => {
  const r = validarItem({ nome: 'Brinde', categoria_id: 2, preco_cents: 0 });
  assert.equal(r.ok, true);
});

test('validarItem — nome ausente deve falhar', () => {
  const r = validarItem({ categoria_id: 1, preco_cents: 500 });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('nome')));
});

test('validarItem — categoria_id inválida (string) deve falhar', () => {
  const r = validarItem({ nome: 'Teste', categoria_id: 'abc', preco_cents: 100 });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('categoria_id')));
});

test('validarItem — preco_cents negativo deve falhar', () => {
  const r = validarItem({ nome: 'Teste', categoria_id: 1, preco_cents: -50 });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('preco_cents')));
});

test('validarItem — preco_cents float deve falhar', () => {
  const r = validarItem({ nome: 'Teste', categoria_id: 1, preco_cents: 12.90 });
  assert.equal(r.ok, false);
});

test('validarItem — nome acima de 150 chars deve falhar', () => {
  const r = validarItem({ nome: 'A'.repeat(151), categoria_id: 1, preco_cents: 100 });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('150')));
});

test('validarItem — body nulo deve falhar', () => {
  const r = validarItem(null);
  assert.equal(r.ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// validarPedido
// ─────────────────────────────────────────────────────────────────────────────
test('validarPedido — válido com itens corretos', () => {
  const r = validarPedido({ cliente: 'Maria', itens: [{ item_id: 1, quantidade: 2 }] });
  assert.equal(r.ok, true);
  assert.equal(r.valor.cliente, 'Maria');
  assert.equal(r.valor.itens[0].quantidade, 2);
});

test('validarPedido — cliente ausente deve falhar', () => {
  const r = validarPedido({ itens: [{ item_id: 1, quantidade: 1 }] });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('cliente')));
});

test('validarPedido — itens vazio deve falhar', () => {
  const r = validarPedido({ cliente: 'João', itens: [] });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('itens')));
});

test('validarPedido — quantidade zero deve falhar', () => {
  const r = validarPedido({ cliente: 'Ana', itens: [{ item_id: 1, quantidade: 0 }] });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('quantidade')));
});

test('validarPedido — item_id negativo deve falhar', () => {
  const r = validarPedido({ cliente: 'Ana', itens: [{ item_id: -1, quantidade: 1 }] });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('item_id')));
});

// ─────────────────────────────────────────────────────────────────────────────
// validarTransicaoStatus
// ─────────────────────────────────────────────────────────────────────────────
test('validarTransicaoStatus — pendente → preparando é válido', () => {
  const r = validarTransicaoStatus('pendente', 'preparando');
  assert.equal(r.ok, true);
});

test('validarTransicaoStatus — preparando → pronto é válido', () => {
  const r = validarTransicaoStatus('preparando', 'pronto');
  assert.equal(r.ok, true);
});

test('validarTransicaoStatus — pendente → entregue direto é inválido', () => {
  const r = validarTransicaoStatus('pendente', 'entregue');
  assert.equal(r.ok, false);
});

test('validarTransicaoStatus — entregue não pode ser alterado', () => {
  const r = validarTransicaoStatus('entregue', 'cancelado');
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('entregue')));
});

test('validarTransicaoStatus — cancelado não pode ser alterado', () => {
  const r = validarTransicaoStatus('cancelado', 'pendente');
  assert.equal(r.ok, false);
});

test('validarTransicaoStatus — status inexistente é inválido', () => {
  const r = validarTransicaoStatus('pendente', 'enviado');
  assert.equal(r.ok, false);
});

test('validarTransicaoStatus — cancelar de qualquer estado válido', () => {
  for (const s of ['pendente', 'preparando', 'pronto']) {
    const r = validarTransicaoStatus(s, 'cancelado');
    assert.equal(r.ok, true, `deveria poder cancelar de '${s}'`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// calcularTotalPedido
// ─────────────────────────────────────────────────────────────────────────────
test('calcularTotalPedido — cálculo correto com múltiplos itens', () => {
  const r = calcularTotalPedido([
    { quantidade: 2, preco_cents: 1000 },
    { quantidade: 1, preco_cents: 500  },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.resultado, 2500);
});

test('calcularTotalPedido — item com preço zero', () => {
  const r = calcularTotalPedido([{ quantidade: 3, preco_cents: 0 }]);
  assert.equal(r.ok, true);
  assert.equal(r.resultado, 0);
});

test('calcularTotalPedido — lista vazia deve falhar', () => {
  const r = calcularTotalPedido([]);
  assert.equal(r.ok, false);
});

test('calcularTotalPedido — quantidade inválida deve falhar', () => {
  const r = calcularTotalPedido([{ quantidade: -1, preco_cents: 100 }]);
  assert.equal(r.ok, false);
});

test('calcularTotalPedido — preço negativo deve falhar', () => {
  const r = calcularTotalPedido([{ quantidade: 1, preco_cents: -10 }]);
  assert.equal(r.ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// formatarPreco
// ─────────────────────────────────────────────────────────────────────────────
test('formatarPreco — 1290 centavos = R$ 12,90', () => {
  assert.equal(formatarPreco(1290), 'R$ 12,90');
});

test('formatarPreco — 100 centavos = R$ 1,00', () => {
  assert.equal(formatarPreco(100), 'R$ 1,00');
});

test('formatarPreco — 5 centavos = R$ 0,05', () => {
  assert.equal(formatarPreco(5), 'R$ 0,05');
});

test('formatarPreco — 0 centavos = R$ 0,00', () => {
  assert.equal(formatarPreco(0), 'R$ 0,00');
});

test('formatarPreco — valor negativo retorna R$ 0,00', () => {
  assert.equal(formatarPreco(-100), 'R$ 0,00');
});
