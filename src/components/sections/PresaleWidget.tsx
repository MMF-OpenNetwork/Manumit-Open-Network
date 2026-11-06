"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatUnits, parseAbi, parseUnits } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowTopRightOnSquareIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { activeChain } from "@/lib/chain";
import { SectionReveal } from "@/components/ui/SectionReveal";
import {
  EXPLORER_NAME,
  EXPLORER_URL,
  OFFCHAIN_PAYMENT_URL,
  PAYMENT_METHODS,
  PRESALE_CONTRACT_ADDRESS,
  PRESALE_TOKEN,
  type PaymentMethod,
} from "@/data/presale";

/* ------------------------------------------------------------------ */
/* ABIs: written out here so they always match the deployed contracts  */
/* ------------------------------------------------------------------ */

const presaleAbi = parseAbi([
  "function mmc() view returns (address)",
  "function currentRound() view returns (uint256)",
  "function paused() view returns (bool)",
  "function round1Sold() view returns (uint256)",
  "function round2Sold() view returns (uint256)",
  "function totalSold() view returns (uint256)",
  "function MAX_PRESALE() view returns (uint256)",
  "function ROUND1_ALLOCATION() view returns (uint256)",
  "function ROUND2_ALLOCATION() view returns (uint256)",
  "function ROUND1_PRICE() view returns (uint256)",
  "function ROUND2_PRICE() view returns (uint256)",
  "function ROUND1_START() view returns (uint256)",
  "function ROUND1_END() view returns (uint256)",
  "function ROUND2_START() view returns (uint256)",
  "function ROUND2_END() view returns (uint256)",
  "function PRESALE_UNLOCK_TIME() view returns (uint256)",
  "function presaleInventory() view returns (uint256)",
  "function acceptedToken(address) view returns (bool)",
  "function currentTokenPrice(address) view returns (uint256)",
  "function buy(address paymentToken, uint256 paymentAmount, uint256 minMmcOut)",
]);

const tokenAbi = parseAbi([
  "function presaleContract() view returns (address)",
  "function PRESALE_UNLOCK_TIME() view returns (uint256)",
]);

const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const STAT_FNS = [
  "currentRound",
  "paused",
  "round1Sold",
  "round2Sold",
  "totalSold",
  "MAX_PRESALE",
  "ROUND1_ALLOCATION",
  "ROUND2_ALLOCATION",
  "ROUND1_PRICE",
  "ROUND2_PRICE",
  "ROUND1_START",
  "ROUND1_END",
  "ROUND2_START",
  "ROUND2_END",
  "PRESALE_UNLOCK_TIME",
  "presaleInventory",
  "mmc",
] as const;
type StatFn = (typeof STAT_FNS)[number];

const MMC_DECIMALS = 18;
const ONE_TOKEN = 10n ** 18n;
const USD_DECIMALS = 6; // contract prices: 100_000 = $0.10
const SLIPPAGE_NUM = 995n; // accept at least 99.5% of the quoted MMC
const SLIPPAGE_DEN = 1000n;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Round up, so a buyer never underpays for the amount they asked for. */
function ceilDiv(a: bigint, b: bigint) {
  return a === 0n ? 0n : (a + b - 1n) / b;
}

function minBig(a: bigint, b: bigint) {
  return a < b ? a : b;
}

