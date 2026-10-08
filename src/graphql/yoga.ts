import { createSchema, createYoga } from "graphql-yoga";
import { resolvers, type GraphQLContext } from "./resolvers";
import { typeDefs } from "./schema";

export const schema = createSchema<GraphQLContext>({ typeDefs, resolvers });

/** Yoga instance with an injectable context factory (the real one is wired in the route; tests pass fakes). */
export function buildYoga(context: (init: { request: Request }) => GraphQLContext | Promise<GraphQLContext>) {
  return createYoga<object, GraphQLContext>({
    schema,
    graphqlEndpoint: "/api/graphql",
    graphiql: process.env.NODE_ENV !== "production" || process.env.GRAPHIQL === "true",
    fetchAPI: { Response },
    context,
  });
}
