// POST { action: 'read', image?, texte? } -> lit la photo / le PDF (data URL) et/ou le texte libre
// POST { action: 'make', devoir } -> fiche pédagogique + banque de questions
// POST { action: 'more', devoir, deja, n } -> nouvelles questions différentes de celles déjà posées
// POST { action: 'visuels', devoir, titre } -> frise / personnages / carte (+ questions) pour une ancienne fiche
import { checkPin, gemini } from './_lib.js';

const NIVEAU = 'CM2 (programme officiel français, cycle 3)';

const READ = `Tu reçois les devoirs d'une élève de ${NIVEAU} : une photo ou un document (PDF) de son cahier de textes et/ou un texte écrit par elle ou ses parents.
Le texte est prioritaire : il précise ou corrige la photo ou le document. Extrais chaque devoir séparément, reformulé clairement. Date du jour : {TODAY} ({JOUR}). Si une date est "lundi", "demain"... convertis en AAAA-MM-JJ (le prochain jour correspondant).
Réponds en JSON : {"devoirs":[{"matiere":"","consigne":"consigne claire et complète","pour":"AAAA-MM-JJ ou vide"}]}`;

const FORMAT_Q = `{"type":"qcm|vraifaux|courte|frise|carte|schema|ordre","niveau":1,"enonce":"","choix":[],"reponse":"","accepte":[],"items":[],"trous":[],"lieux":[],"etapes":[],"forme":"chaine","explication":""}`;
const REGLES_Q = `Types de questions :
 - "qcm" : "choix" (3-4 propositions), "reponse" = texte exact d'un choix
 - "vraifaux" : "reponse" = "Vrai" ou "Faux"
 - "courte" : réponse d'un ou quelques mots/nombre, "reponse" = forme attendue, "accepte" = variantes acceptées
 - "frise" (HISTOIRE seulement) : frise à trous. "items" = 4 à 6 repères {"annee":nombre (négatif avant J.-C.),"label":"vers 3000 av. J.-C.","texte":"événement court"}
   dans l'ordre chronologique, "trous" = indices (2 ou 3) des textes à retrouver
 - "carte" (GÉOGRAPHIE seulement) : carte d'atlas à trous, mêmes champs qu'une carte de la fiche ("fond","zones","fleuves","mers","lieux"),
   avec 3 à 6 éléments EN TOUT à retrouver ; l'élève voit les contours et les numéros, pas les noms
 - "schema" (SCIENCES) : schéma à trous. "forme" = "chaine" ou "cycle", "etapes" = 4 à 7 {"nom":"mot court","icone":"un emoji","desc":"courte"}
   dans l'ordre, "trous" = indices (2 ou 3) des noms à retrouver
 - "ordre" (SCIENCES ou HISTOIRE) : remettre dans l'ordre. "etapes" = 4 à 6 {"nom":"","icone":"emoji"} dans le BON ordre (l'app les mélange)
"niveau" : 1 facile, 2 moyen, 3 difficile. Varie vraiment les questions : autres exemples, autres nombres, autres angles,
jamais deux fois la même question reformulée. Explications courtes, encourageantes, sans jargon.
Reste strictement dans le programme de CM2 et le thème du devoir.`;

