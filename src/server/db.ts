// Order store for the presale, built on your existing server-only helper in
// src/lib/supabase.ts (service role key, bypasses RLS). Server code only.

import { getSupabaseAdmin } from "@/lib/supabase";

// Created lazily so a missing env var fails at request time, not at build time.
const supabase = {
  from: (table: string) => getSupabaseAdmin().from(table),
};

const TABLE = "presale_orders";

export type Order = {
  id: string;
  wallet: string;
  usd6: string;
  cents: string;
  createdAt: number;
  status: string;
  txHash?: string;
};

const toOrder = (r: any): Order => ({
  id: r.id,
  wallet: r.wallet,
  usd6: r.usd6,
  cents: r.cents,
  createdAt: Number(r.created_at),
  status: r.status,
  txHash: r.tx_hash ?? undefined,
});

export const db = {
  orders: {
    async create(o: Order) {
      const { error } = await supabase.from(TABLE).insert({
        id: o.id,
        wallet: o.wallet,
        usd6: o.usd6,
        cents: o.cents,
        created_at: o.createdAt,
        status: o.status,
      });
      if (error) throw error;
    },

    async get(id: string) {
      const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? toOrder(data) : null;
    },

    async update(id: string, patch: Partial<Order>) {
      const row: Record<string, unknown> = {};
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.txHash !== undefined) row.tx_hash = patch.txHash;
      const { error } = await supabase.from(TABLE).update(row).eq("id", id);
      if (error) throw error;
    },

    // Atomic: changes status only if it is currently `from`. True if it changed.
    async claim(id: string, from: string, to: string) {
      const { data, error } = await supabase
        .from(TABLE)
        .update({ status: to })
        .eq("id", id)
        .eq("status", from)
        .select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  },
};
