import axios from 'axios';
import examplePageChunkData from './example-page-chunk-data.json';
import Notional from '..';

jest.mock('axios');

describe('Notional', () => {
  const baseConfig = {
    apiKey: '123456',
    userId: '123456789',
  };
  const exampleTableUrl = 'https://www.notion.so/example/notional-uuid';
  const exampleTableKeys = {
    [exampleTableUrl]: {
      collectionId: 'collectionId',
      collectionViewId: 'collectionViewId',
    },
  };

  describe('getCachedTableKeys', () => {
    it('returns the cached table keys', () => {
      const notional = new Notional({
        ...baseConfig,
        cache: exampleTableKeys,
      });

      expect(notional.getCachedTableKeys()).toEqual(exampleTableKeys);
    });

    describe('when an initial cache is not provided', () => {
      it('returns an empty cache', () => {
        const notional = new Notional(baseConfig);
        expect(notional.getCachedTableKeys()).toEqual({});
      });
    });
  });

  describe('cacheTableKeys', () => {
    it('adds keys to an empty cache', () => {
      const notional = new Notional(baseConfig);

      const keysBeforeCaching = notional.getCachedTableKeys();
      notional.cacheTableKeys(exampleTableKeys);

      expect(keysBeforeCaching).toEqual({});
      expect(notional.getCachedTableKeys()).toEqual(exampleTableKeys);
    });

    it('returns the cache', () => {
      const notional = new Notional(baseConfig);

      expect(notional.cacheTableKeys(exampleTableKeys)).toEqual(
        exampleTableKeys,
      );
    });

    describe('when keys already exist in the cache', () => {
      let notional: Notional;

      beforeEach(() => {
        notional = new Notional({
          ...baseConfig,
          cache: exampleTableKeys,
        });
      });

      it('merges new keys with the exisiting cache', () => {
        const newKeys = {
          'new-table-url': {
            collectionId: 'new-key',
            collectionViewId: 'new-key-id',
          },
        };

        notional.cacheTableKeys(newKeys);

        expect(notional.getCachedTableKeys()).toEqual({
          [exampleTableUrl]: exampleTableKeys[exampleTableUrl],
          ...newKeys,
        });
      });

      it('overwrites existing keys', () => {
        notional.cacheTableKeys({
          [exampleTableUrl]: {
            collectionId: 'new-key',
            collectionViewId: 'new-key-id',
          },
        });

        expect(notional.getCachedTableKeys()).toEqual({
          [exampleTableUrl]: {
            collectionId: 'new-key',
            collectionViewId: 'new-key-id',
          },
        });
      });
    });
  });

  describe('getTableIdsFromPage', () => {
    let notional: Notional;
    const post = jest.fn(() => ({ data: examplePageChunkData }));

    beforeEach(() => {
      jest.clearAllMocks();
      (axios.create as jest.Mock).mockReturnValue({
        post,
      });

      notional = new Notional(baseConfig);
    });

    it('returns the collection keys from the returned data', async () => {
      notional = new Notional(baseConfig);

      const tableIds = await notional.getTableIdsFromPage(
        'https://www.notion.so/example-company/123456789',
      );
      expect(tableIds).toEqual({
        'https://www.notion.so/example-company/506c9abb-47be-4fb8-8656-11ad64db76d1': {
          collectionId: '506c9abb-47be-4fb8-8656-11ad64db76d1',
          collectionViewId: 'c2db5874-9077-4e4c-9a6f-d90043cefe4a',
        },
      });
    });

    it('adds the collection keys to the cache', async () => {
      notional = new Notional(baseConfig);

      const tableIds = await notional.getTableIdsFromPage(
        'https://www.notion.so/example-company/123456789',
      );
      expect(notional.getCachedTableKeys()).toEqual(tableIds);
    });

    it('formats the identifer to the correct URL', async () => {
      notional = new Notional(baseConfig);

      const tableIds = await Promise.all([
        notional.getTableIdsFromPage(
          'https://www.notion.so/example-company/nd01z389ejh783rgbx874r',
        ),
        notional.getTableIdsFromPage(
          'https://www.notion.so/best-company/gfv21jh3udg3yuidb1h3vbhj4g23',
        ),
        notional.getTableIdsFromPage(
          'https://www.notion.so/nested-company/nested-url/moihjf84whhrf63101hjxn13e',
        ),
      ]);

      const pageUrls = tableIds.map(idObject => Object.keys(idObject)[0]);
      expect(pageUrls).toEqual([
        'https://www.notion.so/example-company/506c9abb-47be-4fb8-8656-11ad64db76d1',
        'https://www.notion.so/best-company/506c9abb-47be-4fb8-8656-11ad64db76d1',
        'https://www.notion.so/nested-company/506c9abb-47be-4fb8-8656-11ad64db76d1',
      ]);
    });

    describe('when the request fails', () => {
      beforeEach(() => {
        jest.clearAllMocks();
        (axios.create as jest.Mock).mockReturnValue({
          post: jest.fn().mockRejectedValue(new Error('Network failure!')),
        });
      });

      it('throws an error', async () => {
        const error = new Error('Network failure!');

        (axios.create as jest.Mock).mockReturnValue({
          post: jest.fn().mockRejectedValue(error),
        });

        const notional = new Notional(baseConfig);
        expect(
          notional.getTableIdsFromPage(
            'https://www.notion.so/example-company/123456789',
          ),
        ).rejects.toBe(error);
      });
    });
  });
});
