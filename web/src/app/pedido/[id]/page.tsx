import { OrderStatus } from "@/app/pedido/[id]/OrderStatus";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="wrap">
      <h2>Seu pedido</h2>
      <OrderStatus id={id} />
    </main>
  );
}
