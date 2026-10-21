// Repository facts used by links, edit-on-GitHub and the base path. Change them here only.
export const appName = 'Jarvis'

export const gitConfig = {
  user: 'joel-wlf',
  repo: 'jarvis',
  branch: 'main',
}

export const repoUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`

/** Set by the docs workflow to "/<repo name>" for GitHub Pages; empty for local builds and custom domains. */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export const docsRoute = '/docs'
