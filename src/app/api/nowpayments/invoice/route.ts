import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createPublicClient, http, isAddress, parseAbi, parseUnits } from "viem";
import { sepolia } from "viem/chains"; // change to your chain
import { db } from "@/server/db"; // YOUR database helper (see notes)

const PRESALE = process.env.PRESALE_ADDRESS as `0x${string}`;
const MIN_USD_CENTS = 1000n; // $10 minimum, change as you like

const client = createPublicClient({ chain: sepolia, transport: http(process.env.RPC_URL) });
const abi = parseAbi(["function currentPrice() view returns (uint256)"]);

export async function POST(req: Request) {
  const { wallet, mmc } = await req.json();

  if (typeof wallet !== "string" || !isAddress(wallet)) {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }
  if (typeof mmc !== "string" || !/^\d+(\.\d{1,6})?$/.test(mmc)) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  // The price ALWAYS comes from the contract, never from the browser.
  let price6: bigint;
  try {
    price6 = await client.readContract({ address: PRESALE, abi, functionName: "currentPrice" });
  } catch {
    return NextResponse.json({ error: "Presale is not active" }, { status: 409 });
  }

  const mmcBase = parseUnits(mmc, 18);
  const usd6 = (mmcBase * price6 + 10n ** 18n - 1n) / 10n ** 18n; // rounded up
  const cents = (usd6 + 9_999n) / 10_000n; // round up to whole cents
  if (cents < MIN_USD_CENTS) {
    return NextResponse.json({ error: "Amount below minimum" }, { status: 400 });
  }
  const creditedUsd6 = cents * 10_000n; // what the contract will be told

  const orderId = randomUUID();
  await db.orders.create({
    id: orderId,
    wallet,
    usd6: creditedUsd6.toString(),
    cents: cents.toString(),
    createdAt: Math.floor(Date.now() / 1000),
    status: "pending",
  });

  const apiBase = process.env.NOWPAYMENTS_API_URL ?? "https://api.nowpayments.io";
  const res = await fetch(`${apiBase}/v1/invoice`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.NOWPAYMENTS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      price_amount: Number(cents) / 100,
      price_currency: "usd",
      order_id: orderId,
      order_description: `${mmc} MMC presale`,
      ipn_callback_url: `${process.env.SITE_URL}/api/nowpayments/ipn`,
      success_url: `${process.env.SITE_URL}/presale?paid=1`,
      cancel_url: `${process.env.SITE_URL}/presale`,
    }),
  });

  const invoice = await res.json();
  if (!res.ok || !invoice.invoice_url) {
    return NextResponse.json({ error: "Could not create invoice" }, { status: 502 });
  }
  return NextResponse.json({ url: invoice.invoice_url });
}
