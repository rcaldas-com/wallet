FROM node:24
LABEL maintainer="RCaldas <docker@rcaldas.com>"

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
