import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { UnrecoverableError, type Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { CATEGORIES } from '../produits/dto/creer-produit.dto.js';
import { Produit } from '../produits/produit.entity.js';
import { Vendeur } from '../vendeurs/vendeur.entity.js';
import { FILE_IMPORTS, type DemandeImport, type ResultatImport } from './imports.service.js';

const EN_TETE = 'nom;prix;categorie';

@Processor(FILE_IMPORTS)
export class ImportsProcessor extends WorkerHost {
  private readonly logger = new Logger('Imports');

  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async process(job: Job<DemandeImport>): Promise<ResultatImport> {
    const lignes = job.data.csv.split(/\r?\n/);
    // 11.11 : un fichier mal formé ne se corrigera pas en attendant : inutile de réessayer.
    if (lignes[0]?.trim() !== EN_TETE) throw new UnrecoverableError(`En-tête attendu : ${EN_TETE}`);

    // 11.11 : chaque tentative recommence tout. Une transaction pour tout le fichier : une tentative
    // ratée n'a rien écrit, la suivante peut tout refaire sans créer de doublon.
    return this.dataSource.transaction(async (base) => {
      const vendeur = await base.findOneBy(Vendeur, { id: job.data.vendeurId });
      if (!vendeur) throw new UnrecoverableError(`Vendeur ${job.data.vendeurId} introuvable`);
      const resultat: ResultatImport = { crees: 0, erreurs: [] };
      for (const [index, brute] of lignes.entries()) {
        if (index === 0 || brute.trim() === '') continue;
        const ligne = index + 1; // la ligne 1 est l'en-tête
        const [nom = '', prixTexte = '', categorie = ''] = brute.split(';').map((c) => c.trim());
        const prix = Number(prixTexte);
        const erreur =
          nom === '' ? 'nom est obligatoire'
          : prixTexte === '' || !Number.isFinite(prix) || prix < 0 ? 'prix doit être un nombre positif'
          : !(CATEGORIES as readonly string[]).includes(categorie) ? `categorie doit être l'une de : ${CATEGORIES.join(', ')}`
          : null;
        if (erreur) {
          resultat.erreurs.push({ ligne, message: erreur });
          continue;
        }
        await base.save(Produit, { nom, prix, categorie, vendeur });
        resultat.crees++;
      }
      return resultat;
    });
  }

  // Appelé à CHAQUE tentative ratée : on ne journalise que l'échec définitif.
  @OnWorkerEvent('failed')
  surEchec(job: Job<DemandeImport>, erreur: Error) {
    if (job.attemptsMade < (job.opts.attempts ?? 1) && !(erreur instanceof UnrecoverableError)) return;
    this.logger.error(`Import ${job.id} abandonné après ${job.attemptsMade} tentative(s) : ${erreur.message}`);
  }
}
