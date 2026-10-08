import path from "node:path";
import { env as appEnv } from "./env";

/**
 * Local multilingual embeddings with multilingual-e5-small (384 dims; default repo is the
 * Xenova ONNX conversion of intfloat/multilingual-e5-small, int8-quantised), run on
 * CPU through @huggingface/transformers (ONNX). No API key, no data leaves the machine.
 * e5 models expect a "passage: " prefix for documents and "query: " for queries.
 */
type Extractor = (texts: string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;
type Tokenizer = (text: string, options?: { add_special_tokens?: boolean }) => { input_ids: { size: number } };

let extractorPromise: Promise<Extractor> | null = null;
let tokenizerPromise: Promise<Tokenizer> | null = null;

async function configure() {
  const transformers = await import("@huggingface/transformers");
  transformers.env.cacheDir = path.resolve(appEnv.modelCacheDir);
  transformers.env.allowLocalModels = true;
  return transformers;
}

export function getExtractor(): Promise<Extractor> {
  extractorPromise ??= (async () => {
    const { pipeline } = await configure();
    const extractor = await pipeline("feature-extraction", appEnv.embeddingModel, { dtype: appEnv.embeddingDtype });
    return extractor as unknown as Extractor;
  })();
  return extractorPromise;
}

export function getTokenizer(): Promise<Tokenizer> {
  tokenizerPromise ??= (async () => {
    const { AutoTokenizer } = await configure();
    return (await AutoTokenizer.from_pretrained(appEnv.embeddingModel)) as unknown as Tokenizer;
  })();
  return tokenizerPromise;
}

/** Returns a synchronous token counter backed by the e5 tokenizer (used for chunk sizing). */
export async function getTokenCounter(): Promise<(text: string) => number> {
  const tokenizer = await getTokenizer();
  return (text: string) => tokenizer(text, { add_special_tokens: false }).input_ids.size;
}

async function embed(texts: string[], batchSize = 16): Promise<number[][]> {
  const extractor = await getExtractor();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const output = await extractor(texts.slice(i, i + batchSize), { pooling: "mean", normalize: true });
    out.push(...output.tolist());
  }
  return out;
}

export function embedPassages(texts: string[]): Promise<number[][]> {
  return embed(texts.map((t) => `passage: ${t}`));
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([`query: ${text}`]);
  return vector;
}
