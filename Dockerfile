FROM node:22-alpine

# Variáveis de ambiente de produção
ENV NODE_ENV=production

WORKDIR /app

# Copia manifests primeiro — aproveita cache do Docker
COPY package*.json ./

# Instala apenas dependências de produção
RUN npm ci --omit=dev

# Copia código-fonte e frontend
COPY src    ./src
COPY public ./public

# Princípio do menor privilégio: nunca rodar como root
USER node

EXPOSE 3000

# Verifica saúde da aplicação a cada 15 s
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "src/server.js"]
