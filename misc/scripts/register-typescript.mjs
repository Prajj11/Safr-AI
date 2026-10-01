import { registerHooks } from "node:module";
// Node 24 strips TypeScript; resolve the extensionless imports used by Vite.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.(?:ts|tsx|js|mjs|json)$/i.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        /* Try normal resolution. */
      }
    }
    return nextResolve(specifier, context);
  },
});
