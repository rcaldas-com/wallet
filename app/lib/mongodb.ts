import { MongoClient, ServerApiVersion } from 'mongodb';

const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 5000,
};

let clientPromise: Promise<MongoClient>;

function getClientPromise(): Promise<MongoClient> {
  if (clientPromise) return clientPromise;

  // Aceita MONGODB_URI (nome próprio do wallet) ou MONGO_URI (nome usado no
  // .env compartilhado da infra rcaldas).
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('Invalid/Missing environment variable: "MONGODB_URI" (ou "MONGO_URI")');
  }

  if (process.env.NODE_ENV === 'development') {
    const globalWithMongo = global as typeof globalThis & {
      _mongoClientPromise?: Promise<MongoClient>;
    };

    if (!globalWithMongo._mongoClientPromise) {
      globalWithMongo._mongoClientPromise = new MongoClient(uri, options).connect().catch((err) => {
        console.error('MongoDB connection error:', err.message);
        delete globalWithMongo._mongoClientPromise;
        throw err;
      });
    }
    clientPromise = globalWithMongo._mongoClientPromise;
  } else {
    clientPromise = new MongoClient(uri, options).connect();
  }

  return clientPromise;
}

// Proxy lazy: adia a conexão para o runtime, evitando erro durante o build
// (onde as variáveis de ambiente não existem).
const clientProxy = new Proxy({} as Promise<MongoClient>, {
  get(_target, prop) {
    const promise = getClientPromise();
    const value = Reflect.get(promise, prop);
    return typeof value === 'function' ? value.bind(promise) : value;
  },
});

export default clientProxy;
