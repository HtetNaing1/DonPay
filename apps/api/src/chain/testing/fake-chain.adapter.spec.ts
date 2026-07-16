import { describeChainAdapterContract } from '../chain-adapter.contract';
import { FakeChainAdapter } from './fake-chain.adapter';

// The fake is its own harness: submitPayment/setFinality are its controls.
describeChainAdapterContract('FakeChainAdapter', () => {
  const adapter = new FakeChainAdapter();
  return {
    adapter,
    addresses: {
      payout: 'fake-merchant-wallet-1',
      otherPayout: 'fake-merchant-wallet-2',
      payer: 'fake-buyer-wallet',
    },
    submitPayment: async (payment) => adapter.submitPayment(payment),
    setFinality: async (txSignature, finality) =>
      adapter.setFinality(txSignature, finality),
  };
});
