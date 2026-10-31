import { registerHooks } from 'node:module';

// EmDash 1.2 reads its Astro virtual config even when the test supplies a
// request-scoped database. Node's test runner does not have Vite's resolver, so
// provide the same routing settings as astro.config.ts for isolated SDK tests.
const config = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr'],
    prefixDefaultLocale: false,
  },
  trailingSlash: 'ignore',
};
const configUrl = `data:text/javascript,${encodeURIComponent(`export default ${JSON.stringify(config)}`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'virtual:emdash/config') return { url: configUrl, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
