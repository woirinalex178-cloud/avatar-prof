// POST { action: 'read', image?, texte? } -> lit la photo / le PDF (data URL) et/ou le texte libre
// POST { action: 'make', devoir } -> fiche pédagogique + banque de questions
// POST { action: 'more', devoir, deja, n } -> nouvelles questions différentes de celles déjà posées
import { checkPin, gemini } from './_lib.js';

const NIVEAU = 'CM2 (programme officiel français, cycle 3)';

const READ = `Tu reçois les devoirs d'une élève de ${NIVEAU} : une photo ou un document (PDF) de son cahier de textes et/ou un texte écrit par elle ou ses parents.
Le texte est prioritaire : il précise ou corrige la photo ou le document. Extrais chaque devoir séparément, reformulé clairement. Date du jour : {TODAY} ({JOUR}). Si une date est "lundi", "demain"... convertis en AAAA-MM-JJ (le prochain jour correspondant).
Réponds en JSON : {"devoirs":[{"matiere":"","consigne":"consigne claire et complète","pour":"AAAA-MM-JJ ou vide"}]}`;

const FORMAT_Q = `{"type":"qcm|vraifaux|courte","niveau":1,"enonce":"","choix":[],"reponse":"","accepte":[],"explication":""}`;
const REGLES_Q = `Types de questions :
 - "qcm" : "choix" (3-4 propositions), "reponse" = texte exact d'un choix
 - "vraifaux" : "reponse" = "Vrai" ou "Faux"
 - "courte" : réponse d'un ou quelques mots/nombre, "reponse" = forme attendue, "accepte" = variantes acceptées
"niveau" : 1 facile, 2 moyen, 3 difficile. Varie vraiment les questions : autres exemples, autres nombres, autres angles,
jamais deux fois la même question reformulée. Explications courtes, encourageantes, sans jargon.
Reste strictement dans le programme de CM2 et le thème du devoir.`;

const MAKE = `Tu es un professeur des écoles bienveillant et pédagogue. Élève : Céleste, ${NIVEAU}.
Devoir noté : matière "{MAT}", consigne "{TXT}", à rendre le {POUR} (aujourd'hui {TODAY}).

1. Classe le devoir :
 - "evaluation" : contrôle, évaluation, test, dictée, interro, "apprendre pour" une évaluation
 - "revision" : leçon / poésie / tables / mots à apprendre, relire
 - "exercice" : exercices à faire, fiche, question simple
2. Rédige une FICHE PÉDAGOGIQUE claire et jolie à relire (comme une fiche de révision d'un bon manuel de CM2) :
 intro (1-2 phrases qui donnent envie), 2 à 4 sections (titre + points clés courts + un exemple concret),
 "a_retenir" (3 à 5 phrases essentielles), une "astuce" (moyen mnémotechnique), 1 à 3 "pieges" (erreurs fréquentes).
3. Crée une BANQUE de questions variées (on en tirera au hasard à chaque entraînement) :
 exercice : 10 questions ; revision : 16 questions ; evaluation : 24 questions (mélange des 3 niveaux).
${REGLES_Q}

JSON strict :
{"type":"exercice|revision|evaluation","titre":"","duree_min":5,
 "fiche":{"intro":"","sections":[{"titre":"","points":[""],"exemple":""}],"a_retenir":[""],"astuce":"","pieges":[""]},
 "questions":[${FORMAT_Q}]}`;

const MORE = `Tu es un professeur des écoles. Élève de ${NIVEAU}. Devoir : matière "{MAT}", consigne "{TXT}".
Questions DÉJÀ posées (ne pas les refaire, ni les reformuler) :
{DEJA}
Crée {N} NOUVELLES questions différentes sur le même thème, des 3 niveaux.
${REGLES_Q}
JSON strict : {"questions":[${FORMAT_Q}]}`;

// Fiche + banque de questions pour un devoir (utilisé aussi par la tâche automatique).
export async function makePack(devoir, today = new Date().toISOString().slice(0, 10)) {
  const p = MAKE.replace('{MAT}', devoir.matiere || '?').replace('{TXT}', devoir.consigne.slice(0, 1500))
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
      return res.json(await makePack(devoir, today));
    }
    if (action === 'more' && devoir?.consigne) {
      const p = MORE.replace('{MAT}', devoir.matiere || '?').replace('{TXT}', devoir.consigne.slice(0, 1500))
        .replace('{DEJA}', (req.body.deja || []).slice(-60).map(q => '- ' + String(q).slice(0, 160)).join('\n') || '(aucune)')
        .replace('{N}', Math.min(Number(req.body.n) || 12, 20));
      return res.json(await gemini([{ text: p }], { temperature: 0.9 }));
    }
    res.status(400).json({ error: 'Requête invalide' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
