export const typeDefs = /* GraphQL */ `
  """
  CoproGuide API. Asking a question is NOT part of this schema: answers are streamed
  over Server-Sent Events on POST /api/chat (see docs/adr/0003).
  """
  type Query {
    "Most recently active first. limit: 1-100 (default 50)."
    conversations(limit: Int = 50, offset: Int = 0): [Conversation!]!
    conversation(id: ID!): Conversation
    "Articles of the corpus, optionally filtered by law code (65-557, 67-223, 89-462)."
    documents(law: String): [Document!]!
    document(id: ID!): Document
    "Hybrid (vector + full-text, RRF) search over the corpus."
    search(query: String!, k: Int = 8): [SearchHit!]!
    "Most recent first. limit: 1-100 (default 50)."
    evalRuns(limit: Int = 50, offset: Int = 0): [EvalRun!]!
    evalRun(id: ID!): EvalRun
    "Usage metrics over [from, to) — ISO dates, defaults to the last 30 days."
    metrics(from: String, to: String): Metrics!
  }

  type Mutation {
    createConversation(title: String): Conversation!
    deleteConversation(id: ID!): Boolean!
    """
    Starts the golden-set evaluation in the background and returns the run id.
    Refused (FORBIDDEN / CONFLICT / RATE_LIMITED) when another run is in progress, when the
    hourly limit is reached, or, with a paid provider (openai, anthropic), without a valid x-admin-token header.
    """
    runEval(name: String): ID!
  }

  type Conversation {
    id: ID!
    title: String!
    createdAt: String!
    updatedAt: String!
    messageCount: Int!
    "Oldest first. limit: 1-100 (default 100)."
    messages(limit: Int = 100, offset: Int = 0): [Message!]!
  }

  type Message {
    id: ID!
    role: String!
    content: String!
    refused: Boolean!
    model: String
    inputTokens: Int!
    outputTokens: Int!
    cacheReadTokens: Int!
    cacheWriteTokens: Int!
    latencyMs: Int
    costEur: Float!
    createdAt: String!
    citations: [Citation!]!
  }

  type Citation {
    n: Int!
    score: Float!
    document: Document
  }

  type Document {
    id: ID!
    lawCode: String!
    law: String!
    article: String!
    title: String!
    legifranceUrl: String!
    versionDate: String!
    source: String!
    content: String!
  }

  type SearchHit {
    chunkId: Int!
    score: Float!
    similarity: Float!
    vectorRank: Int
    textRank: Int
    excerpt: String!
    document: Document
  }

  type EvalRun {
    id: ID!
    name: String!
    status: String!
    provider: String!
    model: String!
    judgeModel: String!
    minSimilarity: Float!
    startedAt: String!
    finishedAt: String
    error: String
    reportPath: String
    metrics: EvalMetrics
    results: [EvalResult!]!
  }

  type EvalMetrics {
    questions: Int!
    recallAt5: Float
    recallAt8: Float
    citationPrecision: Float
    citationGroundedness: Float
    refusalAccuracy: Float
    falseRefusalRate: Float
    judgeScore: Float
    meanLatencyMs: Float!
    p95LatencyMs: Float!
    totalCostEur: Float!
  }

  type EvalResult {
    questionId: String!
    question: String!
    category: String!
    expectedArticles: [String!]!
    retrievedArticles: [String!]!
    citedArticles: [String!]!
    answer: String!
    referenceAnswer: String!
    refused: Boolean!
    refusalCorrect: Boolean!
    bestSimilarity: Float
    recallAt5: Float
    recallAt8: Float
    citationPrecision: Float
    judgeScore: Float
    judgeRationale: String
    latencyMs: Int!
    costEur: Float!
  }

  type Metrics {
    from: String!
    to: String!
    requests: Int!
    refusals: Int!
    totalCostEur: Float!
    avgLatencyMs: Float!
    inputTokens: Float!
    outputTokens: Float!
    cacheReadTokens: Float!
    cacheWriteTokens: Float!
    cacheHitRate: Float!
    costByDay: [DailyMetrics!]!
  }

  type DailyMetrics {
    day: String!
    requests: Int!
    costEur: Float!
    p50LatencyMs: Float!
    p95LatencyMs: Float!
    inputTokens: Float!
    outputTokens: Float!
    cacheReadTokens: Float!
    cacheWriteTokens: Float!
  }
`;
