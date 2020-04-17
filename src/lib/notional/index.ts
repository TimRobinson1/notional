import axios, { AxiosInstance } from 'axios';
import { Config, TableKeyCache, NotionPageChunkResponse } from './types';
import { URL } from 'url';

export default class Notional {
  private apiKey: string;
  private userId: string;
  private cachingEnabled: boolean;
  private tableKeyCache: TableKeyCache;
  private http: AxiosInstance;

  private baseConfig = {
    limit: 100000,
    chunkNumber: 0,
    cursor: { stack: [] },
    verticalColumns: false,
  };

  constructor({ apiKey, userId, useCache, cache }: Config) {
    if (!apiKey || !userId) {
      throw new Error('Both an apiKey and userId are required');
    }

    this.apiKey = apiKey;
    this.userId = userId;
    this.cachingEnabled = useCache == undefined ? true : useCache;
    this.tableKeyCache = cache || {};
    this.http = axios.create({
      baseURL: 'https://www.notion.so/api/v3/',
      headers: {
        Cookie: `token_v2=${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  private toUUID(input: string) {
    return input.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  }

  private getBaseUrl(pageUrl: string) {
    const url = new URL(pageUrl);
    const urlHost = pageUrl.split(url.pathname)[0];
    const company = url.pathname.split('/')[1];

    return `${urlHost}/${company}`;
  }

  private async loadPageChunk<T>(pageId: string): Promise<T> {
    const response = await this.http.post<T>('/loadPageChunk', {
      ...this.baseConfig,
      pageId,
    });

    return response.data;
  }

  public getCachedTableKeys() {
    return this.tableKeyCache;
  }

  public cacheTableKeys(tableKeys: TableKeyCache) {
    this.tableKeyCache = {
      ...this.tableKeyCache,
      ...tableKeys,
    };

    return this.tableKeyCache;
  }

  public async getTableIdsFromPage(pageUrl: string) {
    const { pathname } = new URL(pageUrl);
    const baseUrl = this.getBaseUrl(pageUrl);
    const pageId = this.toUUID(pathname.substring(pathname.length - 32));

    const { recordMap } = await this.loadPageChunk<NotionPageChunkResponse>(
      pageId,
    );

    const tableKeys = Object.values(recordMap.block)
      .filter(block => block.value && block.value.type === 'collection_view')
      .reduce((keyObject: TableKeyCache, collection) => {
        const collectionId = collection.value.collection_id;
        const tableUrl = `${baseUrl}/${collectionId}`;

        keyObject[tableUrl] = {
          collectionId,
          // TODO: Be more flexible/intelligent in choice of view
          collectionViewId: collection.value.view_ids[0],
        };

        return keyObject;
      }, {});

    this.cacheTableKeys(tableKeys);

    return tableKeys;
  }
}
