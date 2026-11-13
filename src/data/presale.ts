/**
 * Presale configuration.
 *
 *   Sepolia  MMC token : 0x892d8FcAA3539191662918eB22E9f99Ca8478B16
 *            Presale   : 0x5AB51E9f88cEB680a64D9F887F6614A9d5e1fbb7
 *   Mainnet  MMC token : 00xBbCfE6803D40F410216E2aBEB6584Dbcf84d11aF
 *            Presale   : 0x9b6f86e21410e40f4E38D195AD35A157098660b8
 *
 * Both contracts are verified on Etherscan; the shape of the ABI in
 * src/lib/presaleABI.json is the source of truth for every read and write the
 * site performs.
 *
 * The Sepolia deployment (`ManumitCorePresale`, v0.8.37) prices every accepted
 * ERC-20 through a per-token Chainlink USD feed and the native coin through a
 * native/USD feed. There is no hard-coded token price: `currentTokenPrice(token)`
 * and `currentNativePrice()` return the payment amount owed per whole MMC, and
 * the buy widget mirrors those reads exactly. A token only appears as payable
 * once the owner has registered it with `setPaymentToken(token, true, feed)`.
 *
 * Off-chain payments (BNB, BTC/WBTC, cards and any asset the on-chain sale does
 * not accept directly) are settled by an authorised processor via
 * `recordOffchainPurchase(...)`. The website never calls that function itself —
 * it hands the visitor off to the processor's hosted checkout — so those
 * methods are marked `offchain` below.
 */

import { USE_TESTNET } from "@/lib/chain";

export interface PresaleRound {
  round: 1 | 2;
  name: string;
  description: string;
  priceUsd: number;
  /**
   * Indicative native-coin price. Mainnet only: the Sepolia contract derives
   * its native price from a live oracle, so there is no static figure to show.
   */
  priceEth?: number;
  start: string;
  end: string;
}

export interface PaymentMethod {
  id: string;
  label: string;
  chain: string;
  decimals: number;
  /** Contract address of the payment token; omitted for a chain's native coin. */
  address?: `0x${string}`;
  /**
   * The chain's own coin, bought via buyWithNative()/buyWithETH() rather than
   * buy(). Explicit rather than inferred from a missing address — BNB also has
   * no address, and must never be routed through the Ethereum native path.
   */
  native?: boolean;
  /**
   * Settled off-chain by an authorised processor and credited on-chain through
   * recordOffchainPurchase(). The wallet flow hands off to a hosted checkout
   * instead of calling the presale contract directly.
   */
  offchain?: boolean;
  available: boolean;
  note?: string;
}

interface NetworkConfig {
  token: `0x${string}`;
  presale: `0x${string}`;
  /** Block explorer base URL for the network, without a trailing slash. */
  explorer: string;
  /**
   * PRESALE_UNLOCK_TIME on the token. Bought tokens are delivered immediately
   * but cannot be transferred until this moment — the token itself reverts with
   * "MMC: presale tokens locked".
   */
  unlockDate: string;
  rounds: PresaleRound[];
  payments: PaymentMethod[];
}

const MAINNET: NetworkConfig = {
  token: "0xBbCfE6803D40F410216E2aBEB6584Dbcf84d11aF",
  presale: "0x9b6f86e21410e40f4E38D195AD35A157098660b8",
  explorer: "https://etherscan.io",
  unlockDate: "2028-07-09T00:00:00Z",
  rounds: [
    {
      round: 1,
      name: "Round 1",
      description: "Opening round at the lowest price tier.",
      priceUsd: 0.1,
      priceEth: 0.00005,
      start: "2026-09-21T00:00:00Z",
      end: "2026-12-21T23:59:59Z",
    },
    {
      round: 2,
      name: "Round 2",
      description: "Final presale round before public listing.",
      priceUsd: 0.12,
      priceEth: 0.00006,
      start: "2026-12-21T00:00:00Z",
      end: "2028-07-09T23:59:59Z",
    },
  ],
  payments: [
    { id: "eth", label: "ETH", chain: "Ethereum", decimals: 18, native: true, available: true },
    {
      id: "usdt",
      label: "USDT",
      chain: "Ethereum",
      decimals: 6,
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      available: true,
    },
    {
      id: "usdc",
      label: "USDC",
      chain: "Ethereum",
      decimals: 6,
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      available: true,
    },
    {
  id: "dai",
  label: "DAI",
  chain: "Ethereum",
  decimals: 18,
  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  available: true,
},
  ],
};

