import { getDefaultConfig, type Wallet, type WalletList } from "@rainbow-me/rainbowkit";
import { coinbaseWallet, metaMaskWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConnector, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { activeChain } from "@/lib/chain";

/**
 * One chain only, so nothing unexpected can appear in the RainbowKit
 * connect/network UI. That chain is Sepolia by default; set
 * NEXT_PUBLIC_USE_TESTNET=false to switch it to Ethereum Mainnet.
 *
 * appUrl / appDescription / appIcon are not cosmetic: RainbowKit fills the
 * MetaMask connection screen from `dappMetadata.url`. If it is empty the
 * extension's approval modal can crash with "Cannot read properties of
 * undefined (reading 'origin')". RainbowKit falls back to
 * `window.location.origin`, which is undefined during SSR and null in an
 * opaque/embedded frame, so an explicit value is set here. On the client the
 * live origin wins (localhost, 127.0.0.1, previews); on the server the
 * configured site URL is used.
 */
const appUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_SITE_URL || "https://manumitme.com";

/**
 * RainbowKit throws at module-evaluation time (breaking the build, even for
 * unrelated pages) if projectId is an empty string, so a placeholder is used
 * until a real one is set. Only the WalletConnect/mobile-wallet connectors
 * need it — injected browser wallets do not.
 */
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  "00000000000000000000000000000000";

/**
 * MetaMask, wired to the plain injected provider (eth_requestAccounts) rather
 * than the MetaMask SDK.
 *
 * RainbowKit's stock metaMaskWallet routes through @metamask/sdk, which calls
 * `wallet_requestPermissions`. That opens MetaMask's "Review permissions →
 * Use your enabled networks" screen, and a bug in current MetaMask builds
 * crashes that screen with
 * "Cannot read properties of undefined (reading 'origin')". The injected path
 * never issues `wallet_requestPermissions`, so the buggy screen is skipped.
 *
 * Branding (name, icon, download links) is reused from RainbowKit's own
 * connector; only the connector factory is swapped.
 */
const metaMaskInjected: Wallet = {
  ...metaMaskWallet({ projectId }),
  createConnector: (walletDetails) =>
    createConnector((config) => ({
      ...injected({ target: "metaMask" })(config),
      ...walletDetails,
    })),
};

const wallets: WalletList = [
  {
    groupName: "Recommended",
    wallets: [() => metaMaskInjected, coinbaseWallet, walletConnectWallet],
  },
];

export const wagmiConfig = getDefaultConfig({
  appName: "Manumit Me Foundation",
  appDescription: "MANUMIT CORE (MMC) — the Manumit Me Foundation presale.",
  appUrl,
  appIcon: `${appUrl}/logos/foundation-logo.png`,
  projectId,
  wallets,
  chains: [activeChain],
  transports: {
  [activeChain.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
},
  ssr: true,
});

