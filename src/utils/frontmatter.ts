import getReadingTime from 'reading-time';
import { toString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';
import type { RehypePlugin, RemarkPlugin } from '@astrojs/markdown-remark';

export const readingTimeRemarkPlugin: RemarkPlugin = () => {
  return function (tree, file) {
    const textOnPage = toString(tree);
    const readingTime = Math.ceil(getReadingTime(textOnPage).minutes);

    if (typeof file?.data?.astro?.frontmatter !== 'undefined') {
      file.data.astro.frontmatter.readingTime = readingTime;
    }
  };
};

/**
 * Blog post layouts own the document's single h1. Keep author-supplied body
 * headings below that level, including content produced by automated jobs.
 */
export const blogPostHeadingsRemarkPlugin: RemarkPlugin = () => {
  return function (tree, file) {
    const sourcePath = String(file.path || file.history?.[0] || '').replaceAll('\\', '/');
    const isBlogPost = /\/src\/(?:content\/blog|data\/post)\//.test(sourcePath);

    if (!isBlogPost) return;

    let hasBodyH1 = false;
    visit(tree, 'heading', function (node) {
      if (node.depth === 1) hasBodyH1 = true;
    });
    if (!hasBodyH1) return;

    visit(tree, 'heading', function (node) {
      node.depth = Math.min(6, node.depth + 1) as typeof node.depth;
    });
  };
};

export const responsiveTablesRehypePlugin: RehypePlugin = () => {
  return function (tree) {
    if (!tree.children) return;

    for (let i = 0; i < tree.children.length; i++) {
      const child = tree.children[i];

      if (child.type === 'element' && child.tagName === 'table') {
        tree.children[i] = {
          type: 'element',
          tagName: 'div',
          properties: {
            style: 'overflow:auto',
          },
          children: [child],
        };

        i++;
      }
    }
  };
};

export const lazyImagesRehypePlugin: RehypePlugin = () => {
  return function (tree) {
    if (!tree.children) return;

    visit(tree, 'element', function (node) {
      if (node.tagName === 'img') {
        node.properties.loading = 'lazy';
      }
    });
  };
};