/**
 * Sepolia test deployment, used to exercise the purchase journey end to end.
 *
 * The sale is oracle-priced, so the token addresses below are only the
 * canonical Sepolia contracts the widget probes with `acceptedToken()`. A
 * method becomes payable the moment the presale owner registers that exact
 * address via `setPaymentToken(token, true, usdFeed)`. Until then the widget
 * shows it as not yet enabled rather than letting the transaction revert.
 *
 * BNB, BTC/WBTC and everything else the on-chain sale cannot take directly run
 * through the off-chain processor.
 */
const SEPOLIA: NetworkConfig = {
  token: "0xEFA09E829DAd58B1A4Cab8EEfBb7a5006d4BfA9a",
  presale: "0xEFA09E829DAd58B1A4Cab8EEfBb7a5006d4BfA9a",
  explorer: "https://sepolia.etherscan.io",
  unlockDate: "2026-10-03T00:00:00Z",
  rounds: [
    {
      round: 1,
      name: "Round 1",
      description: "Opening round at the lowest price tier.",
      priceUsd: 0.1,
      start: "2026-09-30T00:00:00Z",
      end: "2026-09-30T23:59:59Z",
    },
    {
      round: 2,
      name: "Round 2",
      description: "Final presale round before public listing.",
      priceUsd: 0.12,
      start: "2026-10-02T00:00:00Z",
      end: "2026-10-02T23:59:59Z",
    },
  ],
  payments: [
    { id: "eth", label: "ETH", chain: "Sepolia", decimals: 18, native: true, available: true },
    {
      id: "tusdt",
      label: "tUSDT",
      chain: "Sepolia",
      decimals: 6,
      address: "0x67e290f1b50099D212ad8EA99da3fE6cbb19028c",
      available: true,
    },
    {
      id: "usdc",
      label: "tUSDC",
      chain: "Sepolia",
      decimals: 6,
      address: "0x90d9099d530B38765e1cC734a4783e4ADAFB01e8",
      available: true,
    },
    {
      id: "dai",
      label: "DAI",
      chain: "Sepolia",
      decimals: 18,
      address: "0x68194a729C2450ad26072b3D33ADaCbcef39D574",
      available: true,
    },
  ],
};

const network: NetworkConfig = USE_TESTNET ? SEPOLIA : MAINNET;

export const MMC_TOKEN_ADDRESS = network.token;

/**
 * Deployed presale contract. Overridable via env for one-off deployments.
 *
 * Uses `||`, not `??`: the variable is present but empty in some .env files,
 * and an empty string would otherwise be treated as a valid override and
 * silently break every contract read.
 */
export const PRESALE_CONTRACT_ADDRESS = (process.env
  .NEXT_PUBLIC_PRESALE_CONTRACT_ADDRESS || network.presale) as `0x${string}`;

export const PRESALE_TOKEN = {
  name: "MANUMIT CORE",
  symbol: "MMC",
  decimals: 18,
  totalSupply: 6_000_000_000,
  presaleAllocation: 1_500_000_000,
  tokenContractAddress: MMC_TOKEN_ADDRESS,
  chain: USE_TESTNET ? "Sepolia Testnet" : "Ethereum Mainnet",
};

/**
 * USD prices are stored on-chain scaled to 6 decimals — ROUND1_PRICE() returns
 * 100000 for $0.10. `currentTokenPrice()` and `currentNativePrice()` return the
 * payment amount owed per whole MMC, already expressed in the payment asset's
 * smallest unit, so the widget can ceil against them directly.
 */
export const USD_PRICE_DECIMALS = 6;

export const PRESALE_UNLOCK_DATE = network.unlockDate;

export const EXPLORER_URL = network.explorer;
export const EXPLORER_NAME = USE_TESTNET ? "Sepolia Etherscan" : "Etherscan";

/**
 * Hosted checkout for off-chain payments (BNB, BTC/WBTC, cards, any asset the
 * on-chain sale does not accept). Leave blank to show the off-chain methods as
 * "Opening soon" instead of linking out.
 */
export const OFFCHAIN_PAYMENT_URL = process.env.NEXT_PUBLIC_OFFCHAIN_PAYMENT_URL || "";

/** Two rounds, per the ROUND1 and ROUND2 constants on the presale contract. */
export const PRESALE_ROUNDS: PresaleRound[] = network.rounds;

export const PAYMENT_METHODS: PaymentMethod[] = network.payments;
