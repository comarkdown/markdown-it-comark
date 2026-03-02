# @comark/markdown-it

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

[Comark (Component in Markdown)](https://comark.dev) for [`markdown-it`](https://github.com/markdown-it/markdown-it).

Use [VS Code MDC Extension](https://marketplace.visualstudio.com/items?itemName=Nuxt.mdc) for IDE support.

## Usage

```bash
npm i markdown-it @comark/markdown-it
```

```ts
import comark from '@comark/markdown-it'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt()
  .use(comark)

const result = md.render(`
# Hello

Hello **World** with :my-component{.text-red name="foo"}!
`)
```

## Features

This plugin implements all the syntaxes documented in [Comark Syntax](https://comark.dev/syntax/markdown). We are still testing behavior compatibility in detail before reaching `v1.0.0`.

- [x] [Block Component](https://comark.dev/syntax/markdown#block-components)
  - [x] [Nesting](https://comark.dev/syntax/markdown#nested-components)
  - [x] [YAML Props](https://comark.dev/syntax/markdown#yaml-props)
  - [x] [Slots](https://comark.dev/syntax/markdown#component-slots)
- [x] [Inline Components](https://comark.dev/syntax/markdown#inline-components)
- [x] [Inline Props](https://comark.dev/syntax/markdown#attributes)
- [x] [Span](https://comark.dev/syntax/markdown#span-text)
- ~~Frontmatter~~. Frontmatter is not built-in in this plugin, we recommend using [`@mdit-vue/plugin-frontmatter`](https://github.com/mdit-vue/mdit-vue/tree/main/packages/plugin-frontmatter) if you want to use this plugin outside of Comark package,

## License

Made with ❤️

Published under MIT License.

## Credits

❤️ This project was originally created by [Anthony Fu](https://github.com/antfu) in 2022. Special thanks for the amazing work and inspiration! 🙏✨

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/@comark/markdown-it?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/@comark/markdown-it
[npm-downloads-src]: https://img.shields.io/npm/dm/@comark/markdown-it?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/@comark/markdown-it
[bundle-src]: https://img.shields.io/bundlephobia/minzip/@comark/markdown-it?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=@comark/markdown-it
[license-src]: https://img.shields.io/github/license/comarkdown/markdown-it-comark.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/comarkdown/markdown-it-comark/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/@comark/markdown-it
