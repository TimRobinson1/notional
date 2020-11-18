import { v4 as uuid } from 'uuid';
import moment from 'moment';
import flatten from 'lodash/flatten';
import { AxiosInstance } from 'axios';
import { Schema, TableKeySet, UserTextNode } from '../notional/types';
import { UpdateData } from '../table/types';

const NOTION_STAND_IN_NOTATION = '‣';
const NOTION_LIST_SEPARATOR = [','];

export default class TransactionManager {
  constructor(
    private readonly axios: AxiosInstance,
    private readonly userId: string,
    private readonly keys?: TableKeySet,
  ) {}

  private formatToDateNode(dateNode: string | string[]) {
    if (Array.isArray(dateNode)) {
      const startDate = moment(dateNode[0]);
      const endDate = moment(dateNode[1]);

      return {
        type: 'datetimerange',
        start_date: startDate.format('YYYY-MM-DD'),
        start_time: startDate.format('HH:mm'),
        end_date: endDate.format('YYYY-MM-DD'),
        end_time: endDate.format('HH:mm'),
      };
    }

    return {
      type: 'datetime',
      start_date: moment(dateNode).format('YYYY-MM-DD'),
      start_time: moment(dateNode).format('HH:mm'),
    };
  }

  private formatUserType(value: string | string[]) {
    if (!Array.isArray(value)) {
      return [[NOTION_STAND_IN_NOTATION, [['u', value]]]];
    }

    const users = [] as UserTextNode[];

    value.forEach((userId, index) => {
      users.push([NOTION_STAND_IN_NOTATION, [['u', userId]]]);

      if (index !== value.length - 1) {
        users.push(NOTION_LIST_SEPARATOR);
      }
    });

    return users;
  }

  private formatToNotionTextNode(type: string, value: string | string[]) {
    switch (type) {
      case 'pre-formatted':
        return value;
      case 'url':
      case 'email':
      case 'phone_number':
      case 'file':
        return [[value, ['a', value]]];
      case 'date':
        return [
          [NOTION_STAND_IN_NOTATION, [['d', this.formatToDateNode(value)]]],
        ];
      case 'multi_select':
        return [[(value as string[]).join(',')]];
      case 'user':
      case 'person':
        return this.formatUserType(value);
      case 'checkbox':
        return value ? [['Yes']] : null;
      default:
        return [[value]];
    }
  }

  private submitTransaction(transactions: any[]) {
    return this.axios.post('submitTransaction', {
      requestId: uuid(),
      transactions,
    });
  }

  public async update(insertionData: UpdateData[]) {
    const now = new Date().getTime();
    const transactions = insertionData.map(({ id, data }) => ({
      id: uuid(),
      operations: [
        ...data.map((entry: any) => ({
          id: id,
          table: 'block',
          path: ['properties', entry.id],
          command: 'set',
          args: this.formatToNotionTextNode(entry.type, entry.value),
        })),
        {
          id,
          table: 'block',
          path: ['last_edited_time'],
          command: 'set',
          args: now,
        },
      ],
    }));

    return await this.submitTransaction(transactions);
  }

  public async delete(blockIds: string[]) {
    const now = new Date().getTime();
    const transactions = blockIds.map(id => ({
      id: uuid(),
      operations: [
        {
          id,
          table: 'block',
          path: [],
          command: 'update',
          args: {
            parent_id: this.keys?.collectionId,
            parent_table: 'collection',
            alive: false,
          },
        },
        {
          id,
          table: 'block',
          path: ['last_edited_time'],
          command: 'set',
          args: now,
        },
      ],
    }));

    return await this.submitTransaction(transactions);
  }

  public async setSchema(schema: Schema) {

    const now = new Date().getTime();
    const transactions = [{
      id: uuid(),
      operations: [
        {
          id: this.keys?.collectionId,
          table: 'collection',
          path: [],
          command: 'update',
          args: {
            schema
          },
        }
      ]
    }];
    return await this.submitTransaction(transactions);
  }

  public async insert(data: object[][]) {
    const now = new Date().getTime();

    const newBlockIds = data.map(_ => uuid());
    const dataToInsert = data.map((row, index) => ({
      id: uuid(),
      operations: row.map((entry: any) => ({
        id: newBlockIds[index],
        table: 'block',
        path: ['properties', entry.id],
        command: 'set',
        args: this.formatToNotionTextNode(entry.type, entry.value),
      })),
    }));

    const transactions = [
      {
        id: uuid(),
        operations: flatten(
          newBlockIds.map(newBlockId => [
            {
              id: newBlockId,
              table: 'block',
              path: [],
              command: 'set',
              args: {
                type: 'page',
                id: newBlockId,
                version: 1,
              },
            },
            {
              table: 'collection_view',
              id: this.keys?.collectionViewId,
              path: ['page_sort'],
              command: 'listAfter',
              args: {
                id: newBlockId,
              },
            },
            {
              id: newBlockId,
              table: 'block',
              path: [],
              command: 'update',
              args: {
                parent_id: this.keys?.collectionId,
                parent_table: 'collection',
                alive: true,
              },
            },
            {
              table: 'block',
              id: newBlockId,
              path: ['created_by_id'],
              command: 'set',
              args: this.userId,
            },
            {
              table: 'block',
              id: newBlockId,
              path: ['created_by_table'],
              command: 'set',
              args: 'notion_user',
            },
            {
              table: 'block',
              id: newBlockId,
              path: ['created_time'],
              command: 'set',
              args: now,
            },
            {
              table: 'block',
              id: newBlockId,
              path: ['last_edited_time'],
              command: 'set',
              args: now,
            },
            {
              table: 'block',
              id: newBlockId,
              path: ['last_edited_by_id'],
              command: 'set',
              args: this.userId,
            },
            {
              table: 'block',
              id: newBlockId,
              path: ['last_edited_by_table'],
              command: 'set',
              args: 'notion_user',
            },
          ]),
        ),
      },
      ...dataToInsert,
    ];

    return await this.submitTransaction(transactions);
  }
}
