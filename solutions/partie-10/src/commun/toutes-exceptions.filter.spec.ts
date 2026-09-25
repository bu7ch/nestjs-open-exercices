import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ToutesExceptionsFilter } from './toutes-exceptions.filter.js';

// 8.16 : le filtre appelé avec un faux ArgumentsHost (une fausse requête, une fausse réponse).
const hoteDe = () => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const requete = { method: 'POST', originalUrl: '/api/vendeurs', requeteId: 'abc-123' };
  const hote = { switchToHttp: () => ({ getRequest: () => requete, getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
  return { hote, status, json };
};

const erreurSql = (code: string) => new QueryFailedError('INSERT …', [], Object.assign(new Error('détail SQL'), { code }));

describe('ToutesExceptionsFilter', () => {
  const filtre = new ToutesExceptionsFilter();

  // Sans lui, l'espion d'un test garde son historique pour le suivant (le dernier test échoue).
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reprend le statut et le message d\'une HttpException', () => {
    const { hote, status, json } = hoteDe();
    filtre.catch(new NotFoundException('Vendeur 9 introuvable'), hote);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404, message: 'Vendeur 9 introuvable', chemin: '/api/vendeurs', requeteId: 'abc-123' }));
  });

  it('garde la liste des règles violées par une validation', () => {
    const { hote, json } = hoteDe();
    filtre.catch(new BadRequestException(['nom should not be empty', 'nom must be a string']), hote);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: ['nom should not be empty', 'nom must be a string'] }));
  });

  it.each([
    ['23505', 'Cette ressource existe déjà'],
    ['23503', 'Cette ressource est liée à d\'autres données'],
  ])('traduit le code SQL %s en 409', (code, message) => {
    const { hote, status, json } = hoteDe();
    filtre.catch(erreurSql(code), hote);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message }));
  });

  it('répond 500 sans rien révéler d\'une erreur inattendue, et la journalise', () => {
    const { hote, status, json } = hoteDe();
    const journaliser = vi.spyOn(filtre['logger'], 'error').mockImplementation(() => {});

    filtre.catch(new Error('mot de passe de la base : hunter2'), hote);

    expect(status).toHaveBeenCalledWith(500);
    const corps = json.mock.calls[0]?.[0];
    expect(corps.message).toBe('Erreur interne du serveur');
    expect(JSON.stringify(corps)).not.toContain('hunter2');
    expect(journaliser).toHaveBeenCalledWith('POST /api/vendeurs [abc-123]', expect.stringContaining('hunter2'));
  });

  it('ne journalise pas les erreurs du client (4xx)', () => {
    const { hote } = hoteDe();
    const journaliser = vi.spyOn(filtre['logger'], 'error').mockImplementation(() => {});
    filtre.catch(new NotFoundException(), hote);
    expect(journaliser).not.toHaveBeenCalled();
  });
});
