import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { QueryClient } from '@tanstack/react-query';

export const reownProjectId = import.meta.env.VITE_REOWN_PROJECT_ID || '';
export const reownConfigured = Boolean(reownProjectId);

export const filecoinCalibrationNetwork = {
  id: 314159,
  name: 'Filecoin Calibration',
  nativeCurrency: {
    decimals: 18,
    name: 'Filecoin',
    symbol: 'tFIL'
  },
  rpcUrls: {
    default: {
      http: ['https://api.calibration.node.glif.io/rpc/v1']
    },
    public: {
      http: ['https://api.calibration.node.glif.io/rpc/v1']
    }
  },
  blockExplorers: {
    default: {
      name: 'Blockscout',
      url: 'https://filecoin-testnet.blockscout.com'
    },
    filfox: {
      name: 'Filfox',
      url: 'https://calibration.filfox.info'
    }
  },
  testnet: true
};

export const networks = [filecoinCalibrationNetwork];
export const queryClient = new QueryClient();
export let wagmiAdapter = null;
export let wagmiConfig = null;

if (reownConfigured) {
  wagmiAdapter = new WagmiAdapter({
    projectId: reownProjectId,
    networks
  });
  wagmiConfig = wagmiAdapter.wagmiConfig;

  createAppKit({
    adapters: [wagmiAdapter],
    networks,
    defaultNetwork: filecoinCalibrationNetwork,
    projectId: reownProjectId,
    metadata: {
      name: 'PoP2048Agent',
      description: 'Proof-of-Play 2048 with Filecoin Synapse archive receipts',
      url: window.location.origin,
      icons: [`${window.location.origin}${import.meta.env.BASE_URL}assets/pop2048-favicon.svg`]
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      onramp: false
    },
    defaultAccountTypes: {
      eip155: 'eoa'
    },
    themeMode: 'light',
    themeVariables: {
      '--w3m-accent': '#19a974',
      '--w3m-border-radius-master': '8px',
      '--w3m-z-index': 1000
    }
  });
}
