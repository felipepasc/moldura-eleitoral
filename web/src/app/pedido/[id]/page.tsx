import { OrderStatus } from "@/app/pedido/[id]/OrderStatus";
import { PageHeader } from "@/components/PageHeader";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main>
      <PageHeader title="Seu pedido">Pague o Pix e a foto sem marca d&apos;água fica pronta para baixar.</PageHeader>
      <div className="wrap">
        <OrderStatus id={id} />
      </div>
    </main>
  );
}
