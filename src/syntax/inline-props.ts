import type MarkdownIt from 'markdown-it'
import type Renderer from 'markdown-it/lib/renderer.mjs'
import type Token from 'markdown-it/lib/token.mjs'

import TokenClass from 'markdown-it/lib/token.mjs'
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

    // When `::ul` or `::ol` wraps markdown list content, markdown-it creates
    // a nested list token with the same tag as the outer `mdc_block`.
    // Hide that inner list only when it is the block's sole child.

    const listTypes = {
      bullet_list_open: {
        closeType: 'bullet_list_close',
        tag: 'ul',
      },
      ordered_list_open: {
        closeType: 'ordered_list_close',
        tag: 'ol',
      },
    } as const

    tokens.forEach((tokenOpen, index) => {
      const list = listTypes[tokenOpen.type as keyof typeof listTypes]
      if (!list)
        return

      const prev = tokens[index - 1]
      if (!prev || prev.type !== 'mdc_block_open' || prev.tag !== list.tag)
        return

      // find the matching close token
      let closeIndex = index + 1
      while (closeIndex < tokens.length) {
        const close = tokens[closeIndex]
        if (close.type === list.closeType && close.level === tokenOpen.level)
          break
        closeIndex += 1
      }
      const tokenClose = tokens[closeIndex]
      if (tokenClose?.type !== list.closeType)
        return

      // When the matching `mdc_block` close token has the same list tag,
      // the list tokens are the duplicate wrapper and can be hidden.
      const next = tokens[closeIndex + 1]
      if (next?.type === 'mdc_block_close' && next.tag === list.tag) {
        // Carry over attributes from the hidden list (e.g. `start` on `ol`)
        // so they are not lost. Attributes set explicitly on the wrapper win.
        mergeAttrs(prev, tokenOpen.attrs)
        tokenOpen.hidden = true
        tokenClose.hidden = true
      }
    })

    return tokens
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
          prev = new TokenClass('mdc_inline_span', 'span', 1)
          tokens.splice(index - 1, 0, prev)
          const close = new TokenClass('mdc_inline_span', 'span', -1)
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
