import axios, { AxiosInstance } from 'axios';
import {
  Config,
  TableKeyCache,
  NotionPageChunkResponse,
  TableKeySet,
} from './types';
import { URL } from 'url';
import Table from '../table';
import Block from '../block';

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

  private formatUriFromURL(pageUrl: string) {
    const { pathname } = new URL(pageUrl);
    const baseUrl = this.getBaseUrl(pageUrl);
    const collectionId = pathname.substring(pathname.length - 32);

    return `${baseUrl}/${collectionId}`;
  }

  private async loadPageChunk<T>(pageId: string): Promise<T> {
    const response = await this.http.post<T>('/loadPageChunk', {
      ...this.baseConfig,
      pageId,
    });

    return response.data;
  }

  private async getTableKeysFromUrl(url: string): Promise<TableKeySet> {
    // TODO: support fetching & returning custom view from "v" query parameter
    const uri = this.formatUriFromURL(url);

    if (this.tableKeyCache[uri]) {
      return this.tableKeyCache[uri];
    }

    const tableIds = await this.getTableIdsFromPage(uri);
    const keys = Object.keys(tableIds);

    if (keys.length === 0) {
      throw new Error(`No table found on URL "${url}"`);
    }

    if (keys.length > 1) {
      throw new Error(`Multiple tables found on URL "${url}"`);
    }

    return tableIds[keys[0]];
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
          // TODO: Be more flexible in choice of view
          collectionViewId: collection.value.view_ids[0],
        };

        return keyObject;
      }, {});

    this.cacheTableKeys(tableKeys);

    return tableKeys;
  }

  public async table(tableUrlOrKeySet: string | TableKeySet) {
    let tableKeys: TableKeySet;

    if (typeof tableUrlOrKeySet === 'string') {
      tableKeys = await this.getTableKeysFromUrl(tableUrlOrKeySet);
    } else {
      tableKeys = tableUrlOrKeySet;
    }

    const table = new Table(tableKeys, this.http, this.userId);

    // Load table schema
    await table.getCollectionSchema();

    return table;
  }

  public block(blockId: string) {
    return new Block(blockId, this.http, this.userId);
  }
}
