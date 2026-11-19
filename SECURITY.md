# Politique de sécurité

## Signaler une vulnérabilité

Merci de ne pas ouvrir d'issue publique. Utilisez le signalement privé de GitHub (onglet *Security* > *Report a vulnerability*) ou contactez le bureau
via le site, en décrivant le problème, les étapes pour le reproduire et son impact. Nous accusons réception sous 72 h.

## Périmètre

Site `generations-medecins.fr`, fonctions Netlify, base Supabase, workflows GitHub. Les tests de charge, le déni de service,
l'ingénierie sociale et l'accès aux données d'autres adhérents sont exclus.

## Pratiques

- Accès aux données par Row Level Security (Supabase), avec revue à chaque migration.
- Mises à jour automatiques des dépendances (Dependabot) et analyse CodeQL + gitleaks à chaque push.
