# Security

Current foundation-level configuration:

- Environment variables are validated at startup through `@cropsy/config` for the business API and
  `pydantic-settings` for the AI service. Web and mobile use local URL validators.
- `.env` is ignored by Git; `.env.example` contains local defaults only.
- The business API registers Helmet and CORS plugins.

No authentication, authorization, encryption, or threat-model implementation is included yet.