function formatUsd(value: number) {
  const decimals = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2;
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function formatCompact(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const toMs = (seconds: bigint) => Number(seconds) * 1000;
const toNum = (wei: bigint) => Number(formatUnits(wei, MMC_DECIMALS));

type Accent = "emerald" | "cyan";

const statAccentStyle: Record<Accent, { text: string; dot: string; border: string }> = {
  emerald: { text: "text-emerald-light", dot: "bg-emerald", border: "hover:border-emerald/25" },
  cyan: { text: "text-cyan", dot: "bg-cyan", border: "hover:border-cyan/30" },
};

function StatCard({
  label,
  value,
  isLoading,
  accent = "emerald",
}: {
  label: string;
  value: string;
  isLoading: boolean;
  accent?: Accent;
}) {
  const style = statAccentStyle[accent];
  return (
    <div
      className={`rounded-2xl border border-white/8 bg-white/2 p-6 text-center transition-colors ${style.border}`}
    >
      <p className="flex items-center justify-center gap-1.5 text-white/55 text-xs font-semibold uppercase tracking-wider mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        {label}
      </p>
      {isLoading ? (
        <div className="h-8 w-24 mx-auto rounded-lg bg-white/8 animate-pulse" />
      ) : (
        <p className={`font-display text-2xl sm:text-3xl font-bold ${style.text}`}>{value}</p>
      )}
    </div>
  );
}

const roundAccentStyle: Record<Accent, { card: string; badge: string }> = {
  emerald: { card: "border-emerald/25 bg-emerald/5", badge: "bg-emerald-gradient" },
  cyan: { card: "border-cyan/30 bg-cyan/8", badge: "bg-gradient-to-br from-cyan to-emerald-dark" },
};
const roundAccents: Accent[] = ["emerald", "cyan"];

/* ------------------------------------------------------------------ */
/* Widget                                                              */
/* ------------------------------------------------------------------ */

export function PresaleWidget() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const shouldReduceMotion = useReducedMotion();

  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState(
    () => PAYMENT_METHODS.find((m) => !m.native && m.available)?.id ?? PAYMENT_METHODS[0].id,
  );
  const [message, setMessage] = useState("");
  const [lastAction, setLastAction] = useState<"approve" | "buy" | null>(null);
  const [mountedAt] = useState(() => Date.now());

  const wrongNetwork = isConnected && chainId !== activeChain.id;

  // The contract has no native-ETH purchase path, so native methods are dropped.
  const methods = useMemo(() => PAYMENT_METHODS.filter((m) => !m.native), []);
  const method = methods.find((m) => m.id === methodId) ?? methods[0];
  const isOffchain = Boolean(method.offchain);

  /* ---------- presale state, read straight from the contract ---------- */

  const presale = { address: PRESALE_CONTRACT_ADDRESS, abi: presaleAbi, chainId: activeChain.id } as const;

  const {
    data: statData,
    isLoading,
    dataUpdatedAt,
    refetch: refetchStats,
  } = useReadContracts({
    contracts: STAT_FNS.map((functionName) => ({ ...presale, functionName })),
    query: { refetchInterval: 15_000 },
  });

  const stat = (name: StatFn) => statData?.[STAT_FNS.indexOf(name)]?.result as bigint | undefined;
  const big = (name: StatFn) => stat(name) ?? 0n;

  const round = Number(big("currentRound"));
  const isPaused = (statData?.[STAT_FNS.indexOf("paused")]?.result as boolean | undefined) === true;
  const isLive = round !== 0 && !isPaused;

  const mmcAddress = (stat("mmc") as unknown as `0x${string}` | undefined) ?? undefined;
  const tokenAddress = mmcAddress ?? (PRESALE_TOKEN.tokenContractAddress as `0x${string}`);

  const round1Start = toMs(big("ROUND1_START"));
  const round2End = toMs(big("ROUND2_END"));
  const unlockMs = toMs(big("PRESALE_UNLOCK_TIME"));
  const notStarted = round === 0 && round1Start > 0 && mountedAt < round1Start;
  const ended = round === 0 && round2End > 0 && mountedAt > round2End;

  const maxPresale = big("MAX_PRESALE");
  const totalSold = big("totalSold");
  const inventory = big("presaleInventory");
  const progressPct = maxPresale > 0n ? Number((totalSold * 10000n) / maxPresale) / 100 : 0;
  const isSoldOut = maxPresale > 0n && totalSold >= maxPresale;

  const rounds = useMemo(
    () => [
      {
        round: 1,
        name: "Round 1",
        priceUsd6: big("ROUND1_PRICE"),
        allocation: big("ROUND1_ALLOCATION"),
        sold: big("round1Sold"),
        start: toMs(big("ROUND1_START")),
        end: toMs(big("ROUND1_END")),
        locked: false,
      },
      {
        round: 2,
        name: "Round 2",
        priceUsd6: big("ROUND2_PRICE"),
        allocation: big("ROUND2_ALLOCATION"),
        sold: big("round2Sold"),
        start: toMs(big("ROUND2_START")),
        end: toMs(big("ROUND2_END")),
        locked: true,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statData],
  );

  const activeRound = rounds.find((r) => r.round === round);
  // Before the sale opens we show Round 1; once it ends, the last round.
  const shownRound = activeRound ?? (notStarted ? rounds[0] : ended ? rounds[1] : rounds[0]);
  const priceUsd6 = shownRound.priceUsd6;
  const currentPriceUsd = Number(formatUnits(priceUsd6, USD_DECIMALS));
  const nextRound = rounds.find((r) => r.round === shownRound.round + 1);
  const nextPriceUsd = nextRound ? Number(formatUnits(nextRound.priceUsd6, USD_DECIMALS)) : null;

  const roundRemaining = activeRound ? activeRound.allocation - activeRound.sold : 0n;
  const maxBuyable = minBig(roundRemaining, inventory);

  /* ---------- token / presale wiring check (mirrors validMMCConfiguration) ---------- */

  const { data: tokenData } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: tokenAbi, functionName: "presaleContract", chainId: activeChain.id },
      { address: tokenAddress, abi: tokenAbi, functionName: "PRESALE_UNLOCK_TIME", chainId: activeChain.id },
    ],
    query: { enabled: Boolean(mmcAddress), refetchInterval: 30_000 },
  });

  const tokenLinkedTo = tokenData?.[0]?.result as string | undefined;
  const tokenUnlock = tokenData?.[1]?.result as bigint | undefined;
  const configLoaded = tokenData !== undefined;
  const configured =
    configLoaded &&
    tokenLinkedTo?.toLowerCase() === PRESALE_CONTRACT_ADDRESS.toLowerCase() &&
    tokenUnlock === stat("PRESALE_UNLOCK_TIME");

  /* ---------- which payment tokens the owner has enabled ---------- */

  const erc20Methods = useMemo(() => methods.filter((m) => !m.offchain && m.address), [methods]);

  const { data: acceptedReads } = useReadContracts({
    contracts: erc20Methods.map((m) => ({
      ...presale,
      functionName: "acceptedToken" as const,
      args: [m.address as `0x${string}`] as const,
    })),
    query: { refetchInterval: 15_000 },
  });

  const acceptedByAddress = useMemo(() => {
    const map = new Map<string, boolean>();
    erc20Methods.forEach((m, i) => {
      map.set(m.address!.toLowerCase(), acceptedReads?.[i]?.result === true);
    });
    return map;
  }, [erc20Methods, acceptedReads]);

  const isMethodEnabled = (m: PaymentMethod) => {
    if (m.offchain) return Boolean(OFFCHAIN_PAYMENT_URL);
    return acceptedByAddress.get((m.address ?? "").toLowerCase()) === true;
  };

  const methodEnabled = isMethodEnabled(method);
  const anyOnchainEnabled = methods.some((m) => !m.offchain && isMethodEnabled(m));

  /* ---------- on-chain price of 1 MMC in the payment token ---------- */

  const { data: tokenPrice } = useReadContract({
    ...presale,
    functionName: "currentTokenPrice",
    args: method.address ? [method.address as `0x${string}`] : undefined,
    query: {
      enabled: Boolean(method.address) && !isOffchain && methodEnabled && round !== 0,
      refetchInterval: 15_000,
    },
  });
  const pricePerMmc = (tokenPrice as bigint | undefined) ?? 0n;

  /* ---------- amounts ---------- */

  const { mmcBase, cost, costLabel, usdValue } = useMemo(() => {
    let base = 0n;
    try {
      base = amount ? parseUnits(amount, MMC_DECIMALS) : 0n;
    } catch {
      base = 0n;
    }

    // USD value = mmc (18 dec) * price (6 dec) -> 24 decimals
    const usd = Number(formatUnits(base * priceUsd6, MMC_DECIMALS + USD_DECIMALS));

    if (isOffchain) {
      return { mmcBase: base, cost: 0n, costLabel: formatUsd(usd), usdValue: usd };
    }

    // Mirrors the contract: cost = amount * currentTokenPrice / 1e18, rounded up.
    const c = pricePerMmc > 0n ? ceilDiv(base * pricePerMmc, ONE_TOKEN) : 0n;
    return {
      mmcBase: base,
      cost: c,
      costLabel: `${Number(formatUnits(c, method.decimals)).toLocaleString(undefined, {
        maximumFractionDigits: method.decimals > 8 ? 6 : 2,
      })} ${method.label}`,
      usdValue: usd,
    };
  }, [amount, isOffchain, method, pricePerMmc, priceUsd6]);

  /* ---------- wallet balance + allowance for the payment token ---------- */

  const walletReadsOn = Boolean(address && method.address) && !isOffchain;

  const { data: balance } = useReadContract({
    address: method.address as `0x${string}` | undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: activeChain.id,
    query: { enabled: walletReadsOn, refetchInterval: 15_000 },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: method.address as `0x${string}` | undefined,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, PRESALE_CONTRACT_ADDRESS] : undefined,
    chainId: activeChain.id,
    query: { enabled: walletReadsOn },
  });

  const needsApproval = !isOffchain && cost > 0n && ((allowance as bigint | undefined) ?? 0n) < cost;
  const insufficientFunds =
    isConnected && !isOffchain && cost > 0n && balance !== undefined && (balance as bigint) < cost;
  const overLimit = isLive && mmcBase > maxBuyable;

  /* ---------- transactions ---------- */

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (!isConfirmed) return;
    if (lastAction === "approve") refetchAllowance();
    refetchStats();
  }, [isConfirmed, lastAction, refetchAllowance, refetchStats]);

  const statusMessage = (() => {
    if (isConfirmed && lastAction === "approve")
      return "Approval confirmed. You can complete the purchase now.";
    if (isConfirmed && lastAction === "buy") {
      return shownRound.locked
        ? `Purchase confirmed. Your ${PRESALE_TOKEN.symbol} is in your wallet and locked until ${dateFmt.format(unlockMs)}.`
        : `Purchase confirmed. Your ${PRESALE_TOKEN.symbol} is in your wallet.`;
    }
    if (writeError) {
      const e = writeError as { shortMessage?: string; message: string };
      return e.shortMessage ?? e.message;
    }
    return message;
  })();
  const statusIsError = Boolean(writeError) && !isConfirmed;

  const handleAmountChange = (raw: string) => {
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) {
      setAmount(raw);
      setMessage("");
      setLastAction(null);
      reset();
    }
  };

  const handleBuy = () => {
    setMessage("");
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (wrongNetwork) {
      switchChain?.({ chainId: activeChain.id });
      return;
    }
    if (mmcBase <= 0n) {
      setMessage("Enter an amount first.");
      return;
    }

    // Off-chain payments are credited by an authorised processor after checkout.
    if (isOffchain) {
      if (!OFFCHAIN_PAYMENT_URL) {
        setMessage("Off-chain checkout opens with the sale. Check back soon.");
        return;
      }
      const url = new URL(OFFCHAIN_PAYMENT_URL);
      if (address) url.searchParams.set("wallet", address);
      // Informational only. The checkout backend must recompute the price itself.
      url.searchParams.set("mmc", amount);
      url.searchParams.set("usd", usdValue.toFixed(2));
      window.open(url.toString(), "_blank", "noopener,noreferrer");
      return;
    }

    if (!methodEnabled || cost <= 0n) {
      setMessage(`${method.label} is not enabled for this presale yet.`);
      return;
    }
    if (overLimit) {
      setMessage(
        `Only ${formatCompact(toNum(maxBuyable))} ${PRESALE_TOKEN.symbol} left in this round.`,
      );
      return;
    }
    if (insufficientFunds) {
      setMessage(`Your wallet doesn't hold enough ${method.label}.`);
      return;
    }

    if (needsApproval) {
      setLastAction("approve");
      writeContract({
        address: method.address as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [PRESALE_CONTRACT_ADDRESS, cost],
        chainId: activeChain.id,
      });
      return;
    }

    // buy(paymentToken, paymentAmount, minMmcOut): paymentAmount is what you PAY.
    setLastAction("buy");
    writeContract({
      address: PRESALE_CONTRACT_ADDRESS,
      abi: presaleAbi,
      functionName: "buy",
      args: [method.address as `0x${string}`, cost, (mmcBase * SLIPPAGE_NUM) / SLIPPAGE_DEN],
      chainId: activeChain.id,
    });
  };

  /* ---------- button state ---------- */

  const busy = isPending || isConfirming;

  const buttonLabel = (() => {
    if (!isConnected) return "Connect Wallet to Purchase";
    if (wrongNetwork) return `Switch to ${activeChain.name}`;
    if (busy) return isConfirming ? "Confirming…" : "Check your wallet…";
    if (isOffchain) {
      return OFFCHAIN_PAYMENT_URL ? `Pay with ${method.label}` : `${method.label} opening soon`;
    }
    if (isSoldOut) return "Sold Out";
    if (isPaused) return "Sale Paused";
    if (notStarted) return `Opens ${dateFmt.format(round1Start)}`;
    if (ended) return "Sale Closed";
    if (!isLive) return "Between rounds";
    if (configLoaded && !configured) return "Presale not configured";
    if (!methodEnabled) return `${method.label} not enabled`;
    if (overLimit) return "Exceeds round limit";
    if (insufficientFunds) return `Not enough ${method.label}`;
    if (needsApproval) return `Approve ${method.label}`;
    return `Buy $${PRESALE_TOKEN.symbol}`;
  })();

  const canBuy =
    !isConnected ||
    wrongNetwork ||
    (isOffchain
      ? Boolean(OFFCHAIN_PAYMENT_URL) && mmcBase > 0n && !busy
      : isLive &&
        !isSoldOut &&
        (!configLoaded || configured) &&
        methodEnabled &&
        mmcBase > 0n &&
        cost > 0n &&
        !overLimit &&
        !insufficientFunds &&
        !busy);

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const lockApplies = shownRound.locked;

  return (
    <div className="bg-coin-black min-h-screen pt-24 pb-20">
      {/* Header */}
      <section className="relative py-16 lg:py-20 overflow-hidden border-b border-white/6">
        <div className="absolute inset-0 bg-gradient-to-br from-coin-black via-coin-near-black to-emerald-dark/10" />
        <div className="container-wide relative text-center">
          <SectionReveal>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald/25 bg-emerald/10 mb-6">
              <span className={`w-2 h-2 rounded-full bg-emerald ${isLive ? "animate-pulse" : ""}`} />
              <span className="text-emerald-light text-xs font-semibold tracking-widest uppercase">
                {isLive
                  ? `Round ${round} Live`
                  : isPaused
                    ? "Paused"
                    : notStarted
                      ? "Opening Soon"
                      : ended
                        ? "Presale Ended"
                        : "Presale"}
              </span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4">
              <span className="text-emerald-gradient">${PRESALE_TOKEN.symbol}</span>{" "}
              {isLive ? "Presale is Live!" : "Presale"}
            </h1>
            <p className="text-white/55 max-w-xl mx-auto text-lg">
              {PRESALE_TOKEN.name} ({PRESALE_TOKEN.symbol}) on {PRESALE_TOKEN.chain}
            </p>
            {notStarted && (
              <p className="text-white/50 text-sm mt-3">Round 1 opens {dateFmt.format(round1Start)}</p>
            )}
          </SectionReveal>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="container-wide max-w-4xl">
          {/* Stat cards */}
          <SectionReveal>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <StatCard
                label={isLive ? "Current Price" : "Round 1 Price"}
                value={formatUsd(currentPriceUsd)}
                isLoading={isLoading}
                accent="emerald"
              />
              <StatCard
                label="Next Round Price"
                value={nextPriceUsd === null ? "Final round" : formatUsd(nextPriceUsd)}
                isLoading={isLoading}
                accent="cyan"
              />
              <StatCard
                label="Round Remaining"
                value={`${formatCompact(toNum(isLive ? roundRemaining : 0n))} ${PRESALE_TOKEN.symbol}`}
                isLoading={isLoading}
                accent="emerald"
              />
            </div>
          </SectionReveal>

          {/* Widget card */}
          <SectionReveal delay={0.1}>
            <div className="rounded-3xl border border-emerald/15 bg-white/2 p-6 sm:p-8">
              {/* Sold / remaining */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-white/55 text-xs font-semibold uppercase tracking-wider mb-1">
                    Tokens Sold
                  </p>
                  {isLoading ? (
                    <div className="h-6 w-28 rounded-lg bg-white/8 animate-pulse" />
                  ) : (
                    <p className="text-white font-semibold text-lg">
                      {formatCompact(toNum(totalSold))}{" "}
                      <span className="text-white/50 text-sm">{PRESALE_TOKEN.symbol}</span>
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-white/55 text-xs font-semibold uppercase tracking-wider mb-1">
                    Total Remaining
                  </p>
                  {isLoading ? (
                    <div className="h-6 w-24 rounded-lg bg-white/8 animate-pulse ml-auto" />
                  ) : (
                    <p className="text-white font-semibold text-lg">
                      {formatCompact(toNum(maxPresale - totalSold))}{" "}
                      <span className="text-white/50 text-sm">{PRESALE_TOKEN.symbol}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-2">
                <div className="h-3 rounded-full bg-white/8 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${isLoading ? 0 : progressPct}%` }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.8, ease: "easeOut" }}
                    className="h-full rounded-full bg-gradient-to-r from-emerald-dark via-emerald to-cyan"
                  />
                </div>
              </div>
              <div className="flex justify-between items-center mb-8">
                <p className="text-white/55 text-xs">
                  {isLoading ? "…" : `${progressPct.toFixed(2)}%`} of {formatCompact(toNum(maxPresale))}{" "}
                  {PRESALE_TOKEN.symbol} sold
                </p>
                {lastUpdated && (
                  <p className="text-white/50 text-[10px]">Updated {lastUpdated.toLocaleTimeString()}</p>
                )}
              </div>

              {/* Payment method */}
              <div className="mb-5">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <p className="block text-sm font-medium text-white/80">Pay with</p>
                  <p className="text-[11px] text-white/40">
                    {anyOnchainEnabled ? "Settles on-chain" : "On-chain methods unlock as they are enabled"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {methods.map((m) => {
                    const selected = m.id === method.id;
                    const enabled = isMethodEnabled(m);
                    const interactive = m.available && enabled;
                    const status = m.offchain ? (m.note ?? "Off-chain") : enabled ? m.chain : "Not enabled";
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={!interactive}
                        onClick={() => {
                          setMethodId(m.id);
                          setMessage("");
                          reset();
                        }}
                        title={m.note}
                        className={`px-3.5 py-2 rounded-xl border text-sm font-semibold transition-colors
                          focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2 focus-visible:ring-offset-coin-black
                          ${
                            selected
                              ? "border-emerald/50 bg-emerald/12 text-emerald-light"
                              : "border-white/10 bg-white/4 text-white/70 hover:border-white/20"
                          }
                          disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:border-white/10`}
                      >
                        {m.label}
                        <span
                          className={`block text-[10px] font-normal ${enabled ? "text-white/45" : "text-white/30"}`}
                        >
                          {status}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!anyOnchainEnabled && (
                  <p className="mt-2.5 text-[11px] text-white/45 leading-relaxed">
                    No payment token is registered on this deployment yet. The owner enables one with
                    setPaymentToken(token, true, priceFeed).
                  </p>
                )}
              </div>

              {/* Buy input */}
              <div className="space-y-3">
                <label htmlFor="mmc-amount" className="block text-sm font-medium text-white/80">
                  Amount of {PRESALE_TOKEN.symbol} to buy
                </label>
                <div className="relative">
                  <input
                    id="mmc-amount"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-4 pr-20 rounded-xl bg-white/5 border border-white/10 text-white text-lg
                      placeholder-white/30 focus:outline-none focus:border-emerald/50 focus:bg-white/8
                      focus:ring-2 focus:ring-emerald/50 focus:ring-offset-2 focus:ring-offset-coin-black transition-colors"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/55 text-sm font-semibold">
                    {PRESALE_TOKEN.symbol}
                  </span>
                </div>

                {isLive && (
                  <p className="text-white/45 text-xs">
                    Up to {formatCompact(toNum(maxBuyable))} {PRESALE_TOKEN.symbol} available in Round{" "}
                    {round}.
                  </p>
                )}

                <div className="flex justify-between text-sm">
                  <span className="text-white/50">You pay</span>
                  <span className="text-white/80 font-semibold">
                    {costLabel}
                    <span className="text-white/45 font-normal"> (≈ {formatUsd(usdValue)})</span>
                  </span>
                </div>

                {isOffchain && (
                  <p className="text-white/50 text-xs leading-relaxed">
                    {OFFCHAIN_PAYMENT_URL
                      ? `You'll be taken to a secure checkout. Your ${PRESALE_TOKEN.symbol} is credited to your connected wallet once the payment is confirmed.`
                      : "Off-chain payments open with the sale."}
                  </p>
                )}

                {/* Lock notice: Round 1 is unlocked, Round 2 is locked (as in the token contract) */}
                <div className="flex gap-2.5 rounded-xl border border-ruby/25 bg-ruby/8 px-3.5 py-3">
                  <LockClosedIcon className="w-4 h-4 text-ruby-light shrink-0 mt-0.5" />
                  <p className="text-ruby-light/90 text-xs leading-relaxed">
                    {lockApplies ? (
                      <>
                        <span className="font-semibold">
                          Round 2 tokens are locked until {unlockMs ? dateFmt.format(unlockMs) : "the unlock date"}.
                        </span>{" "}
                        Your {PRESALE_TOKEN.symbol} arrives in your wallet immediately, but it cannot be
                        transferred until then. The token contract enforces this.
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">Round 1 tokens are not locked.</span> Round 2
                        purchases are locked until {unlockMs ? dateFmt.format(unlockMs) : "the unlock date"}.
                      </>
                    )}
                  </p>
                </div>

                {!isOffchain && needsApproval && cost > 0n && (
                  <p className="text-white/50 text-xs">
                    Paying with {method.label} takes two transactions: one to approve, one to buy.
                  </p>
                )}

                {configLoaded && !configured && (
                  <p className="text-red-300 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    The token is not linked to this presale contract, or the unlock times differ. Purchases
                    will fail until the owner fixes it.
                  </p>
                )}

                {statusMessage && (
                  <p
                    className={`text-sm rounded-lg px-3 py-2 border ${
                      statusIsError
                        ? "text-red-300 bg-red-500/10 border-red-500/20"
                        : "text-emerald-light bg-emerald/10 border-emerald/20"
                    }`}
                  >
                    {statusMessage}
                  </p>
                )}

                <motion.button
                  whileHover={shouldReduceMotion || !canBuy ? undefined : { scale: 1.02 }}
                  whileTap={shouldReduceMotion || !canBuy ? undefined : { scale: 0.98 }}
                  onClick={handleBuy}
                  disabled={!canBuy}
                  className="inline-flex w-full items-center justify-center gap-2 py-4 rounded-xl bg-emerald-gradient text-white font-semibold text-base
                    shadow-emerald hover:brightness-110 transition-all duration-300
                    focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2 focus-visible:ring-offset-coin-black
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {buttonLabel}
                  {isOffchain && methodEnabled && <ArrowTopRightOnSquareIcon className="w-4 h-4" />}
                </motion.button>

                <p className="text-center text-xs text-white/50">
                  Token:{" "}
                  <a
                    href={`${EXPLORER_URL}/token/${tokenAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-white/55 hover:text-emerald-light underline underline-offset-2"
                  >
                    {tokenAddress.slice(0, 6)}…{tokenAddress.slice(-4)}
                  </a>{" "}
                  · Presale:{" "}
                  <a
                    href={`${EXPLORER_URL}/address/${PRESALE_CONTRACT_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-white/55 hover:text-emerald-light underline underline-offset-2"
                  >
                    {PRESALE_CONTRACT_ADDRESS.slice(0, 6)}…{PRESALE_CONTRACT_ADDRESS.slice(-4)}
                  </a>{" "}
                  <span className="text-white/35">on {EXPLORER_NAME}</span>
                </p>
              </div>
            </div>
          </SectionReveal>
        </div>
      </section>

      {/* Rounds */}
      <section className="py-16 lg:py-20 border-t border-white/6">
        <div className="container-wide max-w-3xl">
          <SectionReveal className="text-center mb-12">
            <p className="text-emerald-light text-xs font-semibold tracking-widest uppercase mb-3">
              Sale Structure
            </p>
            <div className="section-divider-core" />
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">Presale Rounds</h2>
          </SectionReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {rounds.map((r, i) => {
              const accent = roundAccentStyle[roundAccents[i] ?? "emerald"];
              const status = round === r.round ? "Active" : round > r.round || (round === 0 && ended) ? "Completed" : mountedAt > r.end && r.end > 0 ? "Completed" : "Upcoming";
              return (
                <SectionReveal key={r.round} delay={i * 0.1}>
                  <div className={`h-full rounded-2xl border p-6 ${accent.card}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className={`w-8 h-8 rounded-full ${accent.badge} flex items-center justify-center shrink-0`}
                      >
                        <span className="text-coin-black font-bold text-xs">{r.round}</span>
                      </div>
                      <p className="font-display text-lg font-bold text-white">{r.name}</p>
                    </div>

                    <p className="text-white/50 text-xs leading-relaxed mb-5">
                      {r.locked
                        ? `Tokens are locked until ${unlockMs ? dateFmt.format(unlockMs) : "the unlock date"}.`
                        : "Tokens are transferable immediately."}
                    </p>

                    <dl className="space-y-2.5">
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <dt className="text-white/55 text-xs">Price</dt>
                        <dd className="text-white/80 text-xs font-semibold">
                          {formatUsd(Number(formatUnits(r.priceUsd6, USD_DECIMALS)))}
                        </dd>
                      </div>
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <dt className="text-white/55 text-xs">Allocation</dt>
                        <dd className="text-white/80 text-xs font-semibold">
                          {formatCompact(toNum(r.allocation))} {PRESALE_TOKEN.symbol}
                        </dd>
                      </div>
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <dt className="text-white/55 text-xs">Sold</dt>
                        <dd className="text-white/80 text-xs font-semibold">
                          {formatCompact(toNum(r.sold))} {PRESALE_TOKEN.symbol}
                        </dd>
                      </div>
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <dt className="text-white/55 text-xs">Opens</dt>
                        <dd className="text-white/80 text-xs font-semibold">
                          {r.start ? dateFmt.format(r.start) : "…"}
                        </dd>
                      </div>
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <dt className="text-white/55 text-xs">Closes</dt>
                        <dd className="text-white/80 text-xs font-semibold">
                          {r.end ? dateFmt.format(r.end) : "…"}
                        </dd>
                      </div>
                      <div className="flex justify-between items-center">
                        <dt className="text-white/55 text-xs">Status</dt>
                        <dd
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            status === "Active"
                              ? "text-emerald-light bg-emerald/10 border-emerald/25"
                              : "text-white/60 bg-white/5 border-white/10"
                          }`}
                        >
                          {status}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </SectionReveal>
              );
            })}
          </div>

          <SectionReveal delay={0.2}>
            <p className="mt-8 text-center text-white/45 text-xs max-w-xl mx-auto leading-relaxed">
              Each round has its own allocation. Unsold Round 1 tokens do not roll into Round 2. Prices are
              fixed in USD on-chain; payment amounts are converted using live price feeds.
            </p>
          </SectionReveal>
        </div>
      </section>
    </div>
  );
}
