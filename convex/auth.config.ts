export default {
  providers: [
    {
      // Issuer of the Clerk JWT template named "convex".
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
