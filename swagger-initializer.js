window.addEventListener("DOMContentLoaded", () => {
  window.ui = SwaggerUIBundle({
    url: "./openapi.yaml",
    dom_id: "#swagger-ui",
    deepLinking: true,
    displayOperationId: false,
    displayRequestDuration: true,
    docExpansion: "list",
    defaultModelsExpandDepth: 0,
    filter: true,
    persistAuthorization: false,
    validatorUrl: null,
    queryConfigEnabled: false,
    presets: [SwaggerUIBundle.presets.apis],
    layout: "BaseLayout"
  });
});
