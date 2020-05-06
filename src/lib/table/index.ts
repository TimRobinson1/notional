import { TableKeySet } from '../notional/types';

export default class Table {
  constructor(private readonly keys: TableKeySet) {}

  public getKeys() {
    return this.keys;
  }
}
