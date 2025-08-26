# Wallet

Este é um projeto de carteira digital baseado em Next.js, desenvolvido para substituir a implementação anterior em Flask.

## Tecnologias Utilizadas

- Next.js 15.5.1
- React 19.1.0
- Tailwind CSS
- Docker

## Ambiente de Desenvolvimento

Este projeto está configurado para rodar em um ambiente Docker Compose juntamente com outros serviços.

### Requisitos

- Docker
- Docker Compose

### Iniciar o Ambiente de Desenvolvimento

```bash
# Na pasta raiz do projeto de infraestrutura
cd ..
docker compose up -d
```

O aplicativo estará disponível em: http://localhost:8001/wallet

## Estrutura do Projeto

- O projeto é configurado para rodar com o caminho base `/wallet` em desenvolvimento
- Em produção, o caminho base é configurado para a raiz do domínio

## Características

- Desenvolvimento com Docker para garantir consistência entre ambientes
- Configuração para trabalhar com Nginx em um ambiente multi-serviço
- Integração futura com sistema de autenticação compartilhado

## Integração com Infraestrutura

Este projeto faz parte de uma infraestrutura maior que inclui:
- Servidor web principal
- Banco de dados MongoDB
- Servidor Nginx para roteamento

## Desenvolvimento

Você pode editar os arquivos diretamente na sua máquina local, e as alterações serão refletidas automaticamente graças à configuração de volumes do Docker e ao hot reloading do Next.js.
