import get from 'lodash/get';
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

    return response.data;
  }

  private async getCollectionSchema() {
    const { recordMap } = await this.queryCollection(this.keys);
    return get(
      recordMap,
      `collection.${this.keys.collectionId}.value.schema`,
      {},
    );
  }

  public getKeys() {
    return this.keys;
  }

  public async getRows(filters?: object) {
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

    return filter(data, filters || {});
  }

  public async insertRows(data: object[]) {
    const schema = await this.getCollectionSchema();
    const schemaMap = Object.keys(schema).reduce((obj, key) => {
      const { name, ...rest } = schema[key];

      if (!isNil(name)) {
        // @ts-ignore
        obj[name] = { id: key, ...rest };
      }

      return obj;
    }, {});

    const entriesToInsert = data.map(datum =>
      Object.entries(datum).map(([key, value]) => {
        // @ts-ignore
        const { id, type } = schemaMap[key];

        return {
          id,
          type,
          value,
        };
      }),
    );

    return this.transactionManager.insert(entriesToInsert);
  }
}
