import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoproGuide — droit de la copropriété et des baux, sourcé",
  description:
    "Assistant d'information juridique sur la loi du 10 juillet 1965, le décret du 17 mars 1967 et la loi du 6 juillet 1989, avec articles cités.",
};

const NAV = [
  { href: "/", label: "Assistant" },
  { href: "/sources", label: "Sources" },
  { href: "/evals", label: "Évaluations" },
  { href: "/dashboard", label: "Tableau de bord" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="flex min-h-dvh flex-col">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          Aller au contenu
        </a>
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-accent-ink">
                §
              </span>
              CoproGuide
            </Link>
            <nav aria-label="Navigation principale">
              <ul className="flex flex-wrap gap-1 text-sm">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-text">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>
        <main id="contenu" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-border bg-surface">
          <p className="mx-auto max-w-7xl px-4 py-3 text-xs text-muted">
            <strong>Information juridique, pas un conseil.</strong> CoproGuide s&apos;appuie sur des extraits reproduits à titre de
            démonstration ; seul le texte publié sur{" "}
            <a className="underline" href="https://www.legifrance.gouv.fr" target="_blank" rel="noreferrer">
              Légifrance
            </a>{" "}
            fait foi. Pour une situation personnelle, consultez l&apos;
            <a className="underline" href="https://www.anil.org" target="_blank" rel="noreferrer">
              ADIL / ANIL
            </a>{" "}
            ou un professionnel du droit.
          </p>
        </footer>
      </body>
    </html>
  );
}