const VISUELS = `VISUELS selon la matière :
 - HISTOIRE : "frise" = 5 à 8 repères {"annee":nombre (négatif avant J.-C.),"label":"vers 3000 av. J.-C.","texte":"événement court"} dans l'ordre ;
   "personnages" = 2 à 4 personnages ou groupes importants du thème {"nom":"","wiki":"titre EXACT de l'article Wikipédia français","role":"en une phrase","dates":""}
   (pour la préhistoire : par ex. Homo sapiens, Lucy (australopithèque), l'homme de Néandertal).
 - GÉOGRAPHIE : "cartes" = 1 à 4 cartes d'atlas ADAPTÉES À LA LEÇON, chacune {"titre":"","fond":"france_regions|france_departements|europe|monde","legende":"une phrase",
     "zones":[{"nom":"","info":""}],"fleuves":[{"nom":"","info":""}],"mers":[{"nom":"","info":""}],"lieux":[{"nom":"","lat":0,"lon":0,"info":""}]}
   L'app dessine les vrais contours ; tu choisis le fond et ce qu'il faut colorier ou tracer :
   · "fond" : france_regions (13 régions), france_departements, europe (pays d'Europe), monde (pays et continents).
   · "zones" à colorier : régions (noms officiels : "Auvergne-Rhône-Alpes", "Hauts-de-France"…), départements ("Rhône", "Gironde"…),
     pays en français ("Allemagne"), continents ("Europe", "Afrique", "Asie", "Amérique du Nord", "Amérique du Sud", "Océanie"),
     massifs ("Alpes", "Pyrénées", "Massif central", "Jura", "Vosges").
   · "fleuves" : "Loire", "Seine", "Garonne", "Rhône", "Rhin", "Dordogne", "Saône", "Meuse", "Danube"… ; "mers" : "Manche", "mer du Nord",
     "océan Atlantique", "mer Méditerranée", "golfe de Gascogne" ; "lieux" : villes aux coordonnées EXACTES.
   Exemples : relief/fleuves de France -> fond france_regions + massifs + fleuves + mers ; « situer son lieu de vie à différentes échelles »
   -> une suite de cartes : sa commune (lieu) dans son département (france_departements), sa région (france_regions),
   la France en Europe (europe, zone "France"), l'Europe dans le monde (monde, zone "Europe").
 - SCIENCES : "schema" = {"titre":"","forme":"chaine|cycle","etapes":[{"nom":"mot court","icone":"emoji","desc":"une phrase"}] (4 à 7, dans l'ordre),
   "wiki":"titre EXACT d'un article Wikipédia français dont l'image principale est un schéma du sujet (ex. Appareil digestif, Cycle de l'eau)"}
   pour tout phénomène, trajet, cycle ou suite d'étapes (digestion, cycle de l'eau, chaîne alimentaire, circulation, germination…).
 - SCIENCES ou autre : "personnages" seulement si un savant/personnage important fait partie du thème (ex. Pasteur), sinon [].
 Ce qui ne s'applique pas : [] (ou null pour le schéma).
{LIEU}`;

const MAKE = `Tu es un professeur des écoles bienveillant et pédagogue. Élève : Céleste, ${NIVEAU}.
Devoir noté : matière "{MAT}", consigne "{TXT}", à rendre le {POUR} (aujourd'hui {TODAY}).

1. Classe le devoir :
 - "evaluation" : contrôle, évaluation, test, dictée, interro, "apprendre pour" une évaluation
 - "revision" : leçon / poésie / tables / mots à apprendre, relire
 - "exercice" : exercices à faire, fiche, question simple
2. Rédige une FICHE PÉDAGOGIQUE claire et jolie à relire (comme une fiche de révision d'un bon manuel de CM2) :
 intro (1-2 phrases qui donnent envie), 2 à 4 sections (titre + points clés courts + un exemple concret),
 "a_retenir" (3 à 5 phrases essentielles), une "astuce" (moyen mnémotechnique), 1 à 3 "pieges" (erreurs fréquentes).
3. Ajoute les VISUELS dans la fiche. ${VISUELS}
4. Crée une BANQUE de questions variées (on en tirera au hasard à chaque entraînement) :
 exercice : 10 questions ; revision : 16 questions ; evaluation : 24 questions (mélange des 3 niveaux).
 En HISTOIRE inclus 2 à 3 questions "frise" et 1 "ordre" ; en GÉOGRAPHIE 2 à 3 questions "carte" ;
 en SCIENCES 2 à 3 questions "schema" et 1 à 2 "ordre".
${REGLES_Q}

JSON strict :
{"type":"exercice|revision|evaluation","titre":"","duree_min":5,
 "fiche":{"intro":"","sections":[{"titre":"","points":[""],"exemple":""}],"a_retenir":[""],"astuce":"","pieges":[""],
   "frise":[],"personnages":[],"cartes":[],"schema":null},
 "questions":[${FORMAT_Q}]}`;

