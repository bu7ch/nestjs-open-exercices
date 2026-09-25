import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Produit')
export class ProduitType {
  @Field(() => ID)
  id: number;

  @Field()
  nom: string;

  // Un `numeric` PostgreSQL arrive en chaîne : on l'expose tel quel.
  @Field()
  prix: string;

  @Field()
  categorie: string;
}

@ObjectType('Vendeur')
export class VendeurType {
  @Field(() => ID)
  id: number;

  @Field()
  nom: string;

  @Field(() => [ProduitType])
  produits: ProduitType[];
}
