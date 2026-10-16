import type MarkdownIt from 'markdown-it'
import type Renderer from 'markdown-it/lib/renderer.mjs'
import type Token from 'markdown-it/lib/token.mjs'

import { searchProps } from '../parse/props'

export interface MdcInlinePropsOptions {

}

export const MarkdownItInlineProps: MarkdownIt.PluginWithOptions<MdcInlinePropsOptions> = (md) => {
  md.inline.ruler.after('entity', 'mdc_inline_props', (state, silent) => {
    const start = state.pos
    const char = state.src[start]

    if (char !== '{')
      return false

    // Vue's mustache {{ }} syntax and string template ${ } syntax
    if (state.src[start + 1] === '{' || state.src[start - 1] === '{' || state.src[start - 1] === '$')
      return false

    const search = searchProps(state.src, start)
    if (!search)
      return false

    const {
      props,
      index: end,
    } = search

    if (end === start)
      return false

    state.pos = end

    if (silent)
      return true

    // We insert a hidden token holding the props, and later apply them to the previous token
    const token = state.push('mdc_inline_props', 'span', 0)
    token.attrs = props
    token.hidden = true

    return true
  })

  // This is a hidden token, we don't need to render anything
  md.renderer.rules.mdc_inline_props = () => {
    return ''
  }

  const _parse = md.parse
  md.parse = function (src, env) {
    const tokens = _parse.call(this, src, env)

    // Apply the props to the parent token
    // when it's the only child of the inline token inside a paragraph or heading
    // e.g. `# Heading {class="foo"}`, it will apply the class to the `h1` tag instead of creating a `span` tag
    tokens.forEach((token, index) => {
      const prev = tokens[index - 1]
      const next = tokens[index + 1]
      if (!['heading_open', 'paragraph_open', 'list_item_open'].includes(prev?.type) || prev.hidden)
        return

      // list item handling
      if (token.hidden && next?.type === 'inline')
        token = next

      if (token.type === 'inline')
        applyTrailingPropsToParent(token, prev)
    })

    foldWrapperBlocks(tokens)

    return tokens
  }

  // `::pre` wrappers are folded into the fence / code block itself, so the
  // wrapper attributes have to be injected into the rendered `<pre>` tag.
  for (const type of ['fence', 'code_block'] as const) {
    const original = md.renderer.rules[type]
    md.renderer.rules[type] = function (tokens, idx, options, env, self) {
      const html = original
        ? original.call(this, tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options)
      const attrs = tokens[idx].meta?.mdcWrapperAttrs as [string, string][] | undefined
      if (!attrs?.length)
        return html
      return html.replace(/<pre\b/, `<pre${self.renderAttrs({ attrs } as Token)}`)
    }
  }

  // Replace the inline renderer to apply the props to the previous token
  md.renderer.renderInline = wrapRenderInline(md.renderer.renderInline)
  // Support https://github.com/serkodev/markdown-exit/blob/fe1351070a5841426223ab4a0a5c7874ba2b1257/packages/markdown-exit/src/renderer.ts#L389
  if ('renderInlineAsync' in md.renderer)
    md.renderer.renderInlineAsync = wrapRenderInline(md.renderer.renderInlineAsync as any)
}

function applyAttrs(token: Token, attrs: [string, string][] | null) {
  attrs?.forEach(([key, value]) => {
    if (key === 'class')
      token.attrJoin('class', value)
    else
      token.attrSet(key, value)
  })
}

const WRAPPER_TAGS = new Set(['ul', 'ol', 'table', 'blockquote', 'pre'])
const NATIVE_WRAPPED_TYPES = new Set(['bullet_list_open', 'ordered_list_open', 'table_open', 'blockquote_open'])

/**
 * When `::ul`, `::ol`, `::table`, `::blockquote` or `::pre` wraps exactly one
 * child with the same tag, markdown-it renders the tag twice. Fold them into a
 * single element carrying the attributes of both (the wrapper's win).
 */
