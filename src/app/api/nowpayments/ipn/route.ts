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

const PRESALE = process.env.PRESALE_ADDRESS as `0x${string}`;

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

  // 3b) Per the NOWPayments docs, repeated deposits (parent_payment_id set),
  //     wrong-asset deposits and underpayments can also arrive as "finished".
  //     Never credit those automatically. They are logged and checked by hand.
  const underpaid = Number(body.actually_paid) < Number(body.pay_amount);
  if (body.parent_payment_id || body.price_currency !== "usd" || underpaid) {
    console.warn("IPN flagged for manual review", body.payment_id, body.order_id);
    return NextResponse.json({ ok: true, flagged: true });
  }

  // 4) Claim the order atomically so two webhook retries can't both credit it.
  const claimed = await db.orders.claim(order.id, "pending", "processing");
  if (!claimed) return NextResponse.json({ ok: true, inProgress: true });

  try {
    const usd6 = BigInt(order.usd6);
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

    await db.orders.update(order.id, { status: "credited", txHash: hash });
    return NextResponse.json({ ok: true, txHash: hash });
  } catch (err) {
    // Safe to retry: the contract rejects a paymentId it has already processed.
    await db.orders.update(order.id, { status: "pending" });
    console.error("IPN credit failed", err);
    return NextResponse.json({ error: "Credit failed" }, { status: 500 });
  }
}
