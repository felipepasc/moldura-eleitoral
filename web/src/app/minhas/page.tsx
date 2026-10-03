import type { Metadata } from "next";
import { MyOrders } from "@/app/minhas/MyOrders";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Minhas molduras | Moldura Eleitoral" };

export default function MyOrdersPage() {
  return (
    <main>
      <PageHeader title="Minhas molduras">As fotos que você comprou neste aparelho ficam aqui por 7 dias.</PageHeader>
      <div className="wrap">
        <MyOrders />
      </div>
    </main>
  );
}
