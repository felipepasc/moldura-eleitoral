import { CandidateGrid } from "@/components/home/CandidateGrid";
import { Hero } from "@/components/home/Hero";
import { Steps } from "@/components/home/Steps";

export default function HomePage() {
  return (
    <main className="home">
      <Hero />
      <CandidateGrid />
      <Steps />
    </main>
  );
}
