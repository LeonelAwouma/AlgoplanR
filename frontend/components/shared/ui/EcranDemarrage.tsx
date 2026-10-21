'use client'

/**
 * Écran affiché pendant l'ouverture de l'application : identité, barre de
 * progression et mention de ce qui se passe. Il remplace un simple libellé de
 * chargement sur une page vide, le temps que le serveur local réponde.
 */

import Image from 'next/image'

export function EcranDemarrage({ libelle = 'Ouverture d’AlgoPlanR…' }: { libelle?: string }) {
  return (
    <main className="demarrage" role="status" aria-live="polite" aria-busy="true">
      <div className="demarrage-carte">
        <Image src="/logo-mark.png" alt="" width={72} height={43} priority />
        <h1>ALGOPLANR</h1>
        <p className="demarrage-soustitre">Planification et affectation des enseignants</p>
        <div className="demarrage-barre" aria-hidden="true">
          <i />
        </div>
        <p className="demarrage-libelle">{libelle}</p>
      </div>
    </main>
  )
}
