/*
  Convex exposes each deployment's environment variables as `process.env` in
  every function, but the generated tsconfig pulls in no Node types, so the
  name itself has no declaration.

  This is that declaration and nothing else. Pulling in @types/node would type
  the whole of Node as available, and the default Convex runtime is not Node —
  `fs`, `path` and the rest would typecheck and then fail at runtime.
*/
declare const process: {
  env: Record<string, string | undefined>;
};
