import get from 'lodash/get';
import compact from 'lodash/compact';
import filter from 'lodash/filter';
import isNil from 'lodash/isNil';
import {
  TableKeySet,
  DateModifiers,
  TextNodeModifiers,
} from '../notional/types';
import { AxiosInstance } from 'axios';
import TransactionManager from '../transaction-manager';

export default class Block {
  transactionManager: TransactionManager;

  constructor(
    private readonly blockId: string,
    private readonly axios: AxiosInstance,
    private readonly userId: string,
  ) {
    this.transactionManager = new TransactionManager(this.axios, this.userId);
  }

  public update(content: string) {
    return this.transactionManager.update([
      {
        id: this.blockId,
        data: [
          {
            id: 'title',
            type: 'pre-formatted',
            value: [[content]],
          },
        ],
      },
    ]);
  }
}
