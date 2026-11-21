// src/logic.js — regras de negócio puras (sem banco, sem express)
'use strict';

/**
 * Valida os dados de um item do cardápio.
 * @param {object} body
 * @returns {{ ok: boolean, erros: string[], valor: object|null }}
 */
function validarItem(body) {
  const erros = [];

  if (!body || typeof body !== 'object') {
    return { ok: false, erros: ['Body inválido'], valor: null };
  }

  const nome = (body.nome || '').toString().trim();
  if (!nome) erros.push('nome é obrigatório');
  else if (nome.length > 150) erros.push('nome deve ter no máximo 150 caracteres');

  const descricao = (body.descricao || '').toString().trim();

  const categoria_id = Number(body.categoria_id);
  if (!Number.isInteger(categoria_id) || categoria_id <= 0) {
    erros.push('categoria_id deve ser um inteiro positivo');
  }

  const preco_cents = Number(body.preco_cents);
  if (!Number.isInteger(preco_cents) || preco_cents < 0) {
    erros.push('preco_cents deve ser um inteiro não-negativo (preço em centavos)');
  }

  if (erros.length > 0) return { ok: false, erros, valor: null };

  return {
    ok: true,
    erros: [],
    valor: { nome, descricao, categoria_id, preco_cents },
  };
}

/**
 * Valida os dados de um pedido novo.
 * @param {object} body
 * @returns {{ ok: boolean, erros: string[], valor: object|null }}
 */
function validarPedido(body) {
  const erros = [];

  if (!body || typeof body !== 'object') {
    return { ok: false, erros: ['Body inválido'], valor: null };
  }

  const cliente = (body.cliente || '').toString().trim();
  if (!cliente) erros.push('cliente é obrigatório');
  else if (cliente.length > 150) erros.push('cliente deve ter no máximo 150 caracteres');

  if (!Array.isArray(body.itens) || body.itens.length === 0) {
    erros.push('itens deve ser um array não-vazio');
  } else {
    body.itens.forEach((item, idx) => {
      const item_id = Number(item.item_id);
      const quantidade = Number(item.quantidade);
      if (!Number.isInteger(item_id) || item_id <= 0) {
        erros.push(`itens[${idx}].item_id deve ser inteiro positivo`);
      }
      if (!Number.isInteger(quantidade) || quantidade <= 0) {
        erros.push(`itens[${idx}].quantidade deve ser inteiro positivo`);
      }
    });
  }

  if (erros.length > 0) return { ok: false, erros, valor: null };

  return {
    ok: true,
    erros: [],
    valor: {
      cliente,
      itens: body.itens.map((i) => ({
        item_id: Number(i.item_id),
        quantidade: Number(i.quantidade),
      })),
    },
  };
}

/**
 * Valida a transição de status de um pedido.
 * Fluxo válido: pendente → preparando → pronto → entregue
 *               qualquer estado → cancelado (exceto já entregue/cancelado)
 * @param {string} statusAtual
 * @param {string} novoStatus
 * @returns {{ ok: boolean, erros: string[] }}
 */
function validarTransicaoStatus(statusAtual, novoStatus) {
  const statusValidos = ['pendente', 'preparando', 'pronto', 'entregue', 'cancelado'];

  if (!statusValidos.includes(novoStatus)) {
    return { ok: false, erros: [`Status inválido: ${novoStatus}`] };
  }

  if (statusAtual === 'entregue') {
    return { ok: false, erros: ['Pedido já entregue não pode ser alterado'] };
  }
  if (statusAtual === 'cancelado') {
    return { ok: false, erros: ['Pedido cancelado não pode ser alterado'] };
  }

  const fluxo = {
    pendente:   ['preparando', 'cancelado'],
    preparando: ['pronto',     'cancelado'],
    pronto:     ['entregue',   'cancelado'],
  };

  const permitidos = fluxo[statusAtual] || [];
  if (!permitidos.includes(novoStatus)) {
    return {
      ok: false,
      erros: [`Transição inválida: ${statusAtual} → ${novoStatus}. Permitidos: ${permitidos.join(', ')}`],
    };
  }

  return { ok: true, erros: [] };
}

/**
 * Calcula o total de um pedido a partir dos itens e preços do banco.
 * @param {Array<{ quantidade: number, preco_cents: number }>} itensPedido
 * @returns {{ ok: boolean, erros: string[], resultado: number }}
 */
function calcularTotalPedido(itensPedido) {
  if (!Array.isArray(itensPedido) || itensPedido.length === 0) {
    return { ok: false, erros: ['Lista de itens vazia'], resultado: 0 };
  }

  let total = 0;
  for (const item of itensPedido) {
    const qtd = Number(item.quantidade);
    const preco = Number(item.preco_cents);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      return { ok: false, erros: [`Quantidade inválida: ${item.quantidade}`], resultado: 0 };
    }
    if (!Number.isFinite(preco) || preco < 0) {
      return { ok: false, erros: [`Preço inválido: ${item.preco_cents}`], resultado: 0 };
    }
    total += qtd * preco;
  }

  return { ok: true, erros: [], resultado: total };
}

/**
 * Formata centavos para string de moeda brasileira (ex: 1290 → "R$ 12,90").
 * @param {number} cents
 * @returns {string}
 */
function formatarPreco(cents) {
  if (!Number.isInteger(cents) || cents < 0) return 'R$ 0,00';
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  return `R$ ${reais},${String(centavos).padStart(2, '0')}`;
}

module.exports = {
  validarItem,
  validarPedido,
  validarTransicaoStatus,
  calcularTotalPedido,
  formatarPreco,
};
