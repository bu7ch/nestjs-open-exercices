import { transitionner, type StatutCommande } from './transitions.js';

describe('transitionner', () => {
  it.each<[StatutCommande, StatutCommande]>([
    ['en_attente', 'payee'],
    ['payee', 'expediee'],
    ['expediee', 'livree'],
    ['en_attente', 'annulee'],
    ['payee', 'annulee'],
  ])('autorise %s vers %s', (actuel, cible) => {
    expect(transitionner(actuel, cible)).toBe(cible);
  });

  it.each<[StatutCommande, StatutCommande]>([
    ['livree', 'annulee'],
    ['en_attente', 'livree'],
    ['en_attente', 'expediee'],
    ['expediee', 'annulee'],
    ['annulee', 'payee'],
    ['livree', 'en_attente'],
  ])('refuse %s vers %s', (actuel, cible) => {
    expect(() => transitionner(actuel, cible)).toThrow(`Passage impossible : ${actuel} vers ${cible}`);
  });
});
