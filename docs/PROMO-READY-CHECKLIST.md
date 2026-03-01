# PROMO-READY CHECKLIST

## Public marketplace
- Public home, ontdekken, stadspagina's, categoriepagina's en salonprofielen laden zonder login.
- Auth wordt alleen geopend wanneer een gebruiker wil boeken, opslaan/volgen of een account wil beheren.
- Payment-routes sturen direct terug naar home en tonen geen publieke betaalflow meer.

## Taxonomy
- Alleen vrouwen-beautycategorieen:
  - Kapper
  - Nagels
  - Wimpers
  - Wenkbrauwen
  - Make-up
  - Huid
  - Massage
  - Beauty
- Geen barber, barbier, herenkapper of mannelijke labels meer in publieke of interne UI.

## Booking UX
- Booking opent in een multi-step bottom sheet.
- Flow:
  1. Kies behandeling
  2. Kies datum en tijd
  3. Vul gegevens in (gast of account)
  4. Controleer en bevestig
- Geen betaling in Phase 1.
- Gastboeking schrijft een Firestore booking met naam, e-mail, telefoon optioneel en consent status.

## Feed
- Een item per scherm.
- Huidige video autoplayt, vorige stopt.
- Video gebruikt een gecontroleerd 9:16 frame zonder vreemde crop/zoom.
- Afbeeldingen gebruiken 4:5 in hetzelfde rustige frame.

## Signup
- Salon signup gebruikt een zes-staps onboarding.
- Nieuwe salons worden na aanmelden zichtbaar in discover met huidige auto-live logica.

## UI system
- Gedeelde theme tokens toegevoegd.
- Basis UI primitives toegevoegd:
  - Button
  - Input
  - Card
  - Sheet
  - Tabs
  - Chip
  - Skeleton
  - Toast
