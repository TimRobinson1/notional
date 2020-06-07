import Block from '..';
import TransactionManager from '../../transaction-manager';

jest.mock('../../transaction-manager');

describe('Block', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('update', () => {
    it('calls the transaction manager to update', async () => {
      const update = jest.fn();
      (TransactionManager as jest.Mock).mockImplementation(() => {
        return { update };
      });
      const blockId = '123';
      const userId = 'abc';
      const updatedText = 'hello';
      const block = new Block(blockId, {} as any, userId);

      await block.update('hello');

      expect(update).toHaveBeenCalledWith([
        {
          id: blockId,
          data: [
            {
              id: 'title',
              type: 'pre-formatted',
              value: [[updatedText]],
            },
          ],
        },
      ]);
    });
  });
});
