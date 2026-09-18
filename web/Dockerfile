FROM node:24-alpine

WORKDIR /app

# O lockfile entra junto e o `npm ci` instala exatamente o que está nele: a
# mesma imagem sai igual hoje, na máquina do colega e no deploy. Esta camada
# só refaz quando as dependências mudam.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5175
CMD ["npm", "run", "dev"]
