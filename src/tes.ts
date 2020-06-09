import notional from './lib/notional';

async function run() {
  const { table, block } = notional({
    apiKey:
      'fbc8aac01a91cdccadb120f3389def57560041730b8b33d69296acc694a2cbf10f80134c9671307c0a274c540367449d3331ed87ee9c315b1628a7d8d38abf55a8039c72cbc2e9314730c626c9a4',
    userId: '19ba23f4-8a7a-4344-8baf-9573367fce0b',
  });

  // const userTable = await table('https://www.notion.so/birdie/f51184ee6ecc41afbd9b796e35fa0c28');
  const userTable = await table(
    'https://www.notion.so/birdie/481ef7846c1a4f0c8f30e3a3911d9129',
  );

  console.log(await userTable.where({ Name: 'dods' }).get());

  // await userTable
  //   .where({ Name: 'dods' })
  //   .update({
  //     Person: 'Tim Robinson'
  //   });

  // const dateBlock = block('382c5059-3aa8-4cdd-a576-284ef11403b2');
  // await dateBlock
  //   .update(
  //     (new Date()).toISOString()
  //   );

  // We can call loadUserContent to get users, then call syncRecordValues with { id: -1 } to get data on that user

  return 'success';
}

run().then(console.log).catch(console.error);
