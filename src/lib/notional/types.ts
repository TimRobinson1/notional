export type TableKeyCache = {
  [tableIdentifier: string]: {
    collectionKey: string;
    collectionKeyId: string;
  };
};

export type Config = {
  apiKey: string;
  userId: string;
  useCache?: boolean;
  cache?: TableKeyCache;
};
