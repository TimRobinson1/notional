import get from 'lodash/get';
import compact from 'lodash/compact';
import isEqual from 'lodash/isEqual';
import {
  TableKeySet,
  TextNode,
  DateModifiers,
  TextNodeModifiers,
  UserModifiers,
  UserCache,
  NotionQueryCollectionResponse,
  Schema,
  Space,
  UserRecordsToFetch,
  UserList,
  KeyValues,
  FormattedData,
  PageBlock,
} from '../notional/types';
import { AxiosInstance } from 'axios';
import TransactionManager from '../transaction-manager';
import { UpdateData } from './types';

const METADATA_TYPES = [
  'created_by',
  'created_time',
  'last_edited_by',
  'last_edited_time',
];

export default class Table {
  transactionManager: TransactionManager;
  queryCaching: boolean;
  cachedQueryData: object | null;
  schema: object | null;
  users: UserCache[] | null;

  constructor(
    private readonly keys: TableKeySet,
    private readonly axios: AxiosInstance,
    private readonly userId: string,
  ) {
    this.transactionManager = new TransactionManager(
      this.axios,
      this.userId,
      this.keys,
    );
    this.queryCaching = false;
    this.cachedQueryData = null;
    this.schema = null;
    this.users = null;
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
        // TODO: Return a user name
        return textModifiers[0][1];
      }
    }

    return textValue;
  }

  private formatRawDataToType(data: TextNode[], type: string) {
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

  private useBlockValueForType(
    type: string,
    data: Omit<PageBlock['value'], 'properties'>,
  ) {
    const {
      last_edited_by_id: lastEdited,
      last_edited_time: lastTimeEdited,
      created_by_id: createdBy,
      created_time: timeCreated,
    } = data;

    switch (type) {
      case 'last_edited_by':
        return lastEdited;
      case 'last_edited_time':
        return lastTimeEdited ? new Date(lastTimeEdited).toISOString() : null;
      case 'created_by':
        return createdBy;
      case 'created_time':
        return timeCreated ? new Date(timeCreated).toISOString() : null;
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

  private formatToUserId(value: string) {
    if (!this.users) {
      return value;
    }

    const user = this.users.find(
      user =>
        user.id === value ||
        `${user.firstname} ${user.lastname}`.toLowerCase() ===
          value.toLowerCase(),
    );

    return user?.id || value;
  }

  private async getFilteredBlockData(
    filters: KeyValues,
    additionalData: KeyValues = {},
    filterByAdditionalData = false,
  ) {
    const { result, recordMap } = (await this.queryCollection(
      this.keys,
    )) as NotionQueryCollectionResponse;
    const blocks = result.blockIds.map((id: string) => recordMap.block[id]);
    const schema = get(
      recordMap,
      `collection.${this.keys.collectionId}.value.schema`,
      {},
    ) as Schema;

    const rowData = blocks.map(block => {
      return {
        block_id: block.value.id,
        block_data: block.value.properties,
      };
    });

    const filterKeys = Object.keys(filters);

    return rowData
      .map(row => {
        let filterOutRow = (filterKeys.length > 0) ? true : false;

        const formattedData = Object.entries(schema).reduce(
          (data, [key, headingData]) => {
            let value;
            if (!row.block_data || !row.block_data[key]) {
              value = this.getDefaultValueForType(headingData.type);
            } else {
              value = this.formatRawDataToType(
                row.block_data[key],
                headingData.type,
              );
            }
            if (
              filterKeys.includes(headingData.name) &&
              filters[headingData.name] === value
            ) {
              filterOutRow = false;
            }

            let newValue = additionalData[headingData.name];

            if (['user', 'person'].includes(headingData.type)) {
              newValue = this.formatToUserId(
                additionalData[headingData.name] as string,
              );
            }

            if (!(filterByAdditionalData && !newValue)) {
              data = data.concat({
                id: key,
                name: headingData.name,
                type: headingData.type,
                value: newValue !== undefined ? newValue : value,
              } as FormattedData);
            }

            return data;
          },
          [] as FormattedData[],
        );

        if (filterOutRow) {
          return;
        }

        return { id: row!.block_id, data: formattedData };
      })
      .filter(Boolean);
  }

  public async getUsers() {
    if (this.users && this.users.length) {
      return Promise.resolve(this.users);
    }

    const response = await this.axios.post('loadUserContent', {});
    const notionSpaces = Object.values(
      response?.data?.recordMap?.space || {},
    ) as Space[];

    const groupedUserIds = notionSpaces.map(space =>
      (space?.value?.permissions || []).map(permission => permission.user_id),
    );

    const uniqueIds = [].concat(...(groupedUserIds as any));
    const userIds = Array.from(new Set(uniqueIds)) as string[];

    const userRecordsResponse = await this.axios.post('syncRecordValues', {
      recordVersionMap: {
        notion_user: userIds.reduce((block, id) => {
          block[id] = -1;

          return block;
        }, {} as UserRecordsToFetch),
      },
    });

    const notionUsers = userRecordsResponse?.data?.recordMap
      ?.notion_user as UserList;
    this.users = Object.values(notionUsers || {}).map(userRecord => ({
      email: userRecord.value.email,
      id: userRecord.value.id,
      firstname: userRecord.value.given_name,
      lastname: userRecord.value.family_name,
      photo: userRecord.value.profile_photo
    }));

    return this.users;
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
    ) as Schema;

    this.schema = Object.keys(rawSchema).reduce((obj, key) => {
      const { name, ...rest } = rawSchema[key];

      if (name !== undefined && name !== null) {
        obj[name] = { ...rest, id: key };
      }

      return obj;
    }, {} as Record<string, { id: string; type: string }>);

    return this.schema;
  }

  public getKeys() {
    return this.keys;
  }

  public async getRows(filters: object = {}) {
    const { result, recordMap } = (await this.queryCollection(
      this.keys,
    )) as NotionQueryCollectionResponse;
    const blocks = result.blockIds.map((id: string) => recordMap.block[id]);
    const schema = get(
      recordMap,
      `collection.${this.keys.collectionId}.value.schema`,
      {},
    ) as Schema;

    const data = blocks.map(
      ({ value: { properties: row, ...additionalProperties } }) => {
        return Object.entries(schema).reduce(
          (data, [key, headingData]) => {
            if (!row || !row[key]) {
              data[headingData.name] = this.getDefaultValueForType(
                headingData.type,
              );
            } else {
              data[headingData.name] = this.formatRawDataToType(
                row[key],
                headingData.type,
              );
            }

            if (METADATA_TYPES.includes(headingData.type)) {
              data[headingData.name] = this.useBlockValueForType(
                headingData.type,
                additionalProperties,
              );
            }

            return data;
          },
          { id: additionalProperties.id } as Record<string, any>,
        );
      },
    );

    return data.filter(row => {
      const filterKeys = Object.keys(filters);
      const applicableFilterKeys = Object.keys(row).filter(key =>
        filterKeys.includes(key),
      );

      return applicableFilterKeys.every(filterKey => {
        const filter = (filters as any)[filterKey];

        if (typeof filter === 'function') {
          return filter(row[filterKey]);
        } else {
          return isEqual(filter, row[filterKey]);
        }
      });
    });
  }

  public async insertRows(data: object[]) {
    const schemaMap = (await this.getCollectionSchema()) as Schema;
    const entriesToInsert = data.map(datum =>
      compact(
        Object.entries(datum).map(([key, value]) => {
          const schemaData = schemaMap[key];

          if (key === 'id') {
            return {
              id: 'id',
              type: 'id',
              value,
            };
          }

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

  public async updateRows(dataToUpdate: KeyValues, filters: KeyValues = {}) {
    this.setQueryCaching(true);
    const data = (await this.getFilteredBlockData(
      filters,
      dataToUpdate,
      true,
    )) as UpdateData[];
    this.setQueryCaching(false);

    if (!data.length) {
      return [];
    }

    return await this.transactionManager.update(data);
  }

  public async deleteRows(filters: KeyValues = {}) {
    this.setQueryCaching(true);
    const data = (await this.getFilteredBlockData(filters)) as { id: string }[];
    this.setQueryCaching(false);

    if (!data.length) {
      return [];
    }

    return await this.transactionManager.delete(data.map(block => block.id));
  }

  public where(filters: KeyValues = {}) {
    return {
      update: (data: KeyValues) => this.updateRows(data, filters),
      delete: () => this.deleteRows(filters),
      get: () => this.getRows(filters),
    };
  }
}
