import { MongoClient, ServerApiVersion } from 'mongodb';

// Aceita MONGODB_URI (nome próprio do wallet) ou MONGO_URI (nome usado no
// .env compartilhado da infra rcaldas).
const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!uri) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI" (ou "MONGO_URI")');
}
const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  const globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
