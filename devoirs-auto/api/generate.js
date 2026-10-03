// POST { action: 'read', image?, texte? } -> lit la photo / le PDF (data URL) et/ou le texte libre
// POST { action: 'make', devoir } -> fabrique l'entraînement adapté
import { checkPin, gemini } from './_lib.js';

const NIVEAU = 'CM2 (programme officiel français, cycle 3)';

const READ = `Tu reçois les devoirs d'une élève de ${NIVEAU} : une photo ou un document (PDF) de son cahier de textes et/ou un texte écrit par elle ou ses parents.
Le texte est prioritaire : il précise ou corrige la photo ou le document. Extrais chaque devoir séparément, reformulé clairement. Date du jour : {TODAY} ({JOUR}). Si une date est "lundi", "demain"... convertis en AAAA-MM-JJ (le prochain jour correspondant).
Réponds en JSON : {"devoirs":[{"matiere":"","consigne":"consigne claire et complète","pour":"AAAA-MM-JJ ou vide"}]}`;

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
      const p = MAKE.replace('{MAT}', devoir.matiere || '?').replace('{TXT}', devoir.consigne.slice(0, 1500))
        .replace('{POUR}', devoir.pour || 'bientôt').replace('{TODAY}', today);
      return res.json(await gemini([{ text: p }]));
    }
    res.status(400).json({ error: 'Requête invalide' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
