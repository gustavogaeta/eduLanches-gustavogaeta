# EduLanches — Sistema de Gestão da Cantina Escolar

> Sistema web completo para gerenciamento de cardápio e pedidos de cantina escolar, containerizado com Docker e pronto para produção.

---

## 📋 Descrição

O **EduLanches** resolve o problema da gestão manual de pedidos em cantinas escolares: alunos e funcionários visualizam o cardápio em tempo real, fazem pedidos e acompanham o status (pendente → preparando → pronto → entregue). A equipe da cantina gerencia itens e processa pedidos por uma interface web responsiva.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 22+ · Express 4 |
| Banco de dados | PostgreSQL 16 |
| Frontend | HTML5 · CSS3 · JavaScript Vanilla |
| Containerização | Docker · Docker Compose |
| Testes | Node.js test runner nativo (`node:test`) |

---

## 🚀 Como Subir em Produção (Docker)

### 1. Pré-requisitos

- Docker Desktop / Docker Engine instalado e em execução
- Git (para clonar o repositório)

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite .env e TROQUE DB_PASSWORD por uma senha forte
```

### 3. Validar configuração

```bash
docker compose config -q
```

### 4. Build e inicialização

```bash
docker compose up -d --build
```

### 5. Verificar saúde

```bash
docker compose ps
# banco deve estar "healthy", app deve estar "healthy" ou "Up"

curl http://localhost:3000/health
# {"status":"ok","banco":"ok"}
```

### 6. Acessar o sistema

Abra o navegador em: **http://localhost:3000**

---

## 🧪 Como Rodar os Testes

### Instalar dependências (apenas uma vez)

```bash
npm install
```

### Testes unitários (sem banco, sem rede)

```bash
npm run test:unit
```

### Testes de integração (requer PostgreSQL acessível)

```bash
# Com banco do Docker Compose rodando:
DATABASE_URL=postgres://edulanches:troque_esta_senha@localhost:5432/edulanches npm run test:integration
```

> **Nota:** Para os testes de integração, exponha temporariamente a porta do banco em `docker-compose.yml` ou use um PostgreSQL local.

---

## 📡 Tabela de Rotas da API

| Método | Rota | Função |
|--------|------|--------|
| `GET`  | `/health` | Verifica saúde da aplicação e do banco |
| `GET`  | `/api/categorias` | Lista todas as categorias do cardápio |
| `GET`  | `/api/itens` | Lista itens (filtros: `categoria_id`, `disponivel`) |
| `GET`  | `/api/itens/:id` | Retorna um item pelo ID |
| `POST` | `/api/itens` | Cria novo item no cardápio |
| `PATCH`| `/api/itens/:id` | Atualiza parcialmente um item (nome, preço, disponibilidade) |
| `DELETE`| `/api/itens/:id` | Remove um item do cardápio |
| `GET`  | `/api/pedidos` | Lista pedidos (filtro: `status`) |
| `GET`  | `/api/pedidos/:id` | Retorna pedido com seus itens |
| `POST` | `/api/pedidos` | Cria novo pedido |
| `PATCH`| `/api/pedidos/:id/status` | Avança o status do pedido |

### Exemplo: criar pedido

```bash
curl -X POST http://localhost:3000/api/pedidos \
  -H "Content-Type: application/json" \
  -d '{"cliente":"Maria","itens":[{"item_id":1,"quantidade":2}]}'
