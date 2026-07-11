# Runtime hotfix v1.0.1

Denne oppdateringen retter serverfeilen på startsiden.

Årsaken er at appen forsøkte å opprette gjestecookie direkte i en Server Component.
Next.js tillater bare endring av cookies i en Route Handler eller Server Action.

Erstatt disse to filene:

- `src/app/page.tsx`
- `src/app/api/auth/guest/route.ts`

Commit endringene. Vercel deployer automatisk.
