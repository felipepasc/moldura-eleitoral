import { FrameEditor } from "@/app/criar/FrameEditor";
import { PageHeader } from "@/components/PageHeader";
import { initialCandidateId } from "@/lib/frame-choice";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;

  return (
    <main>
      <PageHeader title="Criar minha moldura">Escolha a foto e a moldura. A prévia é grátis e aparece na hora.</PageHeader>
      <div className="wrap">
        <FrameEditor initialCandidateId={initialCandidateId(c)} />
      </div>
    </main>
  );
}