const MORE = `Tu es un professeur des écoles. Élève de ${NIVEAU}. Devoir : matière "{MAT}", consigne "{TXT}".
Questions DÉJÀ posées (ne pas les refaire, ni les reformuler) :
{DEJA}
Crée {N} NOUVELLES questions différentes sur le même thème, des 3 niveaux.
${REGLES_Q}
JSON strict : {"questions":[${FORMAT_Q}]}`;

// Ajoute les visuels (frise, personnages, carte + questions) à une fiche existante.
const PLUS = `Élève de ${NIVEAU}. Devoir : matière "{MAT}", consigne "{TXT}", titre de la fiche "{TITRE}".
${VISUELS}
Ajoute aussi 3 questions visuelles ("frise"/"ordre" en histoire, "carte" en géographie, "schema"/"ordre" en sciences ; sinon "questions":[]).
${REGLES_Q}
JSON strict : {"frise":[],"personnages":[],"cartes":[],"schema":null,"questions":[${FORMAT_Q}]}`;

// Fiche + banque de questions pour un devoir (utilisé aussi par la tâche automatique).
// Lieu de vie de l'élève (réglage de l'app), pour les cartes « mon lieu de vie ».
const lieu = profil => profil?.commune ? `L'élève habite à ${String(profil.commune).slice(0, 80)} (France) : utilise-le pour situer son lieu de vie.` : '';

export async function makePack(devoir, today = new Date().toISOString().slice(0, 10), profil) {
  const p = MAKE.replace('{LIEU}', lieu(profil)).replace('{MAT}', devoir.matiere || '?').replace('{TXT}', devoir.consigne.slice(0, 1500))
    .replace('{POUR}', devoir.pour || 'bientôt').replace('{TODAY}', today);
  return gemini([{ text: p }]);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!checkPin(req, res)) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { action, image, texte, devoir } = req.body || {};
    if (action === 'read' && (image || texte)) {
      const parts = [{ text: READ.replace('{TODAY}', today).replace('{JOUR}', new Date().toLocaleDateString('fr-FR', { weekday: 'long' })) }];
      if (texte) parts.push({ text: 'Texte : ' + String(texte).slice(0, 2000) });
      if (image) {
        const [meta, data] = String(image).split(',');
        parts.push({ inline_data: { mime_type: meta.match(/data:(.*?);/)?.[1] || 'image/jpeg', data } });
      }
      return res.json(await gemini(parts, { temperature: 0.1 }));
    }
    if (action === 'make' && devoir?.consigne) {
      return res.json(await makePack(devoir, today, req.body.profil));
    }
    if (action === 'more' && devoir?.consigne) {
      const p = MORE.replace('{LIEU}', lieu(req.body.profil)).replace('{MAT}', devoir.matiere || '?').replace('{TXT}', devoir.consigne.slice(0, 1500))
        .replace('{DEJA}', (req.body.deja || []).slice(-60).map(q => '- ' + String(q).slice(0, 160)).join('\n') || '(aucune)')
        .replace('{N}', Math.min(Number(req.body.n) || 12, 20));
      return res.json(await gemini([{ text: p }], { temperature: 0.9 }));
    }
    if (action === 'visuels' && devoir?.consigne) {
      const p = PLUS.replace('{LIEU}', lieu(req.body.profil)).replace('{MAT}', devoir.matiere || '?').replace('{TXT}', devoir.consigne.slice(0, 1500)).replace('{TITRE}', String(req.body.titre || ''));
      return res.json(await gemini([{ text: p }], { temperature: 0.4 }));
    }
    res.status(400).json({ error: 'Requête invalide' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
