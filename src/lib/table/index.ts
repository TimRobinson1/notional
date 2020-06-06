import get from 'lodash/get';
import compact from 'lodash/compact';
import filter from 'lodash/filter';
import isNil from 'lodash/isNil';
import {
  TableKeySet,
  TextNode,
  DateModifiers,
  TextNodeModifiers,
  UserModifiers,
} from '../notional/types';
import { AxiosInstance } from 'axios';
import TransactionManager from './transaction-manager';

export default class Table {
  transactionManager: TransactionManager;
  queryCaching: boolean;
  cachedQueryData: object | null;
  schema: object | null;

  constructor(
    private readonly keys: TableKeySet,
    private readonly axios: AxiosInstance,
    private readonly userId: string,
  ) {
    this.transactionManager = new TransactionManager(
      this.axios,
      this.keys,
      this.userId,
    );
    this.queryCaching = false;
    this.cachedQueryData = null;
    this.schema = null;
  }

  private setQueryCaching(caching: boolean) {
    this.queryCaching = caching;

    if (!caching) {
      this.cachedQueryData = null;
    }
  }

  private isDateModifier(
    modifiers: TextNodeModifiers,
  ): modifiers is DateModifiers {
    return !!modifiers && !!modifiers[0] && modifiers[0][0] === 'd';
  }

  private isUserModifier(
    modifiers: TextNodeModifiers,
  ): modifiers is UserModifiers {
    return !!modifiers && !!modifiers[0] && modifiers[0][0] === 'u';
  }

  private parseText(textNode?: TextNode[]) {
    if (!textNode) {
      return '';
    }

    const [textValue, textModifiers] = textNode[0];

    if (textModifiers) {
      if (this.isDateModifier(textModifiers)) {
        return textModifiers[0][1];
      } else if (this.isUserModifier(textModifiers)) {
        // TODO: Implement a means of fetching a user name for this user_id
        return textModifiers[0][1];
      }
    }

    return textValue;
  }

  // TODO - type me!
  private formatRawDataToType(data: any, type: string) {
    const stringValue = this.parseText(data);

    switch (type) {
      case 'multi_select':
        return (stringValue as string).split(',');
      case 'checkbox':
        return stringValue === 'Yes';
      default:
        return stringValue;
    }
  }

  // TODO - type me!
  private getDefaultValueForType(type: string) {
    switch (type) {
      case 'file':
      case 'multi_select':
        return [];
      case 'checkbox':
        return false;
      default:
        return null;
    }
  }

  private async queryCollection({
    collectionId,
    collectionViewId,
  }: TableKeySet) {
    if (this.queryCaching && this.cachedQueryData) {
      return Promise.resolve(this.cachedQueryData);
    }

    const response = await this.axios.post('/queryCollection', {
      collectionId,
      collectionViewId,
      loader: {
        limit: 100,
        loadContentCover: false,
        type: 'table',
        userLocale: 'en',
        userTimeZone: 'Europe/London',
      },
      query: {
        aggregate: [],
        filter: [],
        filter_operator: 'and',
        sort: [],
      },
    });

    if (this.queryCaching) {
      this.cachedQueryData = response.data;
    }

    return response.data;
  }

  private async getFilteredBlockData(
    filters: object,
    additionalData: object = {},
  ) {
    const { result, recordMap } = await this.queryCollection(this.keys);
    const blocks = result.blockIds.map((id: string) => recordMap.block[id]);
    const schema = get(
      recordMap,
      `collection.${this.keys.collectionId}.value.schema`,
      {},
    );

    const rowData = blocks.map((block: any) => {
      if (block.value.properties) {
        return {
          block_id: block.value.id,
          block_data: block.value.properties,
        };
      }
    });

    const filterKeys = Object.keys(filters);

    return rowData
      .map((row: any) => {
        let filterOutRow = true;

        const formattedData = Object.entries(schema).reduce(
          (data, [key, headingData]: any) => {
            let value;
            if (!row || !row.block_data || !row.block_data[key]) {
              value = this.getDefaultValueForType(headingData.type);
            } else {
              value = this.formatRawDataToType(
                row.block_data[key],
                headingData.type,
              );
            }

            if (
              filterKeys.includes(headingData.name) &&
              // @ts-ignore
              filters[headingData.name] === value
            ) {
              filterOutRow = false;
            }

            // @ts-ignore
            const newValue = additionalData[headingData.name];

            data = data.concat({
              // @ts-ignore
              id: key,
              name: headingData.name,
              type: headingData.type,
              value: newValue !== undefined ? newValue : value,
            });

            return data;
          },
          [],
        );

        if (filterOutRow) {
          return;
        }

        // @ts-ignore
        return { id: row.block_id, data: formattedData };
      })
      .filter(Boolean);
  }

  public async getCollectionSchema() {
    if (this.schema) {
      return Promise.resolve(this.schema);
    }

    const collectionBlocks = await this.queryCollection(this.keys);

    const rawSchema = get(
      collectionBlocks,
      `recordMap.collection.${this.keys.collectionId}.value.schema`,
      {},
    );

    this.schema = Object.keys(rawSchema).reduce((obj, key) => {
      // @ts-ignore
      const { name, ...rest } = rawSchema[key];

      if (!isNil(name)) {
        // @ts-ignore
        obj[name] = { id: key, ...rest };
      }

      return obj;
    }, {});

    return this.schema;
  }

  public getKeys() {
    return this.keys;
  }

  public async getRows(filters: object = {}) {
    const { result, recordMap } = await this.queryCollection(this.keys);
    const blocks = result.blockIds.map((id: string) => recordMap.block[id]);
    const schema = get(
      recordMap,
      `collection.${this.keys.collectionId}.value.schema`,
      {},
    );
    const rowData = blocks.map((block: any) => block.value.properties);

    const data = rowData.map((row: any) => {
      // @ts-ignore
      return Object.entries(schema).reduce((data, [key, headingData]: any) => {
        if (!row || !row[key]) {
          // @ts-ignore
          data[headingData.name] = this.getDefaultValueForType(
            headingData.type,
          );
        } else {
          // @ts-ignore
          data[headingData.name] = this.formatRawDataToType(
            row[key],
            headingData.type,
          );
        }

        return data;
      }, {});
    });

    return filter(data, filters);
  }

  public async insertRows(data: object[]) {
    const schemaMap = await this.getCollectionSchema();
    const entriesToInsert = data.map(datum =>
      compact(
        Object.entries(datum).map(([key, value]) => {
          // @ts-ignore
          const schemaData = schemaMap[key];

          if (!schemaData) {
            console.warn(`Unrecognised key "${key}". Ignoring.`);
            return;
          }

          const { id, type } = schemaData;
          return {
            id,
            type,
            value,
          };
        }),
      ),
    );

    return this.transactionManager.insert(entriesToInsert);
  }

  public async updateRows(dataToUpdate: object, filters: object = {}) {
    this.setQueryCaching(true);
    const data = await this.getFilteredBlockData(filters, dataToUpdate);
    this.setQueryCaching(false);

    if (!data.length) {
      return [];
    }

    return await this.transactionManager.update(data);
  }

  public async deleteRows(filters: object = {}) {
    this.setQueryCaching(true);
    const data = await this.getFilteredBlockData(filters);
    this.setQueryCaching(false);

    if (!data.length) {
      return [];
    }

    return await this.transactionManager.delete(
      data.map((block: any) => block.id),
    );
  }
}
