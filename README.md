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

## Domínio (carteira Stellar)

As moedas do sistema são **tokens na rede Stellar**, emitidos por issuers próprios
(chaves guardadas na coleção `issuer` do Mongo). A moeda base do sistema é o **R$**.

Fluxos implementados:

- **Depósito (admin)** — `/dashboard/admin/deposit`: o admin escolhe usuário, moeda e
  quantidade; o issuer assina um pagamento on-chain creditando o token na conta Stellar
  do usuário (portado de `deposit_coin` do sistema Flask). O usuário recebe um email de
  confirmação com o saldo total atualizado. Registrado na coleção `deposit`.
- **Saldo do usuário** — `/dashboard`: lê os saldos on-chain (Horizon) de todas as
  wallets do usuário e converte para R$ em tempo real via microserviço de cotações.
- **Histórico** — movimentações (depósitos e saques) da coleção `deposit`/`withdraw`.
- **Solicitar saque** — o usuário registra um pedido (`withdraw` com `status: requested`)
  e os admins são notificados por email; o cumprimento on-chain é feito pelo admin.

Camadas principais:

- `app/lib/stellar.ts` — engine Stellar (server-only): issuer/keypair, depósito,
  criação de conta + trustlines, leitura de saldos.
- `app/lib/quotes.ts` — converte saldos em R$ consultando o serviço `ccxt`.
- `app/lib/data-wallet.ts` — leituras/gravações no Mongo (usuários, issuers, movimentações).
- `../ccxt/` — microserviço Python (ccxt) de cotações: `GET /price?base=BTC&quote=BRL`,
  tentando Binance primeiro e outras exchanges como fallback.

## Configuração (variáveis de ambiente)

No `.env` compartilhado da infra (`../.env`):

| Variável | Descrição |
| --- | --- |
| `MONGO_URI` / `MONGODB_URI` | conexão Mongo (banco `rcaldas`, compartilhado) |
| `MAIN_WALLET` | **secret** da conta Stellar que financia contas novas e recargas |
| `STELLAR_NETWORK` | `public` (padrão) ou `testnet` |
| `STELLAR_HORIZON` | URL do Horizon (padrão `https://horizon.stellar.org`) |
| `REDIS_URL` | fila de emails (definido no compose como `redis://redis`) |
| `CCXT_URL` | serviço de cotações (definido no compose como `http://ccxt:8000`) |
| `TITLE`, `AUTH_TRUST_HOST` | nome do app e URL base (já usados pela infra) |

> Os secrets dos issuers são lidos da coleção `issuer` no Mongo (reaproveitados do
> sistema antigo) — não vão no `.env`.

## Subir o ambiente

```bash
cd ..            # raiz da infra (docker-compose.yml)
docker compose build wallet ccxt
docker compose up -d
```

Serviços adicionados ao compose: `wallet` (Next.js, sob `/wallet` no nginx) e `ccxt`
(cotações). App disponível em: http://localhost:8001/wallet

## Características

- Desenvolvimento com Docker para garantir consistência entre ambientes
- Configuração para trabalhar com Nginx em um ambiente multi-serviço
- Autenticação compartilhada (mesma coleção `user`) com os demais apps RCaldas

## Integração com Infraestrutura

Este projeto faz parte de uma infraestrutura maior que inclui:
- Servidor web principal
- Banco de dados MongoDB
- Servidor Nginx para roteamento

## Desenvolvimento

Você pode editar os arquivos diretamente na sua máquina local, e as alterações serão refletidas automaticamente graças à configuração de volumes do Docker e ao hot reloading do Next.js.
