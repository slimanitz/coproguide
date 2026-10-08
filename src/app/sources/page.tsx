import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { SourcesBrowser } from "@/components/SourcesBrowser";
import { getDb } from "@/lib/db/client";
import { createRepository } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sources — CoproGuide" };

export default async function SourcesPage() {
  const documents = await createRepository(getDb()).listDocuments();
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="text-sm text-muted">
          Corpus interrogé par l&apos;assistant : {documents.length} articles de la loi n° 65-557, du décret n° 67-223 et de la loi n° 89-462 (dont
          les dispositions ALUR sur les meublés).
        </p>
      </header>
      <DisclaimerBanner />
      <SourcesBrowser
        documents={documents.map((d) => ({
          id: d.id,
          lawCode: d.lawCode,
          law: d.law,
          article: d.article,
          title: d.title,
          content: d.content,
          legifranceUrl: d.legifranceUrl,
          versionDate: d.versionDate,
        }))}
      />
    </div>
  );
}
