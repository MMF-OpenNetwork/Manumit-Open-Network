"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { activeChain } from "@/lib/chain";
import type { Abi } from "viem";
import { formatUnits } from "viem";
import presaleAbiJson from "@/lib/presaleABI.json";
import {
  PRESALE_CONTRACT_ADDRESS,
  PRESALE_ROUNDS,
  PRESALE_TOKEN,
  USD_PRICE_DECIMALS,
} from "@/data/presale";

const presaleAbi = presaleAbiJson as Abi;
const POLL_INTERVAL_MS = 15_000;

export interface PresaleStats {
  /** 0 before round 1 opens and after round 2 closes. */
  round: number;
  currentPriceUsd: number;
  /** Raw USD price as stored on-chain, scaled to USD_PRICE_DECIMALS. */
  currentPriceUsdRaw: bigint;
  /** Price of the following round, or null while in the final round. */
  nextPriceUsd: number | null;
  /** Wei of ETH per whole MMC. */
  tokensSold: number;
  tokensRemaining: number;
  progressPct: number;
  isPaused: boolean;
  isSoldOut: boolean;
  /** True only when a round is open, not paused, and tokens remain. */
  isLive: boolean;
}

/**
 * outside a round window, so the round schedule in src/data/presale.ts is
 * used to decide which price to display until the sale opens. Everything
 * else (sold, remaining, paused, soldOut) reads fine at any time.
 */
export function usePresaleStats() {
  // Read once per mount rather than during render, which would make the hook
  // impure. The round windows run for months, so a live clock would be
  // redundant precision.
  const [mountedAt] = useState(() => Date.now());

  const read = {
    address: PRESALE_CONTRACT_ADDRESS,
    abi: presaleAbi,
    chainId: activeChain.id,
    query: { refetchInterval: POLL_INTERVAL_MS },
  } as const;

  const roundQuery = useReadContract({ ...read, functionName: "currentRound" });
  const priceQuery = useReadContract({ ...read, functionName: "currentPrice" });
  const soldQuery = useReadContract({ ...read, functionName: "totalSold" });
  const remainingQuery = useReadContract({ ...read, functionName: "remaining" });
  const pausedQuery = useReadContract({ ...read, functionName: "paused" });
  const soldOutQuery = useReadContract({ ...read, functionName: "soldOut" });

  // The real time of the last successful poll, straight from the query cache,
  // rather than a separate timer that only looks like it tracks the fetch.
  const lastUpdated = soldQuery.dataUpdatedAt
    ? new Date(soldQuery.dataUpdatedAt)
    : null;

  const isLoading =
    roundQuery.isLoading || soldQuery.isLoading || remainingQuery.isLoading;

  const round = Number((roundQuery.data as bigint | undefined) ?? 0n);

  // currentRound() returns 0 in three different situations — before round 1
  // opens, in the gap between rounds, and once the sale has closed — and
  // currentPrice() reverts in all of them. Falling back to PRESALE_ROUNDS[0]
  // unconditionally would advertise the round-1 price after round 1 is over,
  // so pick the round the published schedule actually says applies.
  const scheduled =
    round > 0
      ? PRESALE_ROUNDS[round - 1]
      : (PRESALE_ROUNDS.find((r) => mountedAt < new Date(r.end).getTime()) ??
         PRESALE_ROUNDS[PRESALE_ROUNDS.length - 1]);

  const onChainUsd = priceQuery.data as bigint | undefined;
  const currentPriceUsdRaw =
    onChainUsd ??
    BigInt(Math.round(scheduled.priceUsd * 10 ** USD_PRICE_DECIMALS));
  const currentPriceUsd = Number(formatUnits(currentPriceUsdRaw, USD_PRICE_DECIMALS));

  // Derived from whichever round is actually current, so "next price" goes
  // blank once the final round is running instead of pointing back at round 2.
  const nextRound = PRESALE_ROUNDS[PRESALE_ROUNDS.indexOf(scheduled) + 1];
  const nextPriceUsd = nextRound?.priceUsd ?? null;

  const soldRaw = (soldQuery.data as bigint | undefined) ?? 0n;
  const remainingRaw =
    (remainingQuery.data as bigint | undefined) ??
    BigInt(PRESALE_TOKEN.presaleAllocation) * 10n ** 18n;

  const tokensSold = Number(formatUnits(soldRaw, PRESALE_TOKEN.decimals));
  const tokensRemaining = Number(formatUnits(remainingRaw, PRESALE_TOKEN.decimals));

  const isPaused = Boolean(pausedQuery.data);
  const isSoldOut = Boolean(soldOutQuery.data);

  const stats: PresaleStats = {
    round,
    currentPriceUsd,
    currentPriceUsdRaw,
    nextPriceUsd,
    tokensSold,
    tokensRemaining,
    progressPct: Math.min(100, (tokensSold / PRESALE_TOKEN.presaleAllocation) * 100),
    isPaused,
    isSoldOut,
    isLive: round > 0 && !isPaused && !isSoldOut,
  };

  return { stats, isLoading, lastUpdated };
}
