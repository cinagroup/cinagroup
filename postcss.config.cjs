/* eslint-disable @typescript-eslint/no-require-imports -- PostCSS loads this configuration as CommonJS. */
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');

const tailwindEntry = /[/\\]src[/\\]assets[/\\]styles[/\\]tailwind\.css$/;

module.exports = {
  plugins: [
    {
      postcssPlugin: 'cinagroup-tailwind-entry',
      async Once(root, { result }) {
        const source = (result.opts.from ?? root.source?.input.file)?.replace(/\?.*$/, '');
        if (!source || !tailwindEntry.test(source)) return;

        // EmDash ships CSS with @layer but no @tailwind directives. Tailwind must
        // compile only our entry stylesheet, or it rejects the admin CSS.
        const compiled = await postcss([tailwindcss()]).process(root.clone(), { from: source });
        root.removeAll();
        root.append(compiled.root.nodes);
        result.messages.push(...compiled.messages);
      },
    },
    autoprefixer(),
  ],
};
