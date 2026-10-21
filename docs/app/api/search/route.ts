import { createFromSource } from 'fumadocs-core/search/server'
import { source } from '@/lib/source'

export const revalidate = false

// Exported as one static JSON file at build time; the browser searches it locally.
export const { staticGET: GET } = createFromSource(source)