function foldWrapperBlocks(tokens: Token[]) {
  tokens.forEach((wrapperOpen, index) => {
    if (wrapperOpen.type !== 'mdc_block_open' || !WRAPPER_TAGS.has(wrapperOpen.tag))
      return

    const inner = tokens[index + 1]
    if (!inner)
      return

    // `::pre` wrapping a fence / indented code block (single self-contained token)
    if (wrapperOpen.tag === 'pre') {
      if (inner.type !== 'fence' && inner.type !== 'code_block')
        return
      const wrapperClose = tokens[index + 2]
      if (wrapperClose?.type !== 'mdc_block_close' || wrapperClose.tag !== 'pre')
        return

      inner.meta = { ...inner.meta, mdcWrapperAttrs: wrapperOpen.attrs ?? [] }
      wrapperOpen.hidden = true
      wrapperClose.hidden = true
      return
    }

    // `::ul`, `::ol`, `::table`, `::blockquote` wrapping the matching native element.
    // Only native markdown tokens are folded: a wrapper around another wrapper
    // (e.g. `::ol` > `:::ol`) is left alone so wrapper logic runs once per element.
    if (!NATIVE_WRAPPED_TYPES.has(inner.type) || inner.tag !== wrapperOpen.tag)
      return

    const closeType = inner.type.replace(/_open$/, '_close')
    let closeIndex = index + 2
    while (closeIndex < tokens.length) {
      const close = tokens[closeIndex]
      if (close.type === closeType && close.level === inner.level)
        break
      closeIndex += 1
    }
    const innerClose = tokens[closeIndex]
    if (innerClose?.type !== closeType)
      return

    // The inner element must be the wrapper's sole child
    const wrapperClose = tokens[closeIndex + 1]
    if (wrapperClose?.type !== 'mdc_block_close' || wrapperClose.tag !== wrapperOpen.tag)
      return

    // Carry over attributes from the hidden element (e.g. `start` on `ol`)
    mergeAttrs(wrapperOpen, inner.attrs)
    inner.hidden = true
    innerClose.hidden = true
  })
}

function mergeAttrs(target: Token, attrs: [string, string][] | null) {
  attrs?.forEach(([key, value]) => {
    if (key === 'class')
      target.attrJoin('class', value)
    else if (target.attrIndex(key) < 0)
      target.attrSet(key, value)
  })
}

function applyTrailingPropsToParent(inline: Token, parentOpen: Token) {
  const children = inline.children
  if (!children || children.length < 2)
    return false

  const propsIndex = children.length - 1
  const props = children[propsIndex]
  const previous = children[propsIndex - 1]

  if (
    props.type !== 'mdc_inline_props'
    || previous.type !== 'text'
  ) {
    return false
  }

  applyAttrs(parentOpen, props.attrs)

  if (previous.content.trim()) {
    previous.content = previous.content.replace(/[ \t]+$/, '')
    children.splice(propsIndex, 1)
  }
  else {
    children.splice(propsIndex - 1, 2)
  }

  return true
}

function wrapRenderInline(renderInline: Renderer['renderInline']): Renderer['renderInline'] {
  return function (this: Renderer, tokens, options, env) {
    tokens = [...tokens]
    tokens.forEach((token, index) => {
      if (token.type === 'mdc_inline_props') {
        let prevIndex = index - 1

        // Find the first non-whitespace token before this one
        let prev = tokens[prevIndex]
        while (prevIndex >= 0) {
          if (prev.type === 'text' && !prev.content.trim()) {
            prevIndex--
            prev = tokens[prevIndex]
          }
          else {
            break
          }
        }

        // If the previous token is a text token, we need to wrap it in a span
        if (!prev.tag && prev.type === 'text') {
          // Use the token's own class instead of importing `markdown-it/lib/token.mjs`,
          // which markdown-it v15 no longer exposes via its `exports` map.
          const TokenCtor = token.constructor as typeof Token
          prev = new TokenCtor('mdc_inline_span', 'span', 1)
          tokens.splice(index - 1, 0, prev)
          const close = new TokenCtor('mdc_inline_span', 'span', -1)
          tokens.splice(index + 2, 0, close)
        }
        // If the previous token is a closing tag, we need to find the matching opening tag
        else if (prev.nesting === -1) {
          let searchIndex = index - 1
          while (searchIndex >= 0) {
            const searchToken = tokens[searchIndex]
            if (searchToken.nesting === 1 && searchToken.tag === prev.tag && searchToken.level === prev.level) {
              prev = searchToken
              break
            }
            searchIndex--
          }
        }

        if (prev.nesting === -1)
          throw new Error(`No matching opening tag found for ${JSON.stringify(prev)}`)

        // console.log('apply', token.attrs, 'to', prev)

        applyAttrs(prev, token.attrs)
      }
    })
    return renderInline.call(this, tokens, options, env)
  }
}
