// Fichier de préparation (setupFiles) chargé AVANT chacun de TES fichiers de test, quand les tests de
// la partie 9 font tourner ton test du contrat (9.15) dans une copie temporaire de ton projet (jamais dans
// ton dépôt), comme en parties 6 et 8.
//
// Une seule mutation : `contrat:champ-renomme`. Le premier champ documenté de ton DTO de réponse
// (`ProduitReponseDto`, 9.2) est renommé dans la documentation (`id` devient `id_renomme`), comme si
// quelqu'un l'avait renommé sans mettre à jour le fichier de référence. Ton fichier source n'est jamais
// réécrit : seules les métadonnées de `@ApiProperty` de la classe chargée changent.
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { vi } from 'vitest';

interface Plan {
  controle: string;
  cible9?: { fichier: string; export: string };
}

const plan = JSON.parse(readFileSync(process.env.P6_PLAN!, 'utf8')) as Plan;
const racine = dirname(dirname(process.env.P6_PLAN!));
const absolu = (fichier: string) => (isAbsolute(fichier) ? fichier : join(racine, fichier));
const mutation = (): string => readFileSync(plan.controle, 'utf8').trim();

// Les clés de métadonnées de @nestjs/swagger (DECORATORS.API_MODEL_PROPERTIES…).
const LISTE = 'swagger/apiModelPropertiesArray';
const PROPRIETE = 'swagger/apiModelProperties';

function renommerPremierChamp(classe: { prototype: object }) {
  const proto = classe.prototype;
  const liste = (Reflect.getMetadata(LISTE, proto) as string[] | undefined) ?? [];
  const premier = liste[0];
  if (!premier) return;
  const nom = premier.replace(/^:/, '');
  const nouveau = `${nom}_renomme`;
  Reflect.defineMetadata(LISTE, [`:${nouveau}`, ...liste.slice(1)], proto);
  const options = Reflect.getMetadata(PROPRIETE, proto, nom) as object | undefined;
  if (options) Reflect.defineMetadata(PROPRIETE, options, proto, nouveau);
  const type = Reflect.getMetadata('design:type', proto, nom) as unknown;
  if (type) Reflect.defineMetadata('design:type', type, proto, nouveau);
}

const cible = plan.cible9;
if (cible) {
  vi.doMock(absolu(cible.fichier), async (importOriginal) => {
    const origine = await importOriginal<Record<string, unknown>>();
    const classe = origine[cible.export] as { prototype: object } | undefined;
    if (mutation() === 'contrat:champ-renomme' && typeof classe === 'function') renommerPremierChamp(classe);
    return origine;
  });
}
