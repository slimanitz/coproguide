/**
 * pnpm fetch:legifrance [--dry-run] [--only 65-557:25]
 *
 * Refreshes the corpus from the official Légifrance API (DILA, via the PISTE gateway):
 *   1. OAuth2 client-credentials token from PISTE;
 *   2. for each corpus file, resolve the article's LEGIARTI id (frontmatter `legiarti_id`,
 *      else POST /consult/getArticleWithIdandNum with the LEGITEXT id + article number);
 *   3. POST /consult/getArticle { id: LEGIARTI } and rewrite the Markdown file with the
 *      current consolidated text, its LEGIARTI URL and start date, source "legifrance-api".
 *
 * Written against the published API contract (https://piste.gouv.fr, API "Légifrance");
 * it has not been run against the live API in this repository (no credentials in CI).
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readdir } from "node:fs/promises";
import matter from "gray-matter";
import { articleNumber, frontmatterSchema } from "../src/lib/corpus";

const SANDBOX = process.env.PISTE_ENV === "sandbox";
const OAUTH_URL = SANDBOX ? "https://sandbox-oauth.piste.gouv.fr/api/oauth/token" : "https://oauth.piste.gouv.fr/api/oauth/token";
const API_BASE = SANDBOX
  ? "https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app"
  : "https://api.piste.gouv.fr/dila/legifrance/lf-engine-app";

const clientId = process.env.PISTE_CLIENT_ID;
const clientSecret = process.env.PISTE_CLIENT_SECRET;
const dryRun = process.argv.includes("--dry-run");
const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;

if (!clientId || !clientSecret) {
  console.log(`PISTE credentials are not set: the corpus keeps its manual extracts.

To refresh the corpus from the official consolidated texts:
  1. Create an account on https://piste.gouv.fr and an application.
  2. Subscribe the application to the "Légifrance" API (accept the CGU), sandbox first if you like.
  3. Copy the OAuth client id / secret, then run:
       PISTE_CLIENT_ID=... PISTE_CLIENT_SECRET=... [PISTE_ENV=sandbox] pnpm fetch:legifrance
  4. Re-run "pnpm ingest": only the articles whose text changed are re-embedded.`);
  process.exit(0);
}

interface LegifranceArticle {
  id: string;
  num?: string;
  texte?: string;
  texteHtml?: string;
  dateDebut?: number;
  etat?: string;
}

async function token(): Promise<string> {
  const response = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId!, client_secret: clientSecret!, scope: "openid" }),
  });
  if (!response.ok) throw new Error(`PISTE OAuth failed: ${response.status} ${await response.text()}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

async function api<T>(accessToken: string, route: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${route}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${route} → ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : Promise.resolve([path.join(dir, e.name)]))));
  return nested.flat().filter((f) => f.endsWith(".md"));
}

const accessToken = await token();
let updated = 0;
for (const file of (await walk("corpus")).sort()) {
  const parsed = matter(await readFile(file, "utf8"));
  const meta = frontmatterSchema.parse(parsed.data);
  const num = articleNumber(meta.article);
  const id = `${meta.law_code}:${num}`;
  if (only && only !== id) continue;

  let legiarti = meta.legiarti_id;
  if (!legiarti) {
    const textId = meta.legifrance_url.match(/LEGITEXT\d+/)?.[0];
    if (!textId) {
      console.warn(`skip ${id}: no LEGITEXT id in legifrance_url`);
      continue;
    }
    const resolved = await api<{ article?: LegifranceArticle }>(accessToken, "/consult/getArticleWithIdandNum", { id: textId, num });
    legiarti = resolved.article?.id;
  }
  if (!legiarti) {
    console.warn(`skip ${id}: article not found`);
    continue;
  }

  const { article } = await api<{ article: LegifranceArticle }>(accessToken, "/consult/getArticle", { id: legiarti });
  const text = article.texte?.trim() || htmlToText(article.texteHtml ?? "");
  if (!text) {
    console.warn(`skip ${id}: empty text returned`);
    continue;
  }
  const next = {
    ...meta,
    legiarti_id: legiarti,
    legifrance_url: `https://www.legifrance.gouv.fr/loda/article_lc/${legiarti}`,
    version_date: article.dateDebut ? new Date(article.dateDebut).toISOString().slice(0, 10) : meta.version_date,
    source: "legifrance-api",
  };
  if (dryRun) {
    console.log(`[dry-run] ${id} ← ${legiarti} (${text.length} chars, ${article.etat ?? "?"})`);
  } else {
    await writeFile(file, matter.stringify(`\n${text}\n`, next));
    console.log(`updated ${id} ← ${legiarti}`);
  }
  updated++;
  await new Promise((resolve) => setTimeout(resolve, 250)); // stay well under the PISTE quota
}
console.log(`${updated} article(s) ${dryRun ? "checked" : "refreshed"}. Run "pnpm ingest" to re-embed changed articles.`);
