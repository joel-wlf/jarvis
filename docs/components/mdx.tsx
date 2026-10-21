import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'
import type * as React from 'react'
import { InstallCommand } from './install'

/** Resolves `./page.mdx#anchor` links in content to the current language's docs route. */
export function docsLink(lang: string) {
  const Base = defaultMdxComponents.a as React.ComponentType<React.ComponentProps<'a'>>
  return function DocsLink({ href, ...props }: React.ComponentProps<'a'>) {
    const m = href?.match(/^\.\/([a-z-]+)\.mdx(#.*)?$/)
    const target = m ? (m[1] === 'index' ? `/${lang}/docs` : `/${lang}/docs/${m[1]}`) + (m[2] ?? '') : href
    return <Base href={target} {...props} />
  }
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    InstallCommand,
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
