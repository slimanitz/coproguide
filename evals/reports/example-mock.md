# Évaluation CoproGuide — example-mock

- Run : `d3b129e5-f7ee-4a53-816e-5edb17fd8814`
- Fournisseur : **mock** (modèle `mock-claude-sonnet-5-5`, juge `mock-judge`)
- Seuil de similarité : 0.83
- Début : 2026-10-08T17:58:43.070Z — fin : 2026-10-08T17:58:50.532Z

## Synthèse

| Métrique | Valeur |
|---|---|
| Questions | 50 |
| Rappel@5 (articles attendus retrouvés) | 93.3 % |
| Rappel@8 | 93.3 % |
| Précision des citations | 37.5 % |
| Citations ancrées (numéros valides) | 100.0 % |
| Refus corrects (hors corpus) | 80.0 % |
| Refus à tort (dans le corpus) | 2.2 % |
| Note du juge (1-5) | 3.86 |
| Latence moyenne | 93 ms |
| Latence p95 | 85 ms |
| Coût total | 0.3325 € |

## Détail par question

| id | catégorie | question | attendus | cités | rappel@8 | juge | latence (ms) |
|---|---|---|---|---|---|---|---|
| q01 | copropriete | Quelle majorité pour voter des travaux d'amélioration ? | 65-557:25, 65-557:25-1 | 65-557:25, 65-557:24, 65-557:14-2 | 1.00 | 4 | 2648 |
| q02 | copropriete | Quelle majorité faut-il pour élire ou révoquer le syndic ? | 65-557:25 | 65-557:25-1, 65-557:21, 65-557:18 | 0.00 | 4 | 44 |
| q03 | copropriete | Qu'est-ce que la passerelle de l'article 25-1 ? | 65-557:25-1 | 65-557:25-1 | 1.00 | 4 | 56 |
| q04 | copropriete | Quelle majorité pour modifier le règlement de copropriété concernant l'usage des parties communes ? | 65-557:26 | 65-557:26, 65-557:25, 65-557:8 | 1.00 | 5 | 46 |
| q05 | copropriete | Peut-on supprimer le poste de gardien de l'immeuble et à quelle majorité ? | 65-557:26 | 65-557:26 | 1.00 | 5 | 85 |
| q06 | copropriete | Les travaux de rénovation énergétique sont-ils votés à la majorité simple ? | 65-557:24 | 65-557:14-2, 65-557:24, 65-557:25 | 1.00 | 3 | 91 |
| q07 | copropriete | Quelle majorité pour les travaux d'accessibilité aux personnes handicapées ? | 65-557:24 | 65-557:24, 65-557:14-2 | 1.00 | 5 | 41 |
| q08 | copropriete | Un copropriétaire peut-il faire des travaux qui touchent les parties communes ? | 65-557:25 | 65-557:9, 65-557:25, 65-557:10 | 1.00 | 5 | 70 |
| q09 | copropriete | Qu'est-ce qu'une partie commune ? | 65-557:3 | 65-557:3, 65-557:4, 65-557:6 | 1.00 | 4 | 62 |
| q10 | copropriete | Le mur entre deux appartements est-il une partie commune ? | 65-557:7 | 65-557:26, 65-557:1, 65-557:3 | 1.00 | 2 | 25 |
| q11 | copropriete | Comment sont réparties les charges de copropriété ? | 65-557:10 | 65-557:10, 65-557:9, 65-557:42 | 1.00 | 3 | 41 |
| q12 | copropriete | Le règlement de copropriété peut-il interdire la location en meublé touristique ? | 65-557:8, 65-557:9 | refus | 0.50 | 1 | 61 |
| q13 | copropriete | Puis-je refuser l'accès à mon appartement pour des travaux votés en assemblée générale ? | 65-557:9 | 65-557:42, 65-557:14-2-1, 65-557:24 | 0.00 | 3 | 56 |
| q14 | copropriete | Quel est le rôle du syndic de copropriété ? | 65-557:18 | 65-557:17, 65-557:18, 65-557:29-1 | 1.00 | 3 | 35 |
| q15 | copropriete | Quel est le rôle du conseil syndical ? | 65-557:21 | 65-557:21, 65-557:17, 65-557:18 | 1.00 | 3 | 31 |
| q16 | copropriete | Combien de pouvoirs un copropriétaire peut-il recevoir en assemblée générale ? | 65-557:22 | 65-557:22, 65-557:17, 67-223:7 | 1.00 | 3 | 41 |
| q17 | copropriete | Un copropriétaire majoritaire peut-il imposer toutes les décisions ? | 65-557:22 | 65-557:26, 65-557:25 | 1.00 | 3 | 32 |
| q18 | copropriete | Dans quel délai contester une décision d'assemblée générale ? | 65-557:42, 67-223:18 | 65-557:42, 67-223:18, 67-223:9 | 1.00 | 5 | 41 |
| q19 | copropriete | Les travaux votés peuvent-ils commencer pendant le délai de contestation ? | 65-557:42 | 65-557:42, 67-223:18, 89-462:20-1 | 1.00 | 4 | 29 |
| q20 | copropriete | Quel est le délai de convocation d'une assemblée générale de copropriété ? | 67-223:9 | 67-223:9, 65-557:18-1, 67-223:8 | 1.00 | 4 | 48 |
| q21 | copropriete | Comment faire inscrire une question à l'ordre du jour de l'assemblée générale ? | 67-223:10 | 67-223:10, 67-223:13, 67-223:8 | 1.00 | 4 | 27 |
| q22 | copropriete | Les copropriétaires peuvent-ils forcer la convocation d'une assemblée générale ? | 67-223:8 | 67-223:10, 67-223:8, 65-557:22 | 1.00 | 4 | 40 |
| q23 | copropriete | L'assemblée générale peut-elle voter sur une question qui n'est pas à l'ordre du jour ? | 67-223:13 | 67-223:11, 67-223:13, 67-223:10 | 1.00 | 4 | 39 |
| q24 | copropriete | Quels documents doivent être joints à la convocation de l'assemblée générale ? | 67-223:11 | 67-223:11, 67-223:10, 67-223:9 | 1.00 | 3 | 37 |
| q25 | copropriete | Qu'est-ce que l'état daté lors de la vente d'un lot ? | 67-223:5 | 67-223:5, 67-223:4, 65-557:8 | 1.00 | 3 | 32 |
| q26 | copropriete | Qui conserve les procès-verbaux d'assemblée générale et les archives ? | 67-223:33 | 67-223:33, 65-557:42, 65-557:18 | 1.00 | 5 | 40 |
| q27 | copropriete | Qu'est-ce que le budget prévisionnel et comment sont payées les provisions ? | 65-557:14-1 | 65-557:14-1, 67-223:5, 65-557:14-2-1 | 1.00 | 4 | 41 |
| q28 | copropriete | Quel est le montant minimum de la cotisation au fonds de travaux ? | 65-557:14-2-1 | 65-557:14-2-1, 65-557:10, 67-223:5 | 1.00 | 4 | 51 |
| q29 | copropriete | Qu'est-ce que le plan pluriannuel de travaux ? | 65-557:14-2 | 65-557:14-2, 65-557:14-2-1, 65-557:24 | 1.00 | 4 | 40 |
| q30 | copropriete | Que se passe-t-il si un copropriétaire ne paie pas ses charges ? | 65-557:19-2, 65-557:19 | 65-557:9, 65-557:19-2, 65-557:18-1 | 1.00 | 3 | 45 |
| q31 | copropriete | Quand un administrateur provisoire peut-il être désigné pour une copropriété ? | 65-557:29-1 | 65-557:29-1, 65-557:17, 65-557:14-1 | 1.00 | 5 | 35 |
| q32 | bail | Quelle est la durée minimale d'un bail de location vide ? | 89-462:10 | 89-462:10, 89-462:25-7, 89-462:22 | 1.00 | 5 | 34 |
| q33 | bail | Quel est le préavis du locataire pour quitter un logement vide ? | 89-462:15, 89-462:12 | 89-462:15, 89-462:22, 89-462:25-8 | 0.50 | 2 | 27 |
| q34 | bail | Pour quels motifs le propriétaire peut-il donner congé au locataire ? | 89-462:15 | 89-462:15, 89-462:25-8, 89-462:20-1 | 1.00 | 4 | 36 |
| q35 | bail | Quel est le montant maximum du dépôt de garantie pour une location vide ? | 89-462:22 | 89-462:22, 89-462:25-6, 89-462:3 | 1.00 | 5 | 28 |
| q36 | bail | Dans quel délai le dépôt de garantie doit-il être restitué ? | 89-462:22 | 89-462:22 | 1.00 | 2 | 33 |
| q37 | bail | Quel dépôt de garantie pour un logement meublé ? | 89-462:25-6 | 89-462:22, 89-462:25-6, 89-462:3 | 1.00 | 5 | 27 |
| q38 | bail | Quelle est la durée d'un bail meublé pour un étudiant ? | 89-462:25-7 | 89-462:25-7, 89-462:25-8 | 1.00 | 5 | 38 |
| q39 | bail | Comment est révisé le loyer chaque année ? | 89-462:17-1 | 89-462:17-1, 89-462:17-2 | 1.00 | 2 | 29 |
| q40 | bail | Quelles sont les obligations du bailleur envers son locataire ? | 89-462:6 | 89-462:6, 89-462:22-1, 89-462:7 | 1.00 | 3 | 37 |
| q41 | bail | Un logement classé G au DPE peut-il encore être loué ? | 89-462:6 | 89-462:6, 89-462:20-1, 89-462:17-2 | 1.00 | 5 | 38 |
| q42 | bail | Le locataire doit-il souscrire une assurance habitation ? | 89-462:7 | 89-462:7, 89-462:22-1, 89-462:6 | 1.00 | 5 | 34 |
| q43 | bail | Que faire si mon logement loué n'est pas décent ? | 89-462:20-1, 89-462:6 | 89-462:20-1, 89-462:6, 89-462:25-4 | 1.00 | 3 | 30 |
| q44 | bail | Le bailleur peut-il exiger une caution s'il a une assurance loyers impayés ? | 89-462:22-1 | 89-462:22-1, 89-462:7, 89-462:22 | 1.00 | 5 | 37 |
| q45 | bail | Qu'est-ce qu'un logement meublé au sens de la loi ? | 89-462:25-4 | 89-462:25-3, 89-462:25-9, 89-462:25-4 | 1.00 | 5 | 33 |
| q46 | hors-corpus | Comment sont imposés les revenus fonciers en location nue ? | — | refus | n/a | 5 | 31 |
| q47 | hors-corpus | Quelle est la recette de la blanquette de veau ? | — | refus | n/a | 5 | 39 |
| q48 | hors-corpus | Quelles sont les règles de la garde alternée des enfants après un divorce ? | — | refus | n/a | 5 | 65 |
| q49 | hors-corpus | Comment créer une SASU et quel capital minimum prévoir ? | — | refus | n/a | 5 | 29 |
| q50 | hors-corpus | Quelle est la durée d'un bail commercial 3-6-9 et comment le résilier ? | — | 89-462:25-8, 89-462:10, 89-462:25-7 | n/a | 1 | 29 |
