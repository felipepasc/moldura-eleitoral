import { FrameEditor } from "@/app/criar/FrameEditor";
import { PageHeader } from "@/components/PageHeader";
import { initialCandidateId, initialFrameStyle } from "@/lib/frame-choice";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ c?: string; e?: string }> }) {
  const { c, e } = await searchParams;

  return (
    <main>
      <PageHeader title="Criar minha moldura">Escolha a foto e a moldura. A prévia é grátis e aparece na hora.</PageHeader>
      <div className="wrap">
        <FrameEditor initialCandidateId={initialCandidateId(c)} initialStyle={initialFrameStyle(e)} />
      </div>
    </main>
  );
}
