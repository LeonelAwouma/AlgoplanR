# Fonds de carte

Ce dossier accueille les fichiers géographiques utilisés par la page
**Diagnostic → Territoires**. Ils sont lus depuis l'application elle-même :
aucune tuile ni aucun service cartographique distant n'est appelé, et
l'application fonctionne sans connexion Internet.

## Fichiers attendus

| Fichier | Rôle | Obligatoire |
| --- | --- | --- |
| `cameroun-regions.geojson` | Contours des dix régions | Non |
| `cameroun-departements.geojson` | Contours des départements | Non |
| `cameroun-arrondissements.geojson` | Contours des arrondissements, affichés comme les communes d'un département | Non |

Tant qu'aucun fichier n'est présent, la page Territoires affiche les mêmes
indicateurs sous forme de grille de territoires, et l'indique clairement.
**Aucun contour n'est inventé.**

## Format attendu

Un `FeatureCollection` GeoJSON standard, en coordonnées géographiques
(longitude, latitude — EPSG:4326), dont chaque entité porte le nom du
territoire dans l'une de ces propriétés :

```
nom · name · NAME · NAME_1 · NAME_2 · shapeName · region · REGION · departement · admin1Name
```

Exemple minimal :

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "nom": "Centre" },
      "geometry": { "type": "Polygon", "coordinates": [[[11.0, 3.5], [12.0, 3.5], [12.0, 4.5], [11.0, 4.5], [11.0, 3.5]]] }
    }
  ]
}
```

Le rapprochement entre le nom de l'entité et le libellé de région présent dans
les données importées ignore les accents, la casse et la ponctuation :
`Extrême-Nord`, `EXTREME NORD` et `extreme_nord` sont reconnus comme un même
territoire. Une entité sans correspondance dans les données reste dessinée en
gris et signalée comme absente du jeu de données.

## Arrondissements et communes

Un arrondissement correspond à une commune de l'application. La carte des
communes s'affiche lorsqu'un département est sélectionné, et ne dessine que les
arrondissements dont le nom correspond à une commune présente dans les données
importées. Les numéros d'ordre sont comparés strictement : « Yaoundé I » et
« Yaoundé II » sont deux entités distinctes.

Certains exports (geoBoundaries, par exemple) contiennent des noms encodés deux
fois, comme « MÃ©long » pour « Mélong ». L'application les répare à la lecture ;
le fichier n'est pas modifié.

## Après ajout d'un fichier

Relancez `npm run build` pour que le fichier soit inclus dans l'export statique
servi par l'application de bureau.
