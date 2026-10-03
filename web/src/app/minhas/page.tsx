import type { Metadata } from "next";
import { MyOrders } from "@/app/minhas/MyOrders";

export const metadata: Metadata = { title: "Minhas molduras | Moldura Eleitoral" };

export default function MyOrdersPage() {
  return (
    <main className="wrap">
      <h2>Minhas molduras</h2>
      <MyOrders />
    </main>
  );
}
