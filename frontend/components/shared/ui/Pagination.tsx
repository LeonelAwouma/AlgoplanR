'use client'

/** Navigation entre les pages d'une liste paginée par le serveur. */

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { nombreDePages, type Page } from '@shared/api'
import { fmt } from '@shared/ui/commun'

export interface ProprietesPagination {
  page: Page<unknown>
  onPage: (page: number) => void
}

/** Boutons « précédente / suivante » et position courante ; masqués s'il n'y a qu'une page. */
export function Pagination({ page, onPage }: ProprietesPagination) {
  const total = nombreDePages(page)
  if (total <= 1) return null
  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        className="btn btn-sm"
        disabled={page.page <= 1}
        onClick={() => onPage(page.page - 1)}
        aria-label="Page précédente"
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </button>
      <span>
        Page {fmt(page.page)} sur {fmt(total)} · {fmt(page.total)} élément(s)
      </span>
      <button
        type="button"
        className="btn btn-sm"
        disabled={page.page >= total}
        onClick={() => onPage(page.page + 1)}
        aria-label="Page suivante"
      >
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </nav>
  )
}
