// Clerk issues the JWT; Convex validates it against this issuer. Set
// CLERK_JWT_ISSUER_DOMAIN with `npx convex env set` (never commit the value).
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
