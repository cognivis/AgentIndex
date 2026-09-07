// One-off: create the Hedera account that the seeded services receive
// payments on, funded from the main (prober) account. Prints env lines.
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });

import {
  AccountCreateTransaction,
  Client,
  Hbar,
  PrivateKey,
} from '@hiero-ledger/sdk';

const client = Client.forTestnet().setOperator(
  process.env.HEDERA_ACCOUNT_ID!,
  PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY!),
);

const key = PrivateKey.generateECDSA();
const tx = await new AccountCreateTransaction()
  .setECDSAKeyWithAlias(key)
  .setInitialBalance(new Hbar(50))
  .setMaxAutomaticTokenAssociations(-1)
  .execute(client);

const receipt = await tx.getReceipt(client);
console.log(`HEDERA_SERVICE_ACCOUNT_ID=${receipt.accountId}`);
console.log(`HEDERA_SERVICE_PRIVATE_KEY=${key.toStringRaw()}`);
client.close();
