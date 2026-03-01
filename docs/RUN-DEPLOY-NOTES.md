# RUN / DEPLOY NOTES

## Local run
```bash
cd /Users/m/Desktop/BookBeatyapp/bookbeauty-native
npm install
npx expo start
```

## Web export
```bash
cd /Users/m/Desktop/BookBeatyapp/bookbeauty-native
npx expo export --platform web --output-dir dist
```

## Netlify
- Base directory: `bookbeauty-native`
- Build command:
```bash
npm run -s web:icons && npx expo export --platform web
```
- Publish directory: `dist`

## Validation
```bash
cd /Users/m/Desktop/BookBeatyapp/bookbeauty-native
npm run lint
```

## Notes
- Payment routes zijn afgeschermd en redirecten naar home.
- `upload-test` is nu alleen een alias terug naar `/discover`.
- Push-notification code blijft aanwezig, maar web support heeft nog steeds de bestaande Expo-limitaties.
