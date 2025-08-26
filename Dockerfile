FROM node:22
LABEL maintainer="RCaldas <docker@rcaldas.com>"

WORKDIR /app
COPY package*.json ./
RUN npm install -g npm && npm install

COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
