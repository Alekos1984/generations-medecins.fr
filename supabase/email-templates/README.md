# Modèles d'e-mails d'authentification (Supabase)

À coller dans Supabase : **Authentication > Email Templates**. Un modèle par onglet, avec l'objet indiqué.

| Onglet Supabase | Fichier | Objet |
|---|---|---|
| Confirm signup | `confirmation.html` | Confirmez votre adresse e-mail - Générations Médecins |
| Reset password | `recovery.html` | Réinitialisez votre mot de passe - Générations Médecins |
| Magic link | `magic_link.html` | Votre lien de connexion - Générations Médecins |
| Change email address | `email_change.html` | Confirmez votre nouvelle adresse e-mail - Générations Médecins |

Les variables `{{ .ConfirmationURL }}` et `{{ .NewEmail }}` sont celles de Supabase : ne pas les modifier.
Le logo est chargé depuis `https://generations-medecins.fr/logoGM.jpeg`.
