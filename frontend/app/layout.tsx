import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'

import { Fournisseurs } from '@components/racine'
import './globals.css'

// Polices (SIL OFL 1.1) embarquées dans l'application : aucune requête vers un service de
// polices, l'application fonctionnant sans connexion Internet.
// Figtree est la police principale ; Source Sans 3 reste en repli dans la pile de app/globals.css.
const figtree = localFont({
  src: './fonts/figtree-latin-wght-normal.woff2',
  weight: '300 900',
  display: 'swap',
  variable: '--font-figtree',
})

const sourceSans = localFont({
  src: './fonts/source-sans-3-latin-wght-normal.woff2',
  weight: '200 900',
  display: 'swap',
  variable: '--font-source-sans',
})

export const metadata: Metadata = {
  title: 'ALGOPLANR — Affectation des enseignants',
  description:
    "Analyse des besoins, répartition territoriale et simulation de scénarios d'affectation. Traitement local par le serveur AlgoPlanR, sans transmission de données.",
  icons: {
    icon: [{ url: '/icon-logo-64.png', type: 'image/png', sizes: '64x64' }],
    apple: '/apple-icon-logo.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light',
  themeColor: '#027174',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${figtree.variable} ${sourceSans.variable}`}>
      <body>
        <Fournisseurs>{children}</Fournisseurs>
      </body>
    </html>
  )
}
