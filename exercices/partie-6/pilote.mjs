// Lancé par les tests de la partie 6, dans une copie temporaire de ton projet (un processus à part) :
// fait tourner TES tests avec Vitest, une fois par mutation demandée, et écrit les résultats en JSON.
// Usage : node pilote.mjs <demande.json>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { createVitest, resolveConfig } from 'vitest/node';

const demande = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const racine = demande.racine;
const sortie = {};

const message = (e) => (e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e));

function resumer(resultat) {
  return {
    modules: resultat.testModules.map((m) => ({
      fichier: relative(racine, m.moduleId),
      etat: m.state(),
      erreurs: m.errors().map(message),
      tests: [...m.children.allTests()].map((t) => {
        const r = t.result();
        return { nom: t.fullName, etat: r.state, erreurs: (r.errors ?? []).map(message) };
      }),
    })),
    nonGerees: resultat.unhandledErrors.map(message),
  };
}

try {
  if (demande.mode === 'executer') {
    // Tes tests, sans mutation puis avec chacune des mutations demandées.
    const vitest = await createVitest('test', { config: demande.config, watch: false, reporters: ['dot'] });
    await vitest.standalone();
    const toutes = await vitest.globTestSpecifications();
    // `fichiers` : seulement ces fichiers de test (chemins depuis la racine du projet).
    const specs = demande.fichiers ? toutes.filter((s) => demande.fichiers.includes(relative(racine, s.moduleId))) : toutes;
    sortie.executions = [];
    for (const mutation of demande.mutations) {
      writeFileSync(demande.controle, mutation);
      writeFileSync(demande.journal, '');
      const resultat = specs.length > 0 ? resumer(await vitest.runTestSpecifications(specs, true)) : { modules: [], nonGerees: [] };
      const journal = readFileSync(demande.journal, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .map((l) => ({ ...l, fichier: relative(racine, l.fichier) }));
      sortie.executions.push({ mutation, ...resultat, journal });
    }
    await vitest.close();
  } else if (demande.mode === 'config') {
    // Ta configuration de Vitest, telle que Vitest la comprend (include, fileParallelism, coverage…).
    if (!existsSync(demande.config)) {
      sortie.config = null;
    } else {
      const { vitestConfig } = await resolveConfig({ config: demande.config, root: racine });
      const c = vitestConfig.coverage ?? {};
      sortie.config = {
        include: vitestConfig.include,
        fileParallelism: vitestConfig.fileParallelism,
        coverage: { include: c.include, exclude: c.exclude, thresholds: c.thresholds },
      };
    }
  } else if (demande.mode === 'couverture') {
    // `npm run test:cov` avec TA configuration ; on lit le résumé JSON de la couverture.
    const vitest = await createVitest('test', {
      config: demande.config,
      watch: false,
      reporters: ['dot'],
      coverage: { enabled: true, provider: 'v8', reporter: ['json-summary'], reportsDirectory: demande.dossier },
    });
    const resultat = await vitest.start();
    await vitest.close();
    sortie.tests = resumer(resultat);
    const fichier = `${demande.dossier}/coverage-summary.json`;
    sortie.resume = existsSync(fichier) ? JSON.parse(readFileSync(fichier, 'utf8')) : null;
  }
} catch (erreur) {
  sortie.erreur = `${message(erreur)}\n${erreur?.stack ?? ''}`;
}

writeFileSync(demande.sortie, JSON.stringify(sortie));
process.exit(0);
