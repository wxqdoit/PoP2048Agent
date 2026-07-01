const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const maxArchiveBytes = 256 * 1024;
const source = 'pop2048-agent';

export const filecoinChain = {
  id: 314159,
  name: 'Filecoin - Calibration testnet',
  nativeCurrency: {
    name: 'Filecoin',
    symbol: 'tFIL',
    decimals: 18
  },
  rpcUrls: {
    default: {
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
  }
};

const mainnetChainInfo = {
  id: 314,
  name: 'Filecoin',
  nativeCurrency: {
    name: 'Filecoin',
    symbol: 'FIL',
    decimals: 18
  }
};

function toHexChainId(chain) {
  return `0x${chain.id.toString(16)}`;
}

function explorerUrls(chain) {
  return Object.values(chain.blockExplorers || {}).map((explorer) => explorer.url);
}

function chainParams(chain) {
  return {
    chainId: toHexChainId(chain),
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: chain.rpcUrls.default.http,
    blockExplorerUrls: explorerUrls(chain)
  };
}

async function ensureChain(provider, chain) {
  const targetChainId = toHexChainId(chain);
  const currentChainId = await provider.request({ method: 'eth_chainId' });
  if (currentChainId?.toLowerCase() === targetChainId) return;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetChainId }]
    });
  } catch (error) {
    if (error?.code !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [chainParams(chain)]
    });
  }
}

export async function createSynapseFromProvider({ provider, address }) {
  if (!provider?.request) {
    throw new Error('Reown wallet provider is not connected.');
  }
  if (!address) {
    throw new Error('Wallet address is not connected.');
  }

  await ensureChain(provider, filecoinChain);

  const [{ Synapse, calibration }, { custom }] = await Promise.all([
    import('@filoz/synapse-sdk'),
    import('viem')
  ]);

  const synapse = Synapse.create({
    account: address,
    chain: calibration,
    transport: custom(provider),
    source,
    withCDN: false
  });

  return synapse;
}

function proofBytes(proof, digest) {
  const envelope = {
    proof,
    digest,
    archivedAt: new Date().toISOString(),
    source
  };
  const bytes = textEncoder.encode(JSON.stringify(envelope, null, 2));
  if (bytes.byteLength > maxArchiveBytes) {
    throw new Error(`Proof package exceeds ${maxArchiveBytes} bytes.`);
  }
  return bytes;
}

function pieceCidToString(pieceCid) {
  return typeof pieceCid === 'string' ? pieceCid : String(pieceCid);
}

function serializeCopy(copy) {
  return {
    providerId: copy.providerId?.toString(),
    dataSetId: copy.dataSetId?.toString(),
    pieceId: copy.pieceId?.toString(),
    role: copy.role,
    retrievalUrl: copy.retrievalUrl,
    isNewDataSet: copy.isNewDataSet
  };
}

export async function archiveProofWithWallet({ synapse, proof, digest, callbacks = {} }) {
  const bytes = proofBytes(proof, digest);

  callbacks.onStatus?.('Preparing Filecoin storage payment.');
  const preflight = await synapse.storage.prepare({
    dataSize: BigInt(bytes.byteLength)
  });

  let paymentTxHash = null;
  if (preflight.transaction) {
    const prepared = await preflight.transaction.execute({
      onHash: (hash) => {
        paymentTxHash = hash;
        callbacks.onStatus?.('Payment transaction submitted.');
        callbacks.onTransaction?.(hash);
      }
    });
    paymentTxHash = prepared.hash || paymentTxHash;
  }

  callbacks.onStatus?.('Uploading proof package to Filecoin storage.');
  const result = await synapse.storage.upload(bytes, {
    copies: 2,
    pieceMetadata: {
      app: 'PoP2048Agent',
      schema: proof.schema,
      digest,
      sessionId: proof.session.id,
      turns: String(proof.session.turns)
    },
    callbacks: {
      onProgress: (bytesUploaded) => callbacks.onUploadProgress?.(bytesUploaded, bytes.byteLength),
      onProviderSelected: (provider) => callbacks.onStatus?.(`Selected provider ${provider.id}.`),
      onStored: (providerId) => callbacks.onStatus?.(`Stored primary copy with provider ${providerId}.`),
      onPiecesAdded: (transaction) => {
        callbacks.onStatus?.('Commit transaction submitted.');
        callbacks.onTransaction?.(transaction);
      },
      onCopyComplete: (providerId) => callbacks.onStatus?.(`Copy complete with provider ${providerId}.`),
      onCopyFailed: (providerId, pieceCid, error) => callbacks.onStatus?.(`Provider ${providerId} copy failed: ${error.message}`)
    }
  });

  const pieceCid = pieceCidToString(result.pieceCid);
  callbacks.onStatus?.('Filecoin proof archived.');

  return {
    pieceCid,
    chain: filecoinChain.name,
    bytes: result.size || bytes.byteLength,
    digest,
    complete: Boolean(result.complete),
    requestedCopies: result.requestedCopies,
    copies: result.copies.map(serializeCopy),
    failedAttempts: result.failedAttempts,
    paymentTxHash
  };
}

export async function retrieveProofWithWallet(synapse, pieceCid) {
  const downloaded = await synapse.storage.download({ pieceCid });
  const parsed = JSON.parse(textDecoder.decode(downloaded));
  return {
    pieceCid,
    digest: parsed.digest || null,
    proof: parsed.proof,
    archivedAt: parsed.archivedAt || null
  };
}

export function supportedNetworks() {
  return [filecoinChain, mainnetChainInfo].map((chain) => ({
    id: chain.id,
    name: chain.name
  }));
}
