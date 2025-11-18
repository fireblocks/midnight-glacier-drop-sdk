import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { config } from "./config.js";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Midnight Glacier Drop Fireblocks SDK API",
      version: "1.2.0",
      description: "API documentation for Midnight Glacier Drop Fireblocks SDK",
    },
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
