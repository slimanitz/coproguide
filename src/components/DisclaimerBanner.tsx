export function DisclaimerBanner() {
  return (
    <p role="note" className="rounded-lg border border-warn-border bg-warn-bg px-4 py-3 text-sm text-warn-ink">
      <strong>Extraits reproduits à titre de démonstration — faire foi sur Légifrance</strong> (
      <a className="underline" href="https://www.legifrance.gouv.fr" target="_blank" rel="noreferrer">
        legifrance.gouv.fr
      </a>
      ). Les textes ont été saisis manuellement et peuvent différer de la version consolidée en vigueur.
    </p>
  );
}
