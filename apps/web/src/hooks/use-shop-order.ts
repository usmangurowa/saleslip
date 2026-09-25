"use client";

import { useQuery } from "@tanstack/react-query";

export type ShopOrderStatus =
  "pending" | "paid" | "fulfilled" | "pending_router" | "failed";

export interface ShopOrderPlan {
  id: string;
  name: string;
  validityLabel: string;
  dataLimitBytes: number | null;
}

export interface ShopOrder {
  id: string;
  status: ShopOrderStatus;
  plan: ShopOrderPlan | null;
  amountKobo: number;
  voucherCode: string | null;
  qrSvg: string | null;
  loginUrl: string | null;
  supportPhone: string | null;
  createdAt: string;
}

const isStillProcessing = (status?: ShopOrderStatus) =>
  status === "pending" || status === "paid" || status === "pending_router";

export const useShopOrder = (orderId: string) =>
  useQuery({
    queryKey: ["shop-order", orderId],
    queryFn: async (): Promise<ShopOrder | null> => {
      const res = await fetch(`/api/shop/orders/${orderId}`, {
        headers: { accept: "application/json" },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("We couldn't load your order.");
      return (await res.json()) as ShopOrder;
    },
    refetchInterval: (query) =>
      isStillProcessing(query.state.data?.status) ? 2000 : false,
  });
