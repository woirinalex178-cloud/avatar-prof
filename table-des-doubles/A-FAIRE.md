# À faire (toi)

Ces actions se font sur tes comptes : je ne peux pas les faire à ta place. Tout est gratuit.

## Pour que les inscriptions marchent
- [ ] **Supabase → Authentication → URL Configuration** : Site URL = `https://table-des-doubles.vercel.app`
- [ ] **Supabase → Authentication → Emails** : désactiver « Confirm email » pendant les tests, OU créer un compte Resend (3 000 mails/mois gratuits) et me donner la clé SMTP.

## Pour activer les vrais paiements (Stripe, mode test gratuit)
- [ ] Créer un compte sur stripe.com
- [ ] Supabase → Edge Functions → Secrets : ajouter `STRIPE_SECRET_KEY` (clé `sk_test_…`) et `CRON_SECRET` (un mot de passe au choix)
- [ ] Stripe → Développeurs → Webhooks : ajouter l'URL `https://zfnjljfmhlnctlidtvqm.supabase.co/functions/v1/payments/webhook`
      (événements : `checkout.session.completed`, `account.updated`), puis copier sa clé dans le secret `STRIPE_WEBHOOK_SECRET`
- [ ] Me prévenir → j'active les paiements réels et le versement automatique aux vendeurs

## Avant le lancement public
- [ ] Créer une micro-entreprise (gratuit, autoentrepreneur.urssaf.fr)
- [ ] Vérifier que le nom « Table des Doubles » est libre (INPI, recherche gratuite)
- [ ] Valider les CGU/CGV + mentions légales + politique de confidentialité (je peux les rédiger)
- [ ] DAC7 : déclarer chaque année aux impôts les vendeurs de plus de 30 ventes ou 2 000 €

## Plus tard (quand il y aura des utilisateurs)
- [ ] Google Play (25 $ une fois) / App Store (99 $ par an)
- [ ] Nom de domaine (~10 €/an)
