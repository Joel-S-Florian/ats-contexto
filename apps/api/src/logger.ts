// Regla 5: sin datos personales en logs.
export const loggerOptions = {
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.email",
      "*.name",
      "*.phone",
      "*.fullName",
      "*.cvText",
    ],
    censor: "[REDACTADO]",
  },
};
