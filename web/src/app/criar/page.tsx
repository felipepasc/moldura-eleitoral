import { FrameEditor } from "@/app/criar/FrameEditor";
import { initialCandidateId } from "@/lib/frame-choice";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;

  return (
    <main className="wrap">
      <h2>Criar minha moldura</h2>
      <FrameEditor initialCandidateId={initialCandidateId(c)} />
    </main>
  );
}
