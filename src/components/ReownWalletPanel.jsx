import { useEffect } from 'react';
import { Wallet } from 'lucide-react';
import { useAppKit, useAppKitAccount, useAppKitNetwork, useAppKitProvider } from '@reown/appkit/react';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { filecoinChain } from '../filecoin.js';
import { queryClient, wagmiConfig } from '../reown.js';
import { Badge } from './ui/badge.jsx';
import { Button } from './ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.jsx';

function shortAddress(address) {
  if (!address) return 'Not connected';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function ReownWalletPanelInner({ onWalletChange }) {
  const { open } = useAppKit();
  const account = useAppKitAccount({ namespace: 'eip155' });
  const network = useAppKitNetwork();
  const { walletProvider } = useAppKitProvider('eip155');
  const connected = Boolean(account.isConnected && account.address && walletProvider);
  const onTargetNetwork = Number(network.chainId) === filecoinChain.id;

  useEffect(() => {
    onWalletChange({
      connected,
      address: account.address,
      provider: walletProvider,
      chainId: network.chainId
    });
  }, [account.address, connected, network.chainId, onWalletChange, walletProvider]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Filecoin</p>
            <CardTitle>{connected ? 'Wallet connected' : 'Connect wallet'}</CardTitle>
          </div>
          <Badge variant={connected && onTargetNetwork ? 'success' : connected ? 'warning' : 'secondary'}>
            {connected && onTargetNetwork ? 'Synapse ready' : connected ? 'Switch network' : 'Reown'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground">
          {shortAddress(account.address)}
        </div>
        <Button type="button" className="w-full" onClick={() => open()}>
          <Wallet className="size-4" />
          {connected ? 'Manage wallet' : 'Connect wallet'}
        </Button>
        <CardDescription>
          {connected
            ? onTargetNetwork
              ? `${filecoinChain.name} is selected.`
              : `${filecoinChain.name} will be requested before archive.`
            : 'Reown AppKit handles injected wallets and WalletConnect.'}
        </CardDescription>
      </CardContent>
    </Card>
  );
}

export default function ReownWalletPanel(props) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ReownWalletPanelInner {...props} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
