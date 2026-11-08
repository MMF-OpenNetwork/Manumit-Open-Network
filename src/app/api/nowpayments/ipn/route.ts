import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains"; // change to your chain
import { db } from "@/server/db"; // YOUR database helper (see notes)

// Allow time for the blockchain transaction (check your hosting plan's limit).
export const maxDuration = 60;

const PRESALE = process.env.PRESALE_ADDRESS as `0x${string}`;

// If at least this share of the requested amount arrived, credit MMC in
// proportion to what arrived. Below it, the order goes to manual review.
const MIN_PAID_RATIO = 0.9;

const abi = parseAbi([
  "function roundAt(uint256 timestamp) view returns (uint256)",
  "function quoteOffchainForRound(uint256 paymentAmountUsd6, uint256 round) pure returns (uint256)",
  "function recordOffchainPurchase(address buyer, uint256 paymentAmountUsd6, bytes32 paymentId, uint256 paidAt, uint256 minMmcOut)",
]);

const publicClient = createPublicClient({ chain: sepolia, transport: http(process.env.RPC_URL) });

// NOWPayments signs the JSON body with its keys sorted alphabetically.
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((value as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return value;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const received = req.headers.get("x-nowpayments-sig") ?? "";

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // 1) Verify the signature. Anyone can POST to this URL, so this is mandatory.
  const expected = crypto
    .createHmac("sha512", process.env.NOWPAYMENTS_IPN_SECRET!)
    .update(JSON.stringify(sortKeys(body)))
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  // 2) Only a fully finished payment gets credited. partially_paid, failed,
  //    expired and refunded are handled manually.
  if (body.payment_status !== "finished") {
    return NextResponse.json({ ok: true, ignored: body.payment_status });
  }

  const order = await db.orders.get(body.order_id);
  if (!order) return NextResponse.json({ error: "Unknown order" }, { status: 404 });
  if (order.status === "credited") return NextResponse.json({ ok: true, duplicate: true });

  // 3) The paid amount must match what WE stored when the invoice was created.
  if (Math.round(Number(body.price_amount) * 100) !== Number(order.cents)) {
    await db.orders.update(order.id, { status: "needs_review" });
    return NextResponse.json({ error: "Amount mismatch" }, { status: 409 });
  }

  // 3b) Credit what actually arrived. A small shortfall is common when the buyer
  //     pays from an exchange (the withdrawal fee comes out of the amount).
  //     Repeated deposits, wrong-asset deposits and big shortfalls are never
  //     credited automatically.
  const payAmount = Number(body.pay_amount);
  const received = Number(body.actually_paid);
  const ratio = payAmount > 0 ? received / payAmount : 0;
  if (body.parent_payment_id || body.price_currency !== "usd" || !(ratio >= MIN_PAID_RATIO)) {
    console.warn("IPN flagged for manual review", body.payment_id, body.order_id);
    return NextResponse.json({ ok: true, flagged: true });
  }
  const creditRatio = Math.min(ratio, 1); // never credit more than the order

  // 4) Claim the order atomically so two webhook retries can't both credit it.
  const claimed = await db.orders.claim(order.id, "pending", "processing");
  if (!claimed) return NextResponse.json({ ok: true, inProgress: true });

  try {
    // Order amount scaled by the share that actually arrived (rounded down).
    const usd6 = BigInt(Math.floor(Number(order.usd6) * creditRatio));
    if (usd6 <= 0n) throw new Error("Nothing to credit");
    const paidAt = BigInt(order.createdAt); // price/round locked when the invoice was made
    // Based on the ORDER, not the payment, so even a second payment for the
    // same order can never be credited twice on-chain.
    const paymentId = keccak256(toHex(`nowpayments-order:${order.id}`));

    const round = await publicClient.readContract({
      address: PRESALE, abi, functionName: "roundAt", args: [paidAt],
    });
    if (round === 0n) throw new Error("Payment time is outside a round");

    const minOut = await publicClient.readContract({
      address: PRESALE, abi, functionName: "quoteOffchainForRound", args: [usd6, round],
    });

    const account = privateKeyToAccount(process.env.PROCESSOR_PRIVATE_KEY as `0x${string}`);
    const wallet = createWalletClient({ account, chain: sepolia, transport: http(process.env.RPC_URL) });

    const hash = await wallet.writeContract({
      address: PRESALE,
      abi,
      functionName: "recordOffchainPurchase",
      args: [order.wallet as `0x${string}`, usd6, paymentId, paidAt, minOut],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    console.log("Credited order", order.id, "usd6", usd6.toString(), "ratio", creditRatio);
    await db.orders.update(order.id, { status: "credited", txHash: hash });
    return NextResponse.json({ ok: true, txHash: hash });
  } catch (err) {
    // Safe to retry: the contract rejects a paymentId it has already processed.
    await db.orders.update(order.id, { status: "pending" });
    console.error("IPN credit failed", err);
    return NextResponse.json({ error: "Credit failed" }, { status: 500 });
  }
}
