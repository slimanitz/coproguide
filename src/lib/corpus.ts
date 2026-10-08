import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

export const frontmatterSchema = z.object({
  law: z.string().min(1),
  law_code: z.string().min(1),
  article: z.string().min(1),
  title: z.string().min(1),
  legifrance_url: z.string().url(),
  version_date: z.string().min(1),
  source: z.string().min(1),
  legiarti_id: z.string().optional(),
});

export type ArticleFrontmatter = z.infer<typeof frontmatterSchema>;

export interface CorpusArticle {
  /** Stable id "<law_code>:<article number>", e.g. "65-557:25" or "67-223:33". */
  id: string;
  file: string;
  meta: ArticleFrontmatter;
  content: string;
  contentHash: string;
}

/** "Article 25-1" -> "25-1"; "Art. 14" -> "14". */
export function articleNumber(article: string): string {
  return article.replace(/^(article|art\.?)\s*/i, "").trim();
}

export function articleId(lawCode: string, article: string): string {
  return `${lawCode}:${articleNumber(article)}`;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function parseArticle(raw: string, file: string): CorpusArticle {
  const parsed = matter(raw);
  const meta = frontmatterSchema.parse(parsed.data);
  const content = parsed.content.trim();
  if (!content) throw new Error(`Empty article body in ${file}`);
  return {
    id: articleId(meta.law_code, meta.article),
    file,
    meta,
    content,
    contentHash: sha256(JSON.stringify(meta) + "\n" + content),
  };
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return Promise.resolve(entry.name.endsWith(".md") ? [full] : []);
    }),
  );
  return files.flat().sort();
}

export async function loadCorpus(dir: string): Promise<CorpusArticle[]> {
  const files = await walk(dir);
  const articles = await Promise.all(files.map(async (file) => parseArticle(await readFile(file, "utf8"), file)));
  const seen = new Set<string>();
  for (const article of articles) {
    if (seen.has(article.id)) throw new Error(`Duplicate article id ${article.id} (${article.file})`);
    seen.add(article.id);
  }
  return articles;
}
