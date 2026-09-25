import { ConsoleLogger } from '@nestjs/common';

// 10.11 : du JSON en production (une ligne par événement, lue par des outils), le texte coloré habituel
// sur ta machine ; et, en production, ni `verbose` ni `debug`.
export function creerLogger(production: boolean) {
  return new ConsoleLogger({
    json: production,
    logLevels: production ? ['log', 'warn', 'error', 'fatal'] : ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'],
  });
}
