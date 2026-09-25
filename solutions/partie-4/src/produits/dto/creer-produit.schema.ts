// Bonus 4.15 : le même DTO, décrit avec Zod. Il n'est branché sur aucune route :
// la suite du cours garde class-validator (voir common/zod-validation.pipe.ts).
import { z } from 'zod';

export const creerProduitSchema = z.object({
  nom: z.string().min(1),
  prix: z.number().min(0),
  categorie: z.enum(['papeterie', 'informatique', 'mobilier']),
});

export type CreerProduitDto = z.infer<typeof creerProduitSchema>;
