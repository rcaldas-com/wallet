// Mesmo modelo de papéis do app web (sessão compartilhada).
export type UserRole = 'admin' | 'wallet' | 'digitar';

export type AuthUser = {
  _id: string;
  name: string;
  email: string;
  password: string;
  globalRole: 'admin' | null;
  roles: UserRole[];
  createdAt: Date;
  isActive: boolean;
  emailVerified: boolean;
  verificationToken: string | null;
  verificationTokenExpires: Date | null;
};

export type UserSession = {
  _id: string;
  name: string;
  email: string;
  globalRole: 'admin' | null;
  roles: UserRole[];
  isActive: boolean;
};

// --- Stellar wallet domain ---

// Um documento da coleção `wallet` (portado do sistema Flask, mongoengine).
export type WalletDoc = {
  _id: string;
  user: string; // ObjectId do usuário dono
  type: 'main' | 'stellar' | 'binance' | string;
  key: string; // chave pública
  secret?: string | null; // chave secreta (contas custodiadas) — nunca exposta ao client
  readOnly?: boolean; // chave pública cadastrada pelo usuário (somente leitura)
  label?: string | null;
  updatedAt?: Date | null;
};

// Um documento da coleção `issuer` — emissor de um token Stellar.
export type IssuerDoc = {
  _id: string;
  name: string; // código do asset (ex: BRL, BTC)
  public_key: string;
  secret?: string | null; // secret do issuer — server-only
  mirror?: string | null;
};

// Saldo de uma moeda numa conta, já com valor convertido.
export type CoinBalance = {
  coin: string;
  balance: number;
  valueBrl: number;
};

// Movimentação (depósito ou saque) exibida no histórico.
export type Movement = {
  _id: string;
  kind: 'deposit' | 'withdraw';
  amount: string;
  coin: string;
  desc?: string | null;
  status?: string | null;
  timestamp: Date;
};

// Usuário exibido no seletor do admin.
export type UserOption = {
  _id: string;
  name: string;
  email: string;
};

// Pedido de saque pendente, na fila do admin.
export type PendingWithdraw = {
  _id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: string;
  coin: string;
  destination: string | null;
  desc?: string | null;
  timestamp: Date;
};
