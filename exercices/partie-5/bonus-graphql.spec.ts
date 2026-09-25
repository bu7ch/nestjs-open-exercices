import { creerProduitDuVendeur, creerVendeur, lancerAvecBase, sql, type AppAvecBase } from './outils.js';
import { produitValide } from '../partie-4/outils.js';

// Bonus de la section g (5.22 à 5.24). Ces tests ne tournent que si ton code active GraphQL
// (`GraphQLModule.forRoot(...)` quelque part dans src/) : sinon ils sont ignorés (« skipped »),
// pour que `npm test` reste vert sans le bonus. Les paquets GraphQL sont déjà dans package.json.
const sources = import.meta.glob(['../../src/**/*.ts', '!../../src/**/*.spec.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const graphqlActive = Object.values(sources).some((code) => /GraphQLModule\s*\.\s*forRoot/.test(code));

interface ReponseGraphql {
  data?: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { code?: string } }[];
}

describe.skipIf(!graphqlActive)('Partie 5 · Bonus : GraphQL (exercices 5.22 à 5.24)', () => {
  let lancee: AppAvecBase;
  let http: AppAvecBase['http'];

  // Si l'application ne démarre pas, chaque test échoue avec la raison (plutôt que d'être ignoré).
  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });

  beforeAll(async () => {
    try {
      lancee = await lancerAvecBase();
      http = lancee.http;
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => lancee?.fermer());

  async function graphql(query: string): Promise<ReponseGraphql> {
    const r = await http().post('/graphql').send({ query });
    expect([200, 400], `POST /graphql a répondu ${r.status} : GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true }) est-il bien importé ?`).toContain(r.status);
    return r.body as ReponseGraphql;
  }

  const erreurs = (r: ReponseGraphql) => (r.errors ?? []).map((e) => e.message).join(' | ');

  it('5.22 · la query `vendeurs` renvoie tous les vendeurs', async () => {
    const a = await creerVendeur(http, 'Vendeur GraphQL A');
    const b = await creerVendeur(http, 'Vendeur GraphQL B');
    const r = await graphql('{ vendeurs { id nom } }');
    expect(r.errors, erreurs(r)).toBeUndefined();
    const vendeurs = r.data!.vendeurs as { id: string | number; nom: string }[];
    expect(vendeurs.map((v) => [Number(v.id), v.nom])).toEqual(expect.arrayContaining([[a.id, a.nom], [b.id, b.nom]]));
  });

  describe('5.23 · la query `vendeur(id)` et le choix des champs', () => {
    it('ne renvoie que les champs demandés', async () => {
      const v = await creerVendeur(http, 'Vendeur à la carte');
      const r = await graphql(`{ vendeur(id: ${v.id}) { nom } }`);
      expect(r.errors, erreurs(r)).toBeUndefined();
      expect(r.data).toEqual({ vendeur: { nom: 'Vendeur à la carte' } });
    });

    it('renvoie les produits du vendeur quand on les demande', async () => {
      const v = await creerVendeur(http, 'Vendeur avec produits');
      const p = await creerProduitDuVendeur(http, v.id, await produitValide(http, { nom: 'Produit GraphQL' }));
      const r = await graphql(`{ vendeur(id: ${v.id}) { nom produits { id nom } } }`);
      expect(r.errors, erreurs(r)).toBeUndefined();
      const vendeur = r.data!.vendeur as { produits: { id: string | number; nom: string }[] };
      expect(vendeur.produits.map((x) => [Number(x.id), x.nom])).toEqual([[p.id, 'Produit GraphQL']]);
    });

    it('un champ inexistant est refusé par le schéma', async () => {
      const r = await graphql('{ vendeurs { salaire } }');
      expect(erreurs(r)).toContain('Cannot query field "salaire"');
    });

    it('un id qui n\'est pas un nombre est refusé par ParseIntPipe (BAD_REQUEST)', async () => {
      const r = await graphql('{ vendeur(id: "abc") { nom } }');
      expect(r.errors?.[0]?.extensions?.code, '`@Args(\'id\', { type: () => ID }, ParseIntPipe)`').toBe('BAD_REQUEST');
    });
  });

  describe('5.24 · la mutation `creerVendeur(entree)`', () => {
    it('crée le vendeur en base', async () => {
      const r = await graphql('mutation { creerVendeur(entree: { nom: "Né en GraphQL" }) { id nom } }');
      expect(r.errors, erreurs(r)).toBeUndefined();
      const cree = r.data!.creerVendeur as { id: string | number; nom: string };
      expect(cree.nom).toBe('Né en GraphQL');
      const [ligne] = await sql<{ nom: string }>('SELECT nom FROM vendeurs WHERE id = $1', [Number(cree.id)]);
      expect(ligne?.nom).toBe('Né en GraphQL');
    });

    it('un nom vide est refusé avec le code BAD_REQUEST, sans rien créer', async () => {
      const [{ n: avant }] = (await sql<{ n: string }>('SELECT count(*) AS n FROM vendeurs')) as [{ n: string }];
      const r = await graphql('mutation { creerVendeur(entree: { nom: "" }) { id } }');
      expect(r.errors?.[0]?.extensions?.code, '`@IsString() @IsNotEmpty()` sur le `nom` de l\'@InputType (et le ValidationPipe global)').toBe('BAD_REQUEST');
      const [{ n: apres }] = (await sql<{ n: string }>('SELECT count(*) AS n FROM vendeurs')) as [{ n: string }];
      expect(apres).toBe(avant);
    });
  });
});
