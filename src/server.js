// src/server.js — ponto de entrada: cria pool, inicializa banco e sobe Express
'use strict';

const { criarPool } = require('./db');
const { criarApp }  = require('./app');

const PORT        = Number(process.env.PORT)        || 3000;
const APP_VERSION = process.env.APP_VERSION          || '0.0.0';
const MAX_RETRIES = 10;
const RETRY_MS    = 2000;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let pool;

  for (let tentativa = 1; tentativa <= MAX_RETRIES; tentativa++) {
    try {
      console.log(`[app] conectando ao banco (tentativa ${tentativa}/${MAX_RETRIES})...`);
      pool = await criarPool();
      break; // sucesso
    } catch (err) {
      console.error(`[app] falha na conexão: ${err.message}`);
      if (tentativa === MAX_RETRIES) {
        console.error('[app] número máximo de tentativas atingido. Encerrando.');
        process.exit(1);
      }
      await sleep(RETRY_MS);
    }
  }

  const app = criarApp(pool);

  const server = app.listen(PORT, () => {
    console.log(`[app] EduLanches v${APP_VERSION} na porta ${PORT}`);
  });

  // Encerramento gracioso
  const encerrar = async (sinal) => {
    console.log(`[app] ${sinal} recebido — encerrando...`);
    server.close(async () => {
      await pool.end();
      console.log('[app] pool encerrado. Bye!');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT',  () => encerrar('SIGINT'));
}

main();
