import { CANDIDATES } from "@moldura/common";
import { FrameEditor } from "@/app/criar/FrameEditor";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const initial = CANDIDATES.find((candidate) => candidate.id === c) ?? CANDIDATES[0];

  return (
    <main className="wrap">
      <h2>Criar minha moldura</h2>
      <FrameEditor initialCandidateId={initial.id} />
    </main>
  );
}
