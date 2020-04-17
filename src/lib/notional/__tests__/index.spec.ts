import Notional from '..';

describe('Notional', () => {
  const baseConfig = {
    apiKey: '123456',
    userId: '123456789',
  };
  const exampleTableUrl = 'https://www.notion.so/example/notional-uuid';
  const exampleTableKeys = {
    [exampleTableUrl]: {
      collectionKey: 'collectionKey',
      collectionKeyId: 'collectionKeyId',
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
            collectionKey: 'new-key',
            collectionKeyId: 'new-key-id',
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
            collectionKey: 'new-key',
            collectionKeyId: 'new-key-id',
          },
        });

        expect(notional.getCachedTableKeys()).toEqual({
          [exampleTableUrl]: {
            collectionKey: 'new-key',
            collectionKeyId: 'new-key-id',
          },
        });
      });
    });
  });
});
