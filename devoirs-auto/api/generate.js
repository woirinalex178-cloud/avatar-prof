// POST { action: 'read', image } -> lit une photo du cahier de textes papier
// POST { action: 'make', devoir } -> fabrique l'entraînement adapté
import { checkPin, gemini } from './_lib.js';

const NIVEAU = 'CM2 (programme officiel français, cycle 3)';

const READ = `Tu lis la photo d'un cahier de textes d'une élève de ${NIVEAU}.
Extrais chaque devoir. Date du jour : {TODAY}. Si une date est "lundi", "demain"... convertis en AAAA-MM-JJ.
Réponds en JSON : {"devoirs":[{"matiere":"","consigne":"texte exact","pour":"AAAA-MM-JJ ou vide"}]}`;

const MAKE = `Tu es un professeur des écoles bienveillant. Élève : Céleste, ${NIVEAU}.
Devoir noté : matière "{MAT}", consigne "{TXT}", à rendre le {POUR} (aujourd'hui {TODAY}).

1. Classe le devoir :
 - "evaluation" : contrôle, évaluation, test, dictée, interro, "apprendre pour" une évaluation
 - "revision" : leçon / poésie / tables / mots à apprendre, relire
 - "exercice" : exercices à faire, fiche, question simple
2. Adapte le volume :
 - exercice : 4 questions courtes (échauffement ~5 min)
 - revision : 1 fiche mémo + 8 questions (~10 min)
 - evaluation : 1 fiche mémo + 14 questions progressives (facile -> difficile) = évaluation blanche (~20 min)
   Si l'évaluation est dans 2 jours ou plus, mets plus de questions de compréhension ; si c'est demain, simule l'évaluation.
3. Types de questions autorisés :
 - "qcm" : "choix" (3-4 propositions), "reponse" = texte exact d'un choix
 - "vraifaux" : "reponse" = "Vrai" ou "Faux"
 - "courte" : réponse d'un ou quelques mots/nombre, "reponse" = forme attendue, "accepte" = variantes acceptées
Reste strictement dans le programme de CM2 et le thème de la consigne. Explications courtes, encourageantes, sans jargon.

JSON strict :
{"type":"exercice|revision|evaluation","titre":"","duree_min":5,
 "memo":["phrase clé", "..."],
 "questions":[{"type":"qcm|vraifaux|courte","enonce":"","choix":[],"reponse":"","accepte":[],"explication":""}]}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!checkPin(req, res)) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { action, image, devoir } = req.body || {};
    if (action === 'read') {
      const [meta, data] = String(image || '').split(',');
      const mime = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';
      const out = await gemini([{ text: READ.replace('{TODAY}', today) }, { inline_data: { mime_type: mime, data } }], { temperature: 0.1 });
      return res.json(out);
    }
    if (action === 'make' && devoir?.consigne) {
      const p = MAKE.replace('{MAT}', devoir.matiere || '?').replace('{TXT}', devoir.consigne.slice(0, 1500))
        .replace('{POUR}', devoir.pour || 'bientôt').replace('{TODAY}', today);
      return res.json(await gemini([{ text: p }]));
    }
    res.status(400).json({ error: 'Requête invalide' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
