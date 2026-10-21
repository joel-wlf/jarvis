import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'
import { InstallCommand } from './install'

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
