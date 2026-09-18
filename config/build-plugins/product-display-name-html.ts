import type { Plugin } from 'vite'
import { getProductDisplayName } from '../../src/shared/product-display-name'

function replaceLiteral(value: string, search: string, replacement: string): string {
  return value.split(search).join(replacement)
}

function dashboardTitle(productDisplayName: string): string {
  return productDisplayName === 'Orca'
    ? 'Orca Agent Dashboard'
    : `${productDisplayName} - Agent Dashboard`
}

export function transformProductDisplayNameHtml(
  html: string,
  productDisplayName = getProductDisplayName()
): string {
  return replaceLiteral(
    replaceLiteral(
      replaceLiteral(
        html,
        '<title>Orca Agent Dashboard</title>',
        `<title>${dashboardTitle(productDisplayName)}</title>`
      ),
      '<title>Orca Web</title>',
      `<title>${productDisplayName} Web</title>`
    ),
    '<title>Orca</title>',
    `<title>${productDisplayName}</title>`
  )
}

export function createProductDisplayNameHtmlPlugin(): Plugin {
  const productDisplayName = getProductDisplayName()
  return {
    name: 'orca-product-display-name-html',
    transformIndexHtml(html: string): string {
      return transformProductDisplayNameHtml(html, productDisplayName)
    }
  }
}