```

### Exemplo: avançar status

```bash
curl -X PATCH http://localhost:3000/api/pedidos/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"preparando"}'
```

---

## 🏗️ Decisões de Arquitetura

### 1. Preços em centavos (inteiros)
Valores monetários são armazenados e trafegados como inteiros em centavos (`preco_cents`), eliminando erros de ponto flutuante comuns em operações com `float` (ex: `0.1 + 0.2 ≠ 0.3` em IEEE 754).

### 2. Banco sem porta publicada
O serviço `db` no `docker-compose.yml` não possui a chave `ports`, sendo acessível apenas pela rede interna do Docker (`db:5432`). Isso reduz a superfície de ataque: nenhum agente externo consegue conectar diretamente ao banco.

### 3. Usuário sem privilégios (`USER node`)
O Dockerfile instrui o container a executar como o usuário `node` (UID 1000), jamais como `root`. Se um invasor explorar uma vulnerabilidade na aplicação, não terá acesso de administrador ao sistema operacional.

### 4. `HEALTHCHECK` no Dockerfile e no banco
O Docker monitora continuamente se a aplicação responde em `/health` e se o PostgreSQL aceita conexões via `pg_isready`. Isso permite reinicialização automática em caso de falha.

### 5. `depends_on: condition: service_healthy`
O serviço `app` só é iniciado após o banco estar saudável. Combinado com a lógica de retry (10 tentativas × 2 s) em `server.js`, garante inicialização confiável mesmo em máquinas lentas.

### 6. Senhas via `.env`
Nenhuma credencial está hardcoded no código ou no `docker-compose.yml`. Os valores padrão (`:-placeholder`) existem apenas como documentação, e o `.gitignore` garante que `.env` nunca seja versionado.

### 7. Transações (`BEGIN/COMMIT/ROLLBACK`)
Operações compostas (criar pedido + inserir itens) são envolvidas em transações. Se qualquer etapa falhar, o `ROLLBACK` garante consistência — sem pedidos sem itens ou itens sem pedido.

### 8. Separação `app.js` / `logic.js`
`logic.js` contém funções puras sem nenhuma dependência de banco ou framework. Isso permite testar regras de negócio (validação, cálculo de total, transições de status) de forma isolada e rápida, sem subir nenhuma infraestrutura.

---

## ♻️ Como Fazer Rollback

```bash
# 1. Derrubar a versão atual (dados são preservados no volume)
docker compose down

# 2. Subir a imagem anterior (ajuste a tag conforme necessário)
docker compose up -d --no-build
# ou especifique a imagem anterior no docker-compose.yml:
#   image: edulanches-app:0.9.0

# 3. Verificar saúde
docker compose ps
curl http://localhost:3000/health
```

---

## 📈 Escalabilidade Conceitual para 1 Milhão de Usuários

Para escalar o EduLanches de um único Docker Compose para suportar 1M de usuários com 100K simultâneos, as seguintes estratégias seriam aplicadas:

| Componente | Estratégia |
|---|---|
| **Múltiplas instâncias** | Kubernetes / Docker Swarm com N réplicas do `app` |
| **Load Balancer** | NGINX ou AWS ALB distribuindo requisições entre réplicas |
| **Banco gerenciado** | Amazon RDS / Cloud SQL com réplicas de leitura (read replicas) |
| **Cache** | Redis para cardápio (TTL 60s) e sessões de usuário |
| **CDN** | CloudFront ou Cloudflare para servir `index.html`, CSS e JS estático |
| **Filas** | RabbitMQ ou Google Pub/Sub para processar pedidos de forma assíncrona |
| **Monitoramento** | Prometheus + Grafana com alertas de SLA e latência |
| **Autoescaling** | HPA do Kubernetes ajusta réplicas conforme CPU/memória |

---

## 🗂️ Estrutura do Projeto

```
edulanches/
├── src/
│   ├── server.js           ← ponto de entrada
│   ├── app.js              ← rotas Express
│   ├── db.js               ← pool + schema + seed
│   └── logic.js            ← regras de negócio puras
├── public/
│   └── index.html          ← SPA completa
├── test/
│   ├── unit.test.js        ← testes unitários
│   └── integration.test.js ← testes de integração
├── docs/
│   ├── CHECKLIST.md        ← checklist de implantação
│   └── ficha-rdm.md        ← Registro de Mudança
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
├── package.json
└── README.md
```
