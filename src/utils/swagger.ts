import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { config } from "./config.js";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Midnight Glacier Drop Fireblocks SDK API",
      version: "2.0.0",
      description: "API documentation for Midnight Glacier Drop Fireblocks SDK",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Shared secret configured as API_AUTH_TOKEN on the server.",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    servers: [
      {
        url: `http://localhost:${config.PORT}/`,
        description: "Local server",
      },
    ],
  },
  apis: [
    "./src/api/router.ts",
    "./src/api/controllers/*.ts",
    "./src/routes/*.ts",
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
export { swaggerUi };
