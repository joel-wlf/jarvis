import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock'
import { INSTALL_COMMAND } from '@/lib/install'

/** The one-command installer as a copyable block. The command itself lives in lib/install.ts. */
export function InstallCommand() {
  return (
    <CodeBlock>
      <Pre>{INSTALL_COMMAND}</Pre>
    </CodeBlock>
  )
}
