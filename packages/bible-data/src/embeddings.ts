import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// Local, open-weight sentence embedding model (via transformers.js/ONNX) —
// no API key, no per-call cost, no external service dependency. Runs fine on
// CPU for verse-length text (~2k sentences/sec batched in testing). Good
// general-purpose semantic similarity quality; swap out here if a later
// phase needs something more Bible-domain-specific.
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSIONS = 384;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_NAME);
  }
  return extractorPromise;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  const dims = output.dims[1];
  const data = output.data as Float32Array;

  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    vectors.push(Array.from(data.slice(i * dims, (i + 1) * dims)));
  }
  return vectors;
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}
